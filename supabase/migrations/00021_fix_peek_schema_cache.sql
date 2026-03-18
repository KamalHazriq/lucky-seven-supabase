-- Migration 00021: Fix peek function overloads and force PostgREST schema cache reload
--
-- Problem: migrations 00007 + 00019 used CREATE OR REPLACE with different param lists,
-- creating overloads. PostgREST cannot route calls to new signatures it hasn't cached.
-- Migration 00020 dropped old overloads but NOTIFY may not have flushed the cache.
--
-- This migration explicitly DROPs every known variant of all four peek functions
-- (old 2/3-param and new 3/4-param), then CREATEs only the correct new signatures,
-- then NOTIFYs PostgREST to reload. After this runs, the schema cache is clean.

-- ─── Drop ALL known variants ────────────────────────────────────────────────

-- use_peek_one
DROP FUNCTION IF EXISTS public.use_peek_one(UUID, INT);
DROP FUNCTION IF EXISTS public.use_peek_one(UUID, INT, BOOLEAN);

-- use_peek_all
DROP FUNCTION IF EXISTS public.use_peek_all(UUID);
DROP FUNCTION IF EXISTS public.use_peek_all(UUID, BOOLEAN);

-- use_peek_opponent
DROP FUNCTION IF EXISTS public.use_peek_opponent(UUID, UUID, INT);
DROP FUNCTION IF EXISTS public.use_peek_opponent(UUID, UUID, INT, BOOLEAN);

-- use_peek_all_opponent
DROP FUNCTION IF EXISTS public.use_peek_all_opponent(UUID, UUID);
DROP FUNCTION IF EXISTS public.use_peek_all_opponent(UUID, UUID, BOOLEAN);


-- ─── Recreate use_peek_one ───────────────────────────────────────────────────
CREATE FUNCTION public.use_peek_one(
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
  v_uid      UUID := auth.uid();
  v_now      BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game     public.games%ROWTYPE;
  v_priv     public.game_private_state%ROWTYPE;
  v_locks    BOOLEAN[];
  v_pname    TEXT;
  v_rank_key TEXT;
  v_peeked   JSONB;
  v_new_known JSONB;
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

  INSERT INTO public.game_history (game_id, ts, msg)
  VALUES (p_game_id, v_now, v_pname || ' used ' || v_rank_key || ' as peek_one');

  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_priv.drawn_card,
    v_pname || ' used ' || v_rank_key || ' as peek_one',
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index, v_game.action_version,
    v_game.draw_pile_count, v_game.log
  );
  UPDATE public.games SET spent_power_card_ids = spent_power_card_ids || ARRAY[v_priv.drawn_card->>'id']
    WHERE id = p_game_id;

  RETURN v_peeked;
END;
$$;


-- ─── Recreate use_peek_all ───────────────────────────────────────────────────
CREATE FUNCTION public.use_peek_all(
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

  INSERT INTO public.game_history (game_id, ts, msg)
  VALUES (p_game_id, v_now, v_pname || ' used ' || v_rank_key || ' as peek_all');

  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_priv.drawn_card,
    v_pname || ' used ' || v_rank_key || ' as peek_all',
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index, v_game.action_version,
    v_game.draw_pile_count, v_game.log
  );
  UPDATE public.games SET spent_power_card_ids = spent_power_card_ids || ARRAY[v_priv.drawn_card->>'id']
    WHERE id = p_game_id;

  RETURN v_revealed;
END;
$$;


-- ─── Recreate use_peek_opponent ──────────────────────────────────────────────
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
  v_uid      UUID := auth.uid();
  v_now      BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game     public.games%ROWTYPE;
  v_priv     public.game_private_state%ROWTYPE;
  v_pname    TEXT;
  v_rank_key TEXT;
  v_target_priv  public.game_private_state%ROWTYPE;
  v_target_locks BOOLEAN[];
  v_target_name  TEXT;
  v_peeked   JSONB;
  v_msg      TEXT;
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

  INSERT INTO public.game_history (game_id, ts, msg) VALUES (p_game_id, v_now, v_msg);

  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_priv.drawn_card, v_msg,
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index, v_game.action_version,
    v_game.draw_pile_count, v_game.log
  );
  UPDATE public.games SET spent_power_card_ids = spent_power_card_ids || ARRAY[v_priv.drawn_card->>'id']
    WHERE id = p_game_id;

  RETURN jsonb_build_object('card', v_peeked, 'playerName', v_target_name);
END;
$$;


-- ─── Recreate use_peek_all_opponent ─────────────────────────────────────────
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
  v_uid      UUID := auth.uid();
  v_now      BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game     public.games%ROWTYPE;
  v_priv     public.game_private_state%ROWTYPE;
  v_pname    TEXT;
  v_rank_key TEXT;
  v_target_priv  public.game_private_state%ROWTYPE;
  v_target_locks BOOLEAN[];
  v_target_name  TEXT;
  v_revealed JSONB := '{}'::JSONB;
  v_new_opp_known JSONB;
  v_cpp      INT;
  v_msg      TEXT;
  v_i        INT;
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

  INSERT INTO public.game_history (game_id, ts, msg) VALUES (p_game_id, v_now, v_msg);

  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_priv.drawn_card, v_msg,
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index, v_game.action_version,
    v_game.draw_pile_count, v_game.log
  );
  UPDATE public.games SET spent_power_card_ids = spent_power_card_ids || ARRAY[v_priv.drawn_card->>'id']
    WHERE id = p_game_id;

  RETURN jsonb_build_object('cards', v_revealed, 'playerName', v_target_name, 'locks', to_jsonb(v_target_locks));
END;
$$;


-- ─── Force PostgREST schema cache reload ────────────────────────────────────
NOTIFY pgrst, 'reload schema';
