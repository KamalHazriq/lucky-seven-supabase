-- ═══════════════════════════════════════════════════════════════════
-- Migration 00019: Configurable card count + No Memory Mode
-- ═══════════════════════════════════════════════════════════════════
-- Changes:
--   1. start_game  — uses cardsPerPlayer setting (3 or 4), default 3
--   2. use_peek_one — adds p_no_memory param (skips known update when true)
--   3. use_peek_all — dynamic loop + p_no_memory
--   4. use_peek_opponent — adds p_no_memory (skips opponent_known update)
--   5. use_peek_all_opponent — dynamic loop + p_no_memory
--   6. use_rearrange — dynamic loop based on cardsPerPlayer
-- ═══════════════════════════════════════════════════════════════════


-- ─── 1. Rewrite start_game — support cardsPerPlayer ──────────────
CREATE OR REPLACE FUNCTION public.start_game(p_game_id UUID, p_deck JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_now         BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game        public.games%ROWTYPE;
  v_player_count INT;
  v_cards_needed INT;
  v_cpp         INT;
  v_i           INT;
  v_pid         UUID;
  v_hand        JSONB;
  v_remaining   JSONB;
  v_log_entry   JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.host_id != v_uid THEN RAISE EXCEPTION 'Only host can start'; END IF;
  IF v_game.status != 'lobby' THEN RAISE EXCEPTION 'Game already started'; END IF;

  v_player_count := array_length(v_game.player_order, 1);
  IF v_player_count < 2 THEN RAISE EXCEPTION 'Need at least 2 players'; END IF;

  -- Read cards per player from settings (default 3, allowed: 3 or 4)
  v_cpp := COALESCE((v_game.settings->>'cardsPerPlayer')::INT, 3);
  IF v_cpp NOT IN (3, 4) THEN v_cpp := 3; END IF;

  v_cards_needed := v_player_count * v_cpp;

  IF jsonb_array_length(p_deck) < v_cards_needed THEN
    RAISE EXCEPTION 'Deck too small for player count';
  END IF;

  -- Deal v_cpp cards to each player
  FOR v_i IN 0..(v_player_count - 1) LOOP
    v_pid := v_game.player_order[v_i + 1];
    v_hand := (
      SELECT jsonb_agg(elem)
      FROM jsonb_array_elements(p_deck) WITH ORDINALITY AS t(elem, idx)
      WHERE t.idx > (v_i * v_cpp) AND t.idx <= ((v_i + 1) * v_cpp)
    );

    UPDATE public.game_private_state SET
      hand = v_hand,
      drawn_card = NULL,
      drawn_card_source = NULL,
      known = '{}'::JSONB,
      opponent_known = '{}'::JSONB
    WHERE game_id = p_game_id AND player_id = v_pid;

    -- Reset locks dynamically based on card count
    UPDATE public.game_players SET
      locks = array_fill(false, ARRAY[v_cpp]),
      locked_by = CASE WHEN v_cpp = 4
        THEN '[null,null,null,null]'::JSONB
        ELSE '[null,null,null]'::JSONB
      END
    WHERE game_id = p_game_id AND player_id = v_pid;
  END LOOP;

  -- Remaining cards become the draw pile
  v_remaining := (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements(p_deck) WITH ORDINALITY AS t(elem, idx)
    WHERE t.idx > v_cards_needed
  );
  IF v_remaining IS NULL THEN v_remaining := '[]'::JSONB; END IF;

  INSERT INTO public.game_internal (game_id, draw_pile)
  VALUES (p_game_id, v_remaining)
  ON CONFLICT (game_id) DO UPDATE SET draw_pile = EXCLUDED.draw_pile;

  v_log_entry := jsonb_build_object('ts', v_now, 'msg', 'Game started!');

  UPDATE public.games SET
    status = 'active',
    current_turn_player_id = v_game.player_order[1],
    turn_phase = 'draw',
    draw_pile_count = jsonb_array_length(v_remaining),
    discard_top = NULL,
    action_version = 1,
    last_action_at = v_now,
    turn_start_at = v_now,
    log = jsonb_build_array(v_log_entry)
  WHERE id = p_game_id;

  INSERT INTO public.game_history (game_id, ts, msg)
  VALUES (p_game_id, v_now, 'Game started!');
END;
$$;


-- ─── 2. Rewrite use_peek_one — add p_no_memory ───────────────────
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
    -- No Memory Mode: clear drawn card but do NOT persist knowledge
    UPDATE public.game_private_state SET
      drawn_card = NULL, drawn_card_source = NULL
    WHERE game_id = p_game_id AND player_id = v_uid;
  ELSE
    -- Normal mode: persist card knowledge
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


-- ─── 3. Rewrite use_peek_all — dynamic loop + p_no_memory ────────
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


-- ─── 4. Rewrite use_peek_opponent — add p_no_memory ──────────────
CREATE OR REPLACE FUNCTION public.use_peek_opponent(
  p_game_id         UUID,
  p_target_player   UUID,
  p_slot_index      INT,
  p_no_memory       BOOLEAN DEFAULT FALSE
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
    -- Persist knowledge to viewer's opponent_known
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


-- ─── 5. Rewrite use_peek_all_opponent — dynamic loop + p_no_memory
CREATE OR REPLACE FUNCTION public.use_peek_all_opponent(
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


-- ─── 6. Rewrite use_rearrange — dynamic loop ─────────────────────
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

  -- Find unlocked indices (dynamic based on cpp)
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

    -- Fisher-Yates shuffle
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

  INSERT INTO public.game_history (game_id, ts, msg) VALUES (p_game_id, v_now, v_msg);

  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_priv.drawn_card, v_msg,
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index, v_game.action_version,
    v_game.draw_pile_count, v_game.log
  );
  UPDATE public.games SET spent_power_card_ids = spent_power_card_ids || ARRAY[v_priv.drawn_card->>'id']
    WHERE id = p_game_id;
END;
$$;
