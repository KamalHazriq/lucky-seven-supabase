-- ============================================================
-- Lucky Seven — Migration 22: Structured Action Events
-- ============================================================
-- Adds structured event payloads to in-memory game logs and
-- persisted game_history rows so the frontend can react to
-- reliable machine-readable data instead of parsing English.
--
-- Backward compatibility:
-- - Human-readable msg strings are preserved
-- - Older rows without event continue to work via client fallback
-- ============================================================

ALTER TABLE public.game_history
  ADD COLUMN IF NOT EXISTS event JSONB;


CREATE OR REPLACE FUNCTION public._make_action_event(
  p_kind    TEXT,
  p_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object('kind', p_kind) || COALESCE(p_payload, '{}'::JSONB);
$$;


CREATE OR REPLACE FUNCTION public._make_log_entry(
  p_ts    BIGINT,
  p_msg   TEXT,
  p_event JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_event IS NULL THEN jsonb_build_object('ts', p_ts, 'msg', p_msg)
    ELSE jsonb_build_object('ts', p_ts, 'msg', p_msg, 'event', p_event)
  END;
$$;


DROP FUNCTION IF EXISTS public._bounded_log_append(JSONB, BIGINT, TEXT);

CREATE OR REPLACE FUNCTION public._bounded_log_append(
  p_log    JSONB,
  p_ts     BIGINT,
  p_msg    TEXT,
  p_event  JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN jsonb_array_length(p_log) >= 100
      THEN (
        SELECT jsonb_agg(elem ORDER BY rn)
        FROM (
          SELECT elem, row_number() OVER () AS rn
          FROM jsonb_array_elements(p_log) WITH ORDINALITY AS t(elem, idx)
          WHERE t.idx > 1
          UNION ALL
          SELECT public._make_log_entry(p_ts, p_msg, p_event), 9999
        ) sub
      )
      ELSE p_log || jsonb_build_array(public._make_log_entry(p_ts, p_msg, p_event))
  END;
$$;


CREATE OR REPLACE FUNCTION public._bounded_log_append(
  p_log   JSONB,
  p_entry JSONB
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT public._bounded_log_append(
    p_log,
    COALESCE((p_entry->>'ts')::BIGINT, 0),
    COALESCE(p_entry->>'msg', ''),
    p_entry->'event'
  );
$$;


CREATE OR REPLACE FUNCTION public._append_game_history(
  p_game_id UUID,
  p_ts      BIGINT,
  p_msg     TEXT,
  p_event   JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.game_history (game_id, ts, msg, event)
  VALUES (p_game_id, p_ts, p_msg, p_event);
$$;


DROP FUNCTION IF EXISTS public._apply_end_turn(UUID, UUID, JSONB, TEXT, TEXT, UUID[], INT, INT, INT, JSONB);

CREATE OR REPLACE FUNCTION public._apply_end_turn(
  p_game_id          UUID,
  p_current_player   UUID,
  p_discard_card     JSONB,
  p_log_msg          TEXT,
  p_status           TEXT,
  p_player_order     UUID[],
  p_end_round_start  INT,
  p_action_version   INT,
  p_draw_pile_count  INT,
  p_log              JSONB,
  p_event            JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now             BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_idx             INT;
  v_next_idx        INT;
  v_next_pid        UUID;
  v_should_finish   BOOLEAN := FALSE;
  v_new_status      TEXT := p_status;
  v_new_turn_pid    UUID;
  v_new_phase       TEXT := 'draw';
  v_new_turn_start  BIGINT;
  v_new_log         JSONB;
BEGIN
  v_idx := array_position(p_player_order, p_current_player);
  v_next_idx := (v_idx % array_length(p_player_order, 1)) + 1;
  v_next_pid := p_player_order[v_next_idx];

  IF p_status = 'ending' AND p_end_round_start IS NOT NULL THEN
    IF (v_next_idx - 1) = p_end_round_start THEN
      v_should_finish := TRUE;
    END IF;
  END IF;

  v_new_log := public._bounded_log_append(p_log, v_now, p_log_msg, p_event);

  IF v_should_finish THEN
    v_new_status := 'finished';
    v_new_turn_pid := NULL;
    v_new_phase := NULL;
    v_new_turn_start := 0;
  ELSIF p_draw_pile_count = 0 AND p_status != 'ending' THEN
    v_new_status := 'finished';
    v_new_turn_pid := NULL;
    v_new_phase := NULL;
    v_new_turn_start := 0;
  ELSE
    v_new_turn_pid := v_next_pid;
    v_new_turn_start := v_now;
  END IF;

  UPDATE public.games SET
    discard_top = p_discard_card,
    status = v_new_status,
    current_turn_player_id = v_new_turn_pid,
    turn_phase = v_new_phase,
    action_version = p_action_version + 1,
    last_action_at = v_now,
    turn_start_at = v_new_turn_start,
    log = v_new_log
  WHERE id = p_game_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.draw_from_pile(p_game_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      UUID := auth.uid();
  v_now      BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game     public.games%ROWTYPE;
  v_pile     JSONB;
  v_drawn    JSONB;
  v_new_pile JSONB;
  v_pname    TEXT;
  v_event    JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_game
    FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;

  IF v_game.current_turn_player_id != v_uid THEN
    RAISE EXCEPTION 'Not your turn';
  END IF;
  IF v_game.turn_phase != 'draw' THEN
    RAISE EXCEPTION 'Already drew a card';
  END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN
    RAISE EXCEPTION 'Game not active';
  END IF;

  SELECT draw_pile INTO v_pile
    FROM public.game_internal WHERE game_id = p_game_id FOR UPDATE;
  IF v_pile IS NULL OR jsonb_array_length(v_pile) = 0 THEN
    RAISE EXCEPTION 'Draw pile is empty';
  END IF;

  v_drawn := v_pile->0;
  v_new_pile := (
    SELECT COALESCE(jsonb_agg(elem), '[]'::JSONB)
    FROM jsonb_array_elements(v_pile) WITH ORDINALITY AS t(elem, idx)
    WHERE t.idx > 1
  );

  UPDATE public.game_internal SET draw_pile = v_new_pile
    WHERE game_id = p_game_id;

  UPDATE public.game_private_state SET
    drawn_card = v_drawn,
    drawn_card_source = 'pile'
  WHERE game_id = p_game_id AND player_id = v_uid;

  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;
  UPDATE public.game_players SET afk_strikes = 0
    WHERE game_id = p_game_id AND player_id = v_uid;

  v_event := public._make_action_event('draw_pile', jsonb_build_object('actorId', v_uid::TEXT));
  PERFORM public._append_game_history(p_game_id, v_now, v_pname || ' drew from the pile', v_event);

  UPDATE public.games SET
    draw_pile_count = jsonb_array_length(v_new_pile),
    turn_phase = 'action',
    action_version = v_game.action_version + 1,
    last_action_at = v_now,
    log = public._bounded_log_append(v_game.log, v_now, v_pname || ' drew from the pile', v_event)
  WHERE id = p_game_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.take_from_discard(p_game_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_now   BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game  public.games%ROWTYPE;
  v_pname TEXT;
  v_event JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_game
    FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;

  IF v_game.current_turn_player_id != v_uid THEN
    RAISE EXCEPTION 'Not your turn';
  END IF;
  IF v_game.turn_phase != 'draw' THEN
    RAISE EXCEPTION 'Already drew a card';
  END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN
    RAISE EXCEPTION 'Game not active';
  END IF;
  IF v_game.discard_top IS NULL THEN
    RAISE EXCEPTION 'No discard card';
  END IF;

  UPDATE public.game_private_state SET
    drawn_card = v_game.discard_top,
    drawn_card_source = 'discard'
  WHERE game_id = p_game_id AND player_id = v_uid;

  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;
  UPDATE public.game_players SET afk_strikes = 0
    WHERE game_id = p_game_id AND player_id = v_uid;

  v_event := public._make_action_event('take_discard', jsonb_build_object('actorId', v_uid::TEXT));
  PERFORM public._append_game_history(p_game_id, v_now, v_pname || ' took from discard', v_event);

  UPDATE public.games SET
    discard_top = NULL,
    turn_phase = 'action',
    action_version = v_game.action_version + 1,
    last_action_at = v_now,
    log = public._bounded_log_append(v_game.log, v_now, v_pname || ' took from discard', v_event)
  WHERE id = p_game_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.cancel_draw(p_game_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_now    BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game   public.games%ROWTYPE;
  v_priv   public.game_private_state%ROWTYPE;
  v_pname  TEXT;
  v_event  JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_game
    FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;

  IF v_game.current_turn_player_id != v_uid THEN
    RAISE EXCEPTION 'Not your turn';
  END IF;
  IF v_game.turn_phase != 'action' THEN
    RAISE EXCEPTION 'Not in action phase';
  END IF;

  SELECT * INTO v_priv
    FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid
    FOR UPDATE;

  IF v_priv.drawn_card IS NULL THEN
    RAISE EXCEPTION 'No drawn card to cancel';
  END IF;
  IF v_priv.drawn_card_source IS NULL THEN
    RAISE EXCEPTION 'Cannot determine draw source';
  END IF;
  IF v_priv.drawn_card_source = 'pile' THEN
    RAISE EXCEPTION 'Cannot undo a draw from the pile. You must swap, discard, or use a power.';
  END IF;

  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;

  UPDATE public.game_private_state SET
    drawn_card = NULL,
    drawn_card_source = NULL
  WHERE game_id = p_game_id AND player_id = v_uid;

  v_event := public._make_action_event('cancel_draw', jsonb_build_object('actorId', v_uid::TEXT));
  PERFORM public._append_game_history(p_game_id, v_now, v_pname || ' returned the card to discard', v_event);

  UPDATE public.games SET
    discard_top = v_priv.drawn_card,
    turn_phase = 'draw',
    action_version = v_game.action_version + 1,
    last_action_at = v_now,
    log = public._bounded_log_append(v_game.log, v_now, v_pname || ' returned the card to discard', v_event)
  WHERE id = p_game_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.swap_with_slot(
  p_game_id    UUID,
  p_slot_index INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_now       BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game      public.games%ROWTYPE;
  v_priv      public.game_private_state%ROWTYPE;
  v_locks     BOOLEAN[];
  v_pname     TEXT;
  v_old_card  JSONB;
  v_new_hand  JSONB;
  v_new_known JSONB;
  v_msg       TEXT;
  v_event     JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_game
    FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;

  IF v_game.current_turn_player_id != v_uid THEN
    RAISE EXCEPTION 'Not your turn';
  END IF;
  IF v_game.turn_phase != 'action' THEN
    RAISE EXCEPTION 'Must draw first';
  END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN
    RAISE EXCEPTION 'Game not active';
  END IF;

  SELECT * INTO v_priv
    FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid
    FOR UPDATE;

  IF v_priv.drawn_card IS NULL THEN
    RAISE EXCEPTION 'No drawn card';
  END IF;

  IF p_slot_index < 0 OR p_slot_index >= jsonb_array_length(v_priv.hand) THEN
    RAISE EXCEPTION 'Invalid slot';
  END IF;

  SELECT locks, display_name INTO v_locks, v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;
  IF v_locks[p_slot_index + 1] THEN
    RAISE EXCEPTION 'That card is locked!';
  END IF;

  v_old_card := v_priv.hand->p_slot_index;

  SELECT jsonb_agg(
    CASE WHEN idx = p_slot_index + 1 THEN v_priv.drawn_card ELSE elem END
  ) INTO v_new_hand
  FROM jsonb_array_elements(v_priv.hand) WITH ORDINALITY AS t(elem, idx);

  v_new_known := v_priv.known || jsonb_build_object(p_slot_index::TEXT, v_priv.drawn_card);

  UPDATE public.game_private_state SET
    hand = v_new_hand,
    drawn_card = NULL,
    drawn_card_source = NULL,
    known = v_new_known
  WHERE game_id = p_game_id AND player_id = v_uid;

  PERFORM public._invalidate_opp_known_slot(p_game_id, v_uid, p_slot_index);

  UPDATE public.game_players SET afk_strikes = 0
    WHERE game_id = p_game_id AND player_id = v_uid;

  v_msg := v_pname || ' swapped their card #' || (p_slot_index + 1)::TEXT;
  v_event := public._make_action_event(
    'swap_slot',
    jsonb_build_object('actorId', v_uid::TEXT, 'slotIndex', p_slot_index)
  );

  PERFORM public._append_game_history(p_game_id, v_now, v_msg, v_event);
  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_old_card, v_msg,
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index,
    v_game.action_version, v_game.draw_pile_count,
    v_game.log, v_event
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.discard_drawn(p_game_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_now    BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game   public.games%ROWTYPE;
  v_priv   public.game_private_state%ROWTYPE;
  v_pname  TEXT;
  v_msg    TEXT;
  v_event  JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_game
    FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;

  IF v_game.current_turn_player_id != v_uid THEN
    RAISE EXCEPTION 'Not your turn';
  END IF;
  IF v_game.turn_phase != 'action' THEN
    RAISE EXCEPTION 'Must draw first';
  END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN
    RAISE EXCEPTION 'Game not active';
  END IF;

  SELECT * INTO v_priv
    FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid
    FOR UPDATE;

  IF v_priv.drawn_card IS NULL THEN
    RAISE EXCEPTION 'No drawn card';
  END IF;

  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;

  UPDATE public.game_private_state SET
    drawn_card = NULL,
    drawn_card_source = NULL
  WHERE game_id = p_game_id AND player_id = v_uid;

  UPDATE public.game_players SET afk_strikes = 0
    WHERE game_id = p_game_id AND player_id = v_uid;

  v_msg := v_pname || ' discarded';
  v_event := public._make_action_event('discard_drawn', jsonb_build_object('actorId', v_uid::TEXT));

  PERFORM public._append_game_history(p_game_id, v_now, v_msg, v_event);
  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_priv.drawn_card, v_msg,
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index,
    v_game.action_version, v_game.draw_pile_count,
    v_game.log, v_event
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.use_peek_one(
  p_game_id    UUID,
  p_slot_index INT,
  p_no_memory  BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_now       BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game      public.games%ROWTYPE;
  v_priv      public.game_private_state%ROWTYPE;
  v_locks     BOOLEAN[];
  v_pname     TEXT;
  v_rank_key  TEXT;
  v_peeked    JSONB;
  v_new_known JSONB;
  v_msg       TEXT;
  v_event     JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.current_turn_player_id != v_uid THEN RAISE EXCEPTION 'Not your turn'; END IF;
  IF v_game.turn_phase != 'action' THEN RAISE EXCEPTION 'Must draw first'; END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN RAISE EXCEPTION 'Game not active'; END IF;

  SELECT * INTO v_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid FOR UPDATE;
  IF v_priv.drawn_card IS NULL THEN RAISE EXCEPTION 'No drawn card'; END IF;

  SELECT locks, display_name INTO v_locks, v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;

  v_rank_key := public._assert_power_effect(
    v_game.settings, v_game.spent_power_card_ids,
    v_priv.drawn_card, 'peek_one_of_your_cards'
  );

  IF v_locks[p_slot_index + 1] THEN RAISE EXCEPTION 'That card is locked!'; END IF;

  v_peeked := v_priv.hand->p_slot_index;

  IF p_no_memory THEN
    UPDATE public.game_private_state SET
      drawn_card = NULL, drawn_card_source = NULL
    WHERE game_id = p_game_id AND player_id = v_uid;
  ELSE
    v_new_known := v_priv.known || jsonb_build_object(p_slot_index::TEXT, v_peeked);
    UPDATE public.game_private_state SET
      drawn_card = NULL, drawn_card_source = NULL, known = v_new_known
    WHERE game_id = p_game_id AND player_id = v_uid;
  END IF;

  v_msg := v_pname || ' used ' || v_rank_key || ' as peek_one';
  v_event := public._make_action_event(
    'power_peek',
    jsonb_build_object('actorId', v_uid::TEXT, 'variant', 'self_one', 'slotIndex', p_slot_index)
  );

  PERFORM public._append_game_history(p_game_id, v_now, v_msg, v_event);
  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_priv.drawn_card, v_msg,
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index, v_game.action_version,
    v_game.draw_pile_count, v_game.log, v_event
  );
  UPDATE public.games SET spent_power_card_ids = spent_power_card_ids || ARRAY[v_priv.drawn_card->>'id']
    WHERE id = p_game_id;

  RETURN v_peeked;
END;
$$;


CREATE OR REPLACE FUNCTION public.use_peek_all(
  p_game_id   UUID,
  p_no_memory BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_now       BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game      public.games%ROWTYPE;
  v_priv      public.game_private_state%ROWTYPE;
  v_locks     BOOLEAN[];
  v_pname     TEXT;
  v_rank_key  TEXT;
  v_revealed  JSONB := '{}'::JSONB;
  v_new_known JSONB;
  v_card      JSONB;
  v_cpp       INT;
  v_i         INT;
  v_msg       TEXT;
  v_event     JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.current_turn_player_id != v_uid THEN RAISE EXCEPTION 'Not your turn'; END IF;
  IF v_game.turn_phase != 'action' THEN RAISE EXCEPTION 'Must draw first'; END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN RAISE EXCEPTION 'Game not active'; END IF;

  SELECT * INTO v_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid FOR UPDATE;
  IF v_priv.drawn_card IS NULL THEN RAISE EXCEPTION 'No drawn card'; END IF;

  SELECT locks, display_name INTO v_locks, v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;

  v_rank_key := public._assert_power_effect(
    v_game.settings, v_game.spent_power_card_ids,
    v_priv.drawn_card, 'peek_all_three_of_your_cards'
  );

  v_cpp := COALESCE((v_game.settings->>'cardsPerPlayer')::INT, 3);
  IF v_cpp NOT IN (3, 4) THEN v_cpp := 3; END IF;

  v_new_known := v_priv.known;
  FOR v_i IN 0..(v_cpp - 1) LOOP
    IF NOT v_locks[v_i + 1] THEN
      v_card := v_priv.hand->v_i;
      IF NOT p_no_memory THEN
        v_new_known := v_new_known || jsonb_build_object(v_i::TEXT, v_card);
      END IF;
      v_revealed := v_revealed || jsonb_build_object(v_i::TEXT, v_card);
    END IF;
  END LOOP;

  IF p_no_memory THEN
    UPDATE public.game_private_state SET
      drawn_card = NULL, drawn_card_source = NULL
    WHERE game_id = p_game_id AND player_id = v_uid;
  ELSE
    UPDATE public.game_private_state SET
      drawn_card = NULL, drawn_card_source = NULL, known = v_new_known
    WHERE game_id = p_game_id AND player_id = v_uid;
  END IF;

  v_msg := v_pname || ' used ' || v_rank_key || ' as peek_all';
  v_event := public._make_action_event(
    'power_peek',
    jsonb_build_object('actorId', v_uid::TEXT, 'variant', 'self_all')
  );

  PERFORM public._append_game_history(p_game_id, v_now, v_msg, v_event);
  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_priv.drawn_card, v_msg,
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index, v_game.action_version,
    v_game.draw_pile_count, v_game.log, v_event
  );
  UPDATE public.games SET spent_power_card_ids = spent_power_card_ids || ARRAY[v_priv.drawn_card->>'id']
    WHERE id = p_game_id;

  RETURN v_revealed;
END;
$$;


DROP FUNCTION IF EXISTS public.use_peek_opponent(UUID, UUID, INT);
DROP FUNCTION IF EXISTS public.use_peek_opponent(UUID, UUID, INT, BOOLEAN);

CREATE FUNCTION public.use_peek_opponent(
  p_game_id       UUID,
  p_target_player UUID,
  p_slot_index    INT,
  p_no_memory     BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_now         BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game        public.games%ROWTYPE;
  v_priv        public.game_private_state%ROWTYPE;
  v_pname       TEXT;
  v_rank_key    TEXT;
  v_target_priv public.game_private_state%ROWTYPE;
  v_target_locks BOOLEAN[];
  v_target_name TEXT;
  v_peeked      JSONB;
  v_msg         TEXT;
  v_event       JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.current_turn_player_id != v_uid THEN RAISE EXCEPTION 'Not your turn'; END IF;
  IF v_game.turn_phase != 'action' THEN RAISE EXCEPTION 'Must draw first'; END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN RAISE EXCEPTION 'Game not active'; END IF;

  SELECT * INTO v_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid FOR UPDATE;
  IF v_priv.drawn_card IS NULL THEN RAISE EXCEPTION 'No drawn card'; END IF;

  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;

  IF NOT COALESCE((v_game.settings->>'peekAllowsOpponent')::BOOLEAN, TRUE) THEN
    RAISE EXCEPTION 'Peek opponent is not enabled';
  END IF;
  v_rank_key := public._assert_peek_power(
    v_game.settings, v_game.spent_power_card_ids, v_priv.drawn_card
  );

  IF p_target_player = v_uid THEN
    RAISE EXCEPTION 'Cannot peek your own card — use Peek instead';
  END IF;

  SELECT locks, display_name INTO v_target_locks, v_target_name
    FROM public.game_players WHERE game_id = p_game_id AND player_id = p_target_player;
  IF v_target_locks[p_slot_index + 1] THEN RAISE EXCEPTION 'That card is locked!'; END IF;

  SELECT * INTO v_target_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = p_target_player;

  v_peeked := v_target_priv.hand->p_slot_index;

  IF NOT p_no_memory THEN
    UPDATE public.game_private_state
    SET opponent_known = jsonb_set(
      opponent_known,
      ARRAY[p_target_player::TEXT, p_slot_index::TEXT],
      v_peeked
    )
    WHERE game_id = p_game_id AND player_id = v_uid;
  END IF;

  UPDATE public.game_private_state SET drawn_card = NULL, drawn_card_source = NULL
    WHERE game_id = p_game_id AND player_id = v_uid;

  v_msg := v_pname || ' used ' || v_rank_key || ' as peek_opponent: ' || v_target_name || '''s #' || (p_slot_index + 1)::TEXT;
  v_event := public._make_action_event(
    'power_peek',
    jsonb_build_object(
      'actorId', v_uid::TEXT,
      'variant', 'opponent_one',
      'targetPlayerId', p_target_player::TEXT,
      'slotIndex', p_slot_index
    )
  );

  PERFORM public._append_game_history(p_game_id, v_now, v_msg, v_event);
  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_priv.drawn_card, v_msg,
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index, v_game.action_version,
    v_game.draw_pile_count, v_game.log, v_event
  );
  UPDATE public.games SET spent_power_card_ids = spent_power_card_ids || ARRAY[v_priv.drawn_card->>'id']
    WHERE id = p_game_id;

  RETURN jsonb_build_object('card', v_peeked, 'playerName', v_target_name);
END;
$$;


DROP FUNCTION IF EXISTS public.use_peek_all_opponent(UUID, UUID);
DROP FUNCTION IF EXISTS public.use_peek_all_opponent(UUID, UUID, BOOLEAN);

CREATE FUNCTION public.use_peek_all_opponent(
  p_game_id       UUID,
  p_target_player UUID,
  p_no_memory     BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_now         BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game        public.games%ROWTYPE;
  v_priv        public.game_private_state%ROWTYPE;
  v_pname       TEXT;
  v_rank_key    TEXT;
  v_target_priv public.game_private_state%ROWTYPE;
  v_target_locks BOOLEAN[];
  v_target_name TEXT;
  v_revealed    JSONB := '{}'::JSONB;
  v_new_opp_known JSONB;
  v_cpp         INT;
  v_msg         TEXT;
  v_i           INT;
  v_event       JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.current_turn_player_id != v_uid THEN RAISE EXCEPTION 'Not your turn'; END IF;
  IF v_game.turn_phase != 'action' THEN RAISE EXCEPTION 'Must draw first'; END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN RAISE EXCEPTION 'Game not active'; END IF;

  SELECT * INTO v_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid FOR UPDATE;
  IF v_priv.drawn_card IS NULL THEN RAISE EXCEPTION 'No drawn card'; END IF;

  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;

  IF NOT COALESCE((v_game.settings->>'peekAllowsOpponent')::BOOLEAN, TRUE) THEN
    RAISE EXCEPTION 'Peek opponent is not enabled';
  END IF;
  v_rank_key := public._assert_power_effect(
    v_game.settings, v_game.spent_power_card_ids,
    v_priv.drawn_card, 'peek_all_three_of_your_cards'
  );

  IF p_target_player = v_uid THEN
    RAISE EXCEPTION 'Cannot peek your own cards — use Peek All instead';
  END IF;

  SELECT locks, display_name INTO v_target_locks, v_target_name
    FROM public.game_players WHERE game_id = p_game_id AND player_id = p_target_player;
  SELECT * INTO v_target_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = p_target_player;

  v_cpp := COALESCE((v_game.settings->>'cardsPerPlayer')::INT, 3);
  IF v_cpp NOT IN (3, 4) THEN v_cpp := 3; END IF;

  FOR v_i IN 0..(v_cpp - 1) LOOP
    IF NOT v_target_locks[v_i + 1] THEN
      v_revealed := v_revealed || jsonb_build_object(v_i::TEXT, v_target_priv.hand->v_i);
    END IF;
  END LOOP;

  IF NOT p_no_memory THEN
    v_new_opp_known := COALESCE(v_priv.opponent_known->p_target_player::TEXT, '{}') || v_revealed;
    UPDATE public.game_private_state
    SET opponent_known = jsonb_set(
      opponent_known,
      ARRAY[p_target_player::TEXT],
      v_new_opp_known
    )
    WHERE game_id = p_game_id AND player_id = v_uid;
  END IF;

  UPDATE public.game_private_state SET drawn_card = NULL, drawn_card_source = NULL
    WHERE game_id = p_game_id AND player_id = v_uid;

  v_msg := v_pname || ' used ' || v_rank_key || ' as peek_all_opponent: ' || v_target_name || '''s cards';
  v_event := public._make_action_event(
    'power_peek',
    jsonb_build_object(
      'actorId', v_uid::TEXT,
      'variant', 'opponent_all',
      'targetPlayerId', p_target_player::TEXT
    )
  );

  PERFORM public._append_game_history(p_game_id, v_now, v_msg, v_event);
  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_priv.drawn_card, v_msg,
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index, v_game.action_version,
    v_game.draw_pile_count, v_game.log, v_event
  );
  UPDATE public.games SET spent_power_card_ids = spent_power_card_ids || ARRAY[v_priv.drawn_card->>'id']
    WHERE id = p_game_id;

  RETURN jsonb_build_object('cards', v_revealed, 'playerName', v_target_name, 'locks', to_jsonb(v_target_locks));
END;
$$;


CREATE OR REPLACE FUNCTION public.use_swap_power(
  p_game_id UUID,
  p_a_player UUID, p_a_slot INT,
  p_b_player UUID, p_b_slot INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid        UUID := auth.uid();
  v_now        BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game       public.games%ROWTYPE;
  v_priv       public.game_private_state%ROWTYPE;
  v_pname      TEXT;
  v_rank_key   TEXT;
  v_a_locks    BOOLEAN[];
  v_b_locks    BOOLEAN[];
  v_a_name     TEXT;
  v_b_name     TEXT;
  v_priv_a     public.game_private_state%ROWTYPE;
  v_priv_b     public.game_private_state%ROWTYPE;
  v_card_a     JSONB;
  v_card_b     JSONB;
  v_new_hand   JSONB;
  v_new_known  JSONB;
  v_new_hand_a JSONB;
  v_new_hand_b JSONB;
  v_new_known_a JSONB;
  v_new_known_b JSONB;
  v_msg        TEXT;
  v_event      JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.current_turn_player_id != v_uid THEN RAISE EXCEPTION 'Not your turn'; END IF;
  IF v_game.turn_phase != 'action' THEN RAISE EXCEPTION 'Must draw first'; END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN RAISE EXCEPTION 'Game not active'; END IF;

  SELECT * INTO v_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid FOR UPDATE;
  IF v_priv.drawn_card IS NULL THEN RAISE EXCEPTION 'No drawn card'; END IF;

  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;

  v_rank_key := public._assert_power_effect(
    v_game.settings, v_game.spent_power_card_ids,
    v_priv.drawn_card, 'swap_one_to_one'
  );

  SELECT locks, display_name INTO v_a_locks, v_a_name
    FROM public.game_players WHERE game_id = p_game_id AND player_id = p_a_player;
  SELECT locks, display_name INTO v_b_locks, v_b_name
    FROM public.game_players WHERE game_id = p_game_id AND player_id = p_b_player;
  IF v_a_locks[p_a_slot + 1] THEN RAISE EXCEPTION 'Card A is locked'; END IF;
  IF v_b_locks[p_b_slot + 1] THEN RAISE EXCEPTION 'Card B is locked'; END IF;

  SELECT * INTO v_priv_a FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = p_a_player FOR UPDATE;
  SELECT * INTO v_priv_b FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = p_b_player FOR UPDATE;

  v_card_a := v_priv_a.hand->p_a_slot;
  v_card_b := v_priv_b.hand->p_b_slot;

  IF p_a_player = p_b_player THEN
    SELECT jsonb_agg(
      CASE
        WHEN idx = p_a_slot + 1 THEN v_card_b
        WHEN idx = p_b_slot + 1 THEN v_card_a
        ELSE elem
      END
    ) INTO v_new_hand
    FROM jsonb_array_elements(v_priv_a.hand) WITH ORDINALITY AS t(elem, idx);

    v_new_known := v_priv_a.known;
    IF v_new_known ? p_a_slot::TEXT AND v_new_known ? p_b_slot::TEXT THEN
      v_new_known := (v_new_known - p_a_slot::TEXT - p_b_slot::TEXT)
        || jsonb_build_object(p_a_slot::TEXT, v_priv_a.known->p_b_slot::TEXT)
        || jsonb_build_object(p_b_slot::TEXT, v_priv_a.known->p_a_slot::TEXT);
    ELSIF v_new_known ? p_a_slot::TEXT THEN
      v_new_known := (v_new_known - p_a_slot::TEXT)
        || jsonb_build_object(p_b_slot::TEXT, v_priv_a.known->p_a_slot::TEXT);
    ELSIF v_new_known ? p_b_slot::TEXT THEN
      v_new_known := (v_new_known - p_b_slot::TEXT)
        || jsonb_build_object(p_a_slot::TEXT, v_priv_a.known->p_b_slot::TEXT);
    END IF;

    UPDATE public.game_private_state SET hand = v_new_hand, known = v_new_known
      WHERE game_id = p_game_id AND player_id = p_a_player;

    PERFORM public._invalidate_opp_known_slot(p_game_id, p_a_player, p_a_slot);
    PERFORM public._invalidate_opp_known_slot(p_game_id, p_a_player, p_b_slot);
  ELSE
    SELECT jsonb_agg(
      CASE WHEN idx = p_a_slot + 1 THEN v_card_b ELSE elem END
    ) INTO v_new_hand_a
    FROM jsonb_array_elements(v_priv_a.hand) WITH ORDINALITY AS t(elem, idx);
    v_new_known_a := v_priv_a.known - p_a_slot::TEXT;

    SELECT jsonb_agg(
      CASE WHEN idx = p_b_slot + 1 THEN v_card_a ELSE elem END
    ) INTO v_new_hand_b
    FROM jsonb_array_elements(v_priv_b.hand) WITH ORDINALITY AS t(elem, idx);
    v_new_known_b := v_priv_b.known - p_b_slot::TEXT;

    UPDATE public.game_private_state SET hand = v_new_hand_a, known = v_new_known_a
      WHERE game_id = p_game_id AND player_id = p_a_player;
    UPDATE public.game_private_state SET hand = v_new_hand_b, known = v_new_known_b
      WHERE game_id = p_game_id AND player_id = p_b_player;

    PERFORM public._invalidate_opp_known_slot(p_game_id, p_a_player, p_a_slot);
    PERFORM public._invalidate_opp_known_slot(p_game_id, p_b_player, p_b_slot);
  END IF;

  UPDATE public.game_private_state SET drawn_card = NULL, drawn_card_source = NULL
    WHERE game_id = p_game_id AND player_id = v_uid;

  v_msg := v_pname || ' used ' || v_rank_key || ' as swap: ' || v_a_name || '''s #' || (p_a_slot+1)::TEXT || ' <-> ' || v_b_name || '''s #' || (p_b_slot+1)::TEXT;
  v_event := public._make_action_event(
    'power_swap',
    jsonb_build_object(
      'actorId', v_uid::TEXT,
      'first', jsonb_build_object('playerId', p_a_player::TEXT, 'slotIndex', p_a_slot),
      'second', jsonb_build_object('playerId', p_b_player::TEXT, 'slotIndex', p_b_slot)
    )
  );

  PERFORM public._append_game_history(p_game_id, v_now, v_msg, v_event);
  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_priv.drawn_card, v_msg,
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index, v_game.action_version,
    v_game.draw_pile_count, v_game.log, v_event
  );
  UPDATE public.games SET spent_power_card_ids = spent_power_card_ids || ARRAY[v_priv.drawn_card->>'id']
    WHERE id = p_game_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.use_lock(
  p_game_id       UUID,
  p_target_player UUID,
  p_slot_index    INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_now         BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game        public.games%ROWTYPE;
  v_priv        public.game_private_state%ROWTYPE;
  v_pname       TEXT;
  v_rank_key    TEXT;
  v_t_locks     BOOLEAN[];
  v_t_locked_by JSONB;
  v_t_name      TEXT;
  v_msg         TEXT;
  v_event       JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.current_turn_player_id != v_uid THEN RAISE EXCEPTION 'Not your turn'; END IF;
  IF v_game.turn_phase != 'action' THEN RAISE EXCEPTION 'Must draw first'; END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN RAISE EXCEPTION 'Game not active'; END IF;

  SELECT * INTO v_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid FOR UPDATE;
  IF v_priv.drawn_card IS NULL THEN RAISE EXCEPTION 'No drawn card'; END IF;

  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;

  v_rank_key := public._assert_power_effect(
    v_game.settings, v_game.spent_power_card_ids,
    v_priv.drawn_card, 'lock_one_card'
  );

  SELECT locks, locked_by, display_name INTO v_t_locks, v_t_locked_by, v_t_name
    FROM public.game_players WHERE game_id = p_game_id AND player_id = p_target_player;
  IF v_t_locks[p_slot_index + 1] THEN RAISE EXCEPTION 'Already locked'; END IF;

  v_t_locks[p_slot_index + 1] := TRUE;
  v_t_locked_by := jsonb_set(
    v_t_locked_by,
    ARRAY[(p_slot_index)::TEXT],
    jsonb_build_object('lockerId', v_uid::TEXT, 'lockerName', v_pname)
  );

  UPDATE public.game_players SET locks = v_t_locks, locked_by = v_t_locked_by
    WHERE game_id = p_game_id AND player_id = p_target_player;

  UPDATE public.game_private_state SET drawn_card = NULL, drawn_card_source = NULL
    WHERE game_id = p_game_id AND player_id = v_uid;

  v_msg := v_pname || ' used ' || v_rank_key || ' as lock on '
    || CASE WHEN p_target_player = v_uid THEN 'their own' ELSE v_t_name || '''s' END
    || ' card #' || (p_slot_index + 1)::TEXT;
  v_event := public._make_action_event(
    'power_lock',
    jsonb_build_object(
      'actorId', v_uid::TEXT,
      'target', jsonb_build_object('playerId', p_target_player::TEXT, 'slotIndex', p_slot_index)
    )
  );

  PERFORM public._append_game_history(p_game_id, v_now, v_msg, v_event);
  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_priv.drawn_card, v_msg,
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index, v_game.action_version,
    v_game.draw_pile_count, v_game.log, v_event
  );
  UPDATE public.games SET spent_power_card_ids = spent_power_card_ids || ARRAY[v_priv.drawn_card->>'id']
    WHERE id = p_game_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.use_unlock(
  p_game_id       UUID,
  p_target_player UUID,
  p_slot_index    INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_now         BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game        public.games%ROWTYPE;
  v_priv        public.game_private_state%ROWTYPE;
  v_pname       TEXT;
  v_rank_key    TEXT;
  v_t_locks     BOOLEAN[];
  v_t_locked_by JSONB;
  v_t_name      TEXT;
  v_is_locked   BOOLEAN;
  v_msg         TEXT;
  v_event       JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.current_turn_player_id != v_uid THEN RAISE EXCEPTION 'Not your turn'; END IF;
  IF v_game.turn_phase != 'action' THEN RAISE EXCEPTION 'Must draw first'; END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN RAISE EXCEPTION 'Game not active'; END IF;

  SELECT * INTO v_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid FOR UPDATE;
  IF v_priv.drawn_card IS NULL THEN RAISE EXCEPTION 'No drawn card'; END IF;

  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;

  v_rank_key := public._assert_power_effect(
    v_game.settings, v_game.spent_power_card_ids,
    v_priv.drawn_card, 'unlock_one_locked_card'
  );

  SELECT locks, locked_by, display_name INTO v_t_locks, v_t_locked_by, v_t_name
    FROM public.game_players WHERE game_id = p_game_id AND player_id = p_target_player;

  v_is_locked := v_t_locks[p_slot_index + 1];

  IF v_is_locked THEN
    v_t_locks[p_slot_index + 1] := FALSE;
    v_t_locked_by := jsonb_set(v_t_locked_by, ARRAY[(p_slot_index)::TEXT], 'null'::JSONB);
    UPDATE public.game_players SET locks = v_t_locks, locked_by = v_t_locked_by
      WHERE game_id = p_game_id AND player_id = p_target_player;
  END IF;

  UPDATE public.game_private_state SET drawn_card = NULL, drawn_card_source = NULL
    WHERE game_id = p_game_id AND player_id = v_uid;

  IF v_is_locked THEN
    v_msg := v_pname || ' used ' || v_rank_key || ' as unlock on '
      || CASE WHEN p_target_player = v_uid THEN 'their own' ELSE v_t_name || '''s' END
      || ' card #' || (p_slot_index + 1)::TEXT;
    v_event := public._make_action_event(
      'power_unlock',
      jsonb_build_object(
        'actorId', v_uid::TEXT,
        'fizzled', FALSE,
        'target', jsonb_build_object('playerId', p_target_player::TEXT, 'slotIndex', p_slot_index)
      )
    );
  ELSE
    v_msg := v_pname || ' used ' || v_rank_key || ' as unlock but no card was locked (power fizzled)';
    v_event := public._make_action_event(
      'power_unlock',
      jsonb_build_object('actorId', v_uid::TEXT, 'fizzled', TRUE, 'target', NULL)
    );
  END IF;

  PERFORM public._append_game_history(p_game_id, v_now, v_msg, v_event);
  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_priv.drawn_card, v_msg,
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index, v_game.action_version,
    v_game.draw_pile_count, v_game.log, v_event
  );
  UPDATE public.games SET spent_power_card_ids = spent_power_card_ids || ARRAY[v_priv.drawn_card->>'id']
    WHERE id = p_game_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.use_rearrange(
  p_game_id       UUID,
  p_target_player UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_now       BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game      public.games%ROWTYPE;
  v_priv      public.game_private_state%ROWTYPE;
  v_pname     TEXT;
  v_rank_key  TEXT;
  v_t_locks   BOOLEAN[];
  v_t_name    TEXT;
  v_t_priv    public.game_private_state%ROWTYPE;
  v_unlocked  INT[];
  v_cards     JSONB[];
  v_temp      JSONB;
  v_j         INT;
  v_new_hand  JSONB;
  v_new_known JSONB;
  v_cpp       INT;
  v_msg       TEXT;
  v_i         INT;
  v_event     JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.current_turn_player_id != v_uid THEN RAISE EXCEPTION 'Not your turn'; END IF;
  IF v_game.turn_phase != 'action' THEN RAISE EXCEPTION 'Must draw first'; END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN RAISE EXCEPTION 'Game not active'; END IF;

  SELECT * INTO v_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid FOR UPDATE;
  IF v_priv.drawn_card IS NULL THEN RAISE EXCEPTION 'No drawn card'; END IF;

  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;

  v_rank_key := public._assert_power_effect(
    v_game.settings, v_game.spent_power_card_ids,
    v_priv.drawn_card, 'rearrange_cards'
  );

  IF p_target_player = v_uid THEN
    RAISE EXCEPTION 'Cannot rearrange your own cards';
  END IF;

  SELECT locks, display_name INTO v_t_locks, v_t_name
    FROM public.game_players WHERE game_id = p_game_id AND player_id = p_target_player;
  SELECT * INTO v_t_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = p_target_player FOR UPDATE;

  v_cpp := COALESCE((v_game.settings->>'cardsPerPlayer')::INT, 3);
  IF v_cpp NOT IN (3, 4) THEN v_cpp := 3; END IF;

  v_unlocked := '{}';
  FOR v_i IN 0..(v_cpp - 1) LOOP
    IF NOT v_t_locks[v_i + 1] THEN
      v_unlocked := v_unlocked || v_i;
    END IF;
  END LOOP;

  IF array_length(v_unlocked, 1) > 1 THEN
    v_cards := '{}';
    FOR v_i IN 1..array_length(v_unlocked, 1) LOOP
      v_cards := v_cards || (v_t_priv.hand->(v_unlocked[v_i]));
    END LOOP;

    FOR v_i IN REVERSE array_length(v_cards, 1)..2 LOOP
      v_j := 1 + floor(random() * v_i)::INT;
      v_temp := v_cards[v_i];
      v_cards[v_i] := v_cards[v_j];
      v_cards[v_j] := v_temp;
    END LOOP;

    v_new_hand := v_t_priv.hand;
    FOR v_i IN 1..array_length(v_unlocked, 1) LOOP
      v_new_hand := jsonb_set(v_new_hand, ARRAY[(v_unlocked[v_i])::TEXT], v_cards[v_i]);
    END LOOP;

    v_new_known := v_t_priv.known;
    FOR v_i IN 1..array_length(v_unlocked, 1) LOOP
      v_new_known := v_new_known - (v_unlocked[v_i])::TEXT;
    END LOOP;

    UPDATE public.game_private_state SET hand = v_new_hand, known = v_new_known
      WHERE game_id = p_game_id AND player_id = p_target_player;

    PERFORM public._invalidate_opp_known_player(p_game_id, p_target_player);
  END IF;

  UPDATE public.game_private_state SET drawn_card = NULL, drawn_card_source = NULL
    WHERE game_id = p_game_id AND player_id = v_uid;

  v_msg := v_pname || ' used ' || v_rank_key || ' as rearrange on ' || v_t_name || '''s cards!';
  v_event := public._make_action_event(
    'power_rearrange',
    jsonb_build_object('actorId', v_uid::TEXT, 'targetPlayerId', p_target_player::TEXT)
  );

  PERFORM public._append_game_history(p_game_id, v_now, v_msg, v_event);
  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_priv.drawn_card, v_msg,
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index, v_game.action_version,
    v_game.draw_pile_count, v_game.log, v_event
  );
  UPDATE public.games SET spent_power_card_ids = spent_power_card_ids || ARRAY[v_priv.drawn_card->>'id']
    WHERE id = p_game_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.call_end(p_game_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_now    BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game   public.games%ROWTYPE;
  v_pname  TEXT;
  v_idx    INT;
  v_msg    TEXT;
  v_event  JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.current_turn_player_id != v_uid THEN
    RAISE EXCEPTION 'Only the current turn player can call End';
  END IF;
  IF v_game.status != 'active' THEN RAISE EXCEPTION 'Game not active'; END IF;

  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;

  v_idx := array_position(v_game.player_order, v_uid) - 1;
  v_msg := v_pname || ' called END! Finishing the round...';
  v_event := public._make_action_event('call_end', jsonb_build_object('actorId', v_uid::TEXT));

  PERFORM public._append_game_history(p_game_id, v_now, v_msg, v_event);

  UPDATE public.games SET
    status = 'ending',
    end_called_by = v_uid,
    end_round_start_seat_index = v_idx,
    action_version = v_game.action_version + 1,
    last_action_at = v_now,
    log = public._bounded_log_append(v_game.log, v_now, v_msg, v_event)
  WHERE id = p_game_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.skip_turn(
  p_game_id                 UUID,
  p_expected_action_version INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now           BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game          public.games%ROWTYPE;
  v_cur_pid       UUID;
  v_pd_name       TEXT;
  v_afk           INT;
  v_priv          public.game_private_state%ROWTYPE;
  v_next_idx      INT;
  v_next_pid      UUID;
  v_should_finish BOOLEAN := FALSE;
  v_new_order     UUID[];
  v_msg           TEXT;
  v_discard       JSONB;
  v_event         JSONB;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_game.action_version != p_expected_action_version THEN RETURN; END IF;
  IF v_game.current_turn_player_id IS NULL THEN RETURN; END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN RETURN; END IF;
  IF v_game.vote_kick IS NOT NULL AND (v_game.vote_kick->>'active')::BOOLEAN THEN RETURN; END IF;

  v_cur_pid := v_game.current_turn_player_id;

  SELECT display_name, afk_strikes INTO v_pd_name, v_afk
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_cur_pid;
  SELECT * INTO v_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_cur_pid;

  v_afk := COALESCE(v_afk, 0) + 1;

  v_discard := NULL;
  IF v_priv.drawn_card IS NOT NULL THEN
    v_discard := v_priv.drawn_card;
    UPDATE public.game_private_state SET drawn_card = NULL, drawn_card_source = NULL
      WHERE game_id = p_game_id AND player_id = v_cur_pid;
  END IF;

  v_next_idx := (array_position(v_game.player_order, v_cur_pid) % array_length(v_game.player_order, 1)) + 1;
  v_next_pid := v_game.player_order[v_next_idx];
  IF v_game.status = 'ending' AND v_game.end_round_start_seat_index IS NOT NULL THEN
    IF (v_next_idx - 1) = v_game.end_round_start_seat_index THEN
      v_should_finish := TRUE;
    END IF;
  END IF;

  IF v_afk >= 2 THEN
    v_new_order := array_remove(v_game.player_order, v_cur_pid);
    v_event := public._make_action_event(
      'player_kicked',
      jsonb_build_object('playerId', v_cur_pid::TEXT, 'reason', 'afk')
    );

    IF array_length(v_new_order, 1) IS NULL OR array_length(v_new_order, 1) < 2 THEN
      v_msg := v_pd_name || ' was AFK-kicked. Not enough players — game over.';
      PERFORM public._append_game_history(p_game_id, v_now, v_msg, v_event);
      UPDATE public.games SET
        discard_top = COALESCE(v_discard, v_game.discard_top),
        status = 'finished',
        current_turn_player_id = NULL,
        turn_phase = NULL,
        player_order = v_new_order,
        action_version = v_game.action_version + 1,
        last_action_at = v_now,
        turn_start_at = 0,
        log = public._bounded_log_append(v_game.log, v_now, v_msg, v_event)
      WHERE id = p_game_id;
    ELSE
      v_next_idx := ((array_position(v_game.player_order, v_cur_pid) - 1) % array_length(v_new_order, 1)) + 1;
      v_next_pid := v_new_order[v_next_idx];
      v_msg := v_pd_name || ' was AFK-kicked (2 timeouts).';
      PERFORM public._append_game_history(p_game_id, v_now, v_msg, v_event);
      UPDATE public.games SET
        discard_top = COALESCE(v_discard, v_game.discard_top),
        player_order = v_new_order,
        current_turn_player_id = v_next_pid,
        turn_phase = 'draw',
        action_version = v_game.action_version + 1,
        last_action_at = v_now,
        turn_start_at = v_now,
        host_id = CASE WHEN v_game.host_id = v_cur_pid THEN v_new_order[1] ELSE v_game.host_id END,
        log = public._bounded_log_append(v_game.log, v_now, v_msg, v_event)
      WHERE id = p_game_id;
    END IF;

    UPDATE public.game_players SET connected = FALSE, afk_strikes = 0
      WHERE game_id = p_game_id AND player_id = v_cur_pid;
    UPDATE public.game_private_state SET drawn_card = NULL, drawn_card_source = NULL
      WHERE game_id = p_game_id AND player_id = v_cur_pid;
  ELSE
    UPDATE public.game_players SET afk_strikes = v_afk
      WHERE game_id = p_game_id AND player_id = v_cur_pid;

    v_msg := v_pd_name || '''s turn was skipped (AFK).';
    PERFORM public._append_game_history(p_game_id, v_now, v_msg, NULL);

    UPDATE public.games SET
      discard_top = COALESCE(v_discard, v_game.discard_top),
      current_turn_player_id = CASE WHEN v_should_finish THEN NULL ELSE v_next_pid END,
      turn_phase = CASE WHEN v_should_finish THEN NULL ELSE 'draw' END,
      status = CASE WHEN v_should_finish THEN 'finished' ELSE v_game.status END,
      action_version = v_game.action_version + 1,
      last_action_at = v_now,
      turn_start_at = CASE WHEN v_should_finish THEN 0 ELSE v_now END,
      log = public._bounded_log_append(v_game.log, v_now, v_msg, NULL)
    WHERE id = p_game_id;
  END IF;
END;
$$;


CREATE OR REPLACE FUNCTION public.leave_game(p_game_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_now       BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game      public.games%ROWTYPE;
  v_pname     TEXT;
  v_new_order UUID[];
  v_next_idx  INT;
  v_msg       TEXT;
  v_event     JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_game.status NOT IN ('active', 'ending') THEN RETURN; END IF;
  IF NOT (v_uid = ANY(v_game.player_order)) THEN RETURN; END IF;

  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;

  v_new_order := array_remove(v_game.player_order, v_uid);
  v_event := public._make_action_event('player_left', jsonb_build_object('playerId', v_uid::TEXT));

  IF array_length(v_new_order, 1) IS NULL OR array_length(v_new_order, 1) < 2 THEN
    v_msg := v_pname || ' left. Not enough players — game over.';
    PERFORM public._append_game_history(p_game_id, v_now, v_msg, v_event);
    UPDATE public.games SET
      status = 'finished',
      current_turn_player_id = NULL,
      turn_phase = NULL,
      player_order = v_new_order,
      action_version = v_game.action_version + 1,
      last_action_at = v_now,
      log = public._bounded_log_append(v_game.log, v_now, v_msg, v_event)
    WHERE id = p_game_id;
  ELSE
    v_msg := v_pname || ' left the game';
    PERFORM public._append_game_history(p_game_id, v_now, v_msg, v_event);

    IF v_game.current_turn_player_id = v_uid THEN
      v_next_idx := ((array_position(v_game.player_order, v_uid) - 1) % array_length(v_new_order, 1)) + 1;
      UPDATE public.games SET
        player_order = v_new_order,
        current_turn_player_id = v_new_order[v_next_idx],
        turn_phase = 'draw',
        turn_start_at = v_now,
        action_version = v_game.action_version + 1,
        last_action_at = v_now,
        host_id = CASE WHEN v_game.host_id = v_uid THEN v_new_order[1] ELSE v_game.host_id END,
        vote_kick = CASE
          WHEN v_game.vote_kick IS NOT NULL AND (
            (v_game.vote_kick->>'targetId') = v_uid::TEXT OR
            (v_game.vote_kick->>'startedBy') = v_uid::TEXT
          ) THEN NULL
          ELSE v_game.vote_kick
        END,
        log = public._bounded_log_append(v_game.log, v_now, v_msg, v_event)
      WHERE id = p_game_id;
    ELSE
      UPDATE public.games SET
        player_order = v_new_order,
        action_version = v_game.action_version + 1,
        last_action_at = v_now,
        host_id = CASE WHEN v_game.host_id = v_uid THEN v_new_order[1] ELSE v_game.host_id END,
        vote_kick = CASE
          WHEN v_game.vote_kick IS NOT NULL AND (
            (v_game.vote_kick->>'targetId') = v_uid::TEXT OR
            (v_game.vote_kick->>'startedBy') = v_uid::TEXT
          ) THEN NULL
          ELSE v_game.vote_kick
        END,
        log = public._bounded_log_append(v_game.log, v_now, v_msg, v_event)
      WHERE id = p_game_id;
    END IF;
  END IF;

  UPDATE public.game_players SET connected = FALSE
    WHERE game_id = p_game_id AND player_id = v_uid;
  UPDATE public.game_private_state SET drawn_card = NULL, drawn_card_source = NULL
    WHERE game_id = p_game_id AND player_id = v_uid;
END;
$$;
