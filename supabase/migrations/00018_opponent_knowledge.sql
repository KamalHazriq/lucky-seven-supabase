-- ============================================================
-- Lucky Seven — Migration 18: Opponent Knowledge Persistence
-- ============================================================
-- Adds opponent_known JSONB column to game_private_state so
-- that peek-opponent results persist for the viewing player.
--
-- Knowledge is invalidated (deleted) when the peeked slot's
-- actual card changes (swap, queen swap, rearrange/chaos).
--
-- Security: game_private_state RLS is player-scoped. Each
-- player only reads their own row, so opponent_known is
-- never visible to the peeked player.
-- ============================================================


-- ─── 1. Add column ───────────────────────────────────────────
ALTER TABLE public.game_private_state
  ADD COLUMN IF NOT EXISTS opponent_known JSONB NOT NULL DEFAULT '{}'::JSONB;


-- ─── 2. Helper: invalidate a single slot across all viewers ──
-- Called when a specific slot in a player's hand changes.
-- Removes that slot from every other player's opponent_known.
CREATE OR REPLACE FUNCTION public._invalidate_opp_known_slot(
  p_game_id       UUID,
  p_target_player UUID,
  p_slot          INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.game_private_state
  SET opponent_known = jsonb_set(
    opponent_known,
    ARRAY[p_target_player::TEXT],
    COALESCE(opponent_known->p_target_player::TEXT, '{}') - p_slot::TEXT
  )
  WHERE game_id = p_game_id
    AND player_id != p_target_player
    AND opponent_known ? p_target_player::TEXT;
END;
$$;


-- ─── 3. Helper: invalidate ALL slots of a player ─────────────
-- Called when chaos/rearrange shuffles a player's cards.
-- Removes the entire player entry from all other players' opponent_known.
CREATE OR REPLACE FUNCTION public._invalidate_opp_known_player(
  p_game_id       UUID,
  p_target_player UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.game_private_state
  SET opponent_known = opponent_known - p_target_player::TEXT
  WHERE game_id = p_game_id
    AND player_id != p_target_player
    AND opponent_known ? p_target_player::TEXT;
END;
$$;


-- ─── 4. Update use_peek_opponent — persist to viewer's opponent_known ───
CREATE OR REPLACE FUNCTION public.use_peek_opponent(
  p_game_id         UUID,
  p_target_player   UUID,
  p_slot_index      INT
)
RETURNS JSONB  -- { "card": Card, "playerName": text }
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

  -- Validate peek-opponent settings
  IF NOT COALESCE((v_game.settings->>'peekAllowsOpponent')::BOOLEAN, TRUE) THEN
    RAISE EXCEPTION 'Peek opponent is not enabled';
  END IF;
  v_rank_key := public._assert_peek_power(
    v_game.settings, v_game.spent_power_card_ids, v_priv.drawn_card
  );

  IF p_target_player = v_uid THEN
    RAISE EXCEPTION 'Cannot peek your own card — use Peek instead';
  END IF;

  -- Read target
  SELECT locks, display_name INTO v_target_locks, v_target_name
    FROM public.game_players WHERE game_id = p_game_id AND player_id = p_target_player;
  IF v_target_locks[p_slot_index + 1] THEN RAISE EXCEPTION 'That card is locked!'; END IF;

  SELECT * INTO v_target_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = p_target_player;

  v_peeked := v_target_priv.hand->p_slot_index;

  -- Persist knowledge: update viewer's opponent_known for this slot
  UPDATE public.game_private_state
  SET opponent_known = jsonb_set(
    opponent_known,
    ARRAY[p_target_player::TEXT, p_slot_index::TEXT],
    v_peeked
  )
  WHERE game_id = p_game_id AND player_id = v_uid;

  -- Clear actor's drawn card
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


-- ─── 5. Update use_peek_all_opponent — persist to viewer's opponent_known ───
CREATE OR REPLACE FUNCTION public.use_peek_all_opponent(
  p_game_id       UUID,
  p_target_player UUID
)
RETURNS JSONB  -- { "cards": {slot: Card}, "playerName": text, "locks": [bool] }
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
  -- Must specifically have peek_all power
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

  -- Build revealed map (only non-locked slots)
  FOR v_i IN 0..2 LOOP
    IF NOT v_target_locks[v_i + 1] THEN
      v_revealed := v_revealed || jsonb_build_object(v_i::TEXT, v_target_priv.hand->v_i);
    END IF;
  END LOOP;

  -- Persist knowledge: merge revealed into viewer's opponent_known[target]
  v_new_opp_known := COALESCE(v_priv.opponent_known->p_target_player::TEXT, '{}') || v_revealed;
  UPDATE public.game_private_state
  SET opponent_known = jsonb_set(
    opponent_known,
    ARRAY[p_target_player::TEXT],
    v_new_opp_known
  )
  WHERE game_id = p_game_id AND player_id = v_uid;

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


-- ─── 6. Update swap_with_slot — invalidate opponent knowledge for actor's slot ───
-- When actor swaps their drawn card into slot X, others lose their knowledge of
-- actor's slot X (the new card they don't know).
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
  v_uid      UUID := auth.uid();
  v_game     public.games%ROWTYPE;
  v_priv     public.game_private_state%ROWTYPE;
  v_locks    BOOLEAN[];
  v_pname    TEXT;
  v_old_card JSONB;
  v_new_hand JSONB;
  v_new_known JSONB;
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

  -- Read actor's private state
  SELECT * INTO v_priv
    FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid
    FOR UPDATE;

  IF v_priv.drawn_card IS NULL THEN
    RAISE EXCEPTION 'No drawn card';
  END IF;

  -- Validate slot index
  IF p_slot_index < 0 OR p_slot_index >= jsonb_array_length(v_priv.hand) THEN
    RAISE EXCEPTION 'Invalid slot';
  END IF;

  -- Check lock status
  SELECT locks, display_name INTO v_locks, v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;
  -- Postgres arrays are 1-indexed
  IF v_locks[p_slot_index + 1] THEN
    RAISE EXCEPTION 'That card is locked!';
  END IF;

  -- Perform the swap
  v_old_card := v_priv.hand->p_slot_index;

  -- Build new hand: replace element at slot_index
  SELECT jsonb_agg(
    CASE WHEN idx = p_slot_index + 1 THEN v_priv.drawn_card ELSE elem END
  ) INTO v_new_hand
  FROM jsonb_array_elements(v_priv.hand) WITH ORDINALITY AS t(elem, idx);

  -- Update known map: record what we placed in this slot
  v_new_known := v_priv.known || jsonb_build_object(p_slot_index::TEXT, v_priv.drawn_card);

  -- Update private state
  UPDATE public.game_private_state SET
    hand = v_new_hand,
    drawn_card = NULL,
    drawn_card_source = NULL,
    known = v_new_known
  WHERE game_id = p_game_id AND player_id = v_uid;

  -- Invalidate other players' opponent knowledge of this slot
  PERFORM public._invalidate_opp_known_slot(p_game_id, v_uid, p_slot_index);

  -- Reset AFK strikes
  UPDATE public.game_players SET afk_strikes = 0
    WHERE game_id = p_game_id AND player_id = v_uid;

  -- Advance turn (old card goes to discard)
  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_old_card,
    v_pname || ' swapped their card #' || (p_slot_index + 1)::TEXT,
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index,
    v_game.action_version, v_game.draw_pile_count,
    v_game.log
  );
END;
$$;


-- ─── 7. Update use_swap_power — invalidate opponent knowledge for both slots ───
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
  v_uid      UUID := auth.uid();
  v_now      BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game     public.games%ROWTYPE;
  v_priv     public.game_private_state%ROWTYPE;
  v_pname    TEXT;
  v_rank_key TEXT;
  v_a_locks  BOOLEAN[];
  v_b_locks  BOOLEAN[];
  v_a_name   TEXT;
  v_b_name   TEXT;
  v_priv_a   public.game_private_state%ROWTYPE;
  v_priv_b   public.game_private_state%ROWTYPE;
  v_card_a   JSONB;
  v_card_b   JSONB;
  v_new_hand JSONB;
  v_new_known JSONB;
  v_new_hand_a JSONB;
  v_new_hand_b JSONB;
  v_new_known_a JSONB;
  v_new_known_b JSONB;
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

  v_rank_key := public._assert_power_effect(
    v_game.settings, v_game.spent_power_card_ids,
    v_priv.drawn_card, 'swap_one_to_one'
  );

  -- Check locks
  SELECT locks, display_name INTO v_a_locks, v_a_name
    FROM public.game_players WHERE game_id = p_game_id AND player_id = p_a_player;
  SELECT locks, display_name INTO v_b_locks, v_b_name
    FROM public.game_players WHERE game_id = p_game_id AND player_id = p_b_player;
  IF v_a_locks[p_a_slot + 1] THEN RAISE EXCEPTION 'Card A is locked'; END IF;
  IF v_b_locks[p_b_slot + 1] THEN RAISE EXCEPTION 'Card B is locked'; END IF;

  -- Read private states
  SELECT * INTO v_priv_a FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = p_a_player FOR UPDATE;
  SELECT * INTO v_priv_b FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = p_b_player FOR UPDATE;

  v_card_a := v_priv_a.hand->p_a_slot;
  v_card_b := v_priv_b.hand->p_b_slot;

  IF p_a_player = p_b_player THEN
    -- Same player: swap two slots
    SELECT jsonb_agg(
      CASE
        WHEN idx = p_a_slot + 1 THEN v_card_b
        WHEN idx = p_b_slot + 1 THEN v_card_a
        ELSE elem
      END
    ) INTO v_new_hand
    FROM jsonb_array_elements(v_priv_a.hand) WITH ORDINALITY AS t(elem, idx);

    -- Swap known entries
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

    -- Invalidate opponent knowledge for both swapped slots of same player
    PERFORM public._invalidate_opp_known_slot(p_game_id, p_a_player, p_a_slot);
    PERFORM public._invalidate_opp_known_slot(p_game_id, p_a_player, p_b_slot);
  ELSE
    -- Different players: swap cross-player
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

    -- Invalidate opponent knowledge for both involved player/slots
    PERFORM public._invalidate_opp_known_slot(p_game_id, p_a_player, p_a_slot);
    PERFORM public._invalidate_opp_known_slot(p_game_id, p_b_player, p_b_slot);
  END IF;

  -- Clear actor's drawn card
  UPDATE public.game_private_state SET drawn_card = NULL, drawn_card_source = NULL
    WHERE game_id = p_game_id AND player_id = v_uid;

  v_msg := v_pname || ' used ' || v_rank_key || ' as swap: ' || v_a_name || '''s #' || (p_a_slot+1)::TEXT || ' <-> ' || v_b_name || '''s #' || (p_b_slot+1)::TEXT;

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


-- ─── 8. Update use_rearrange — invalidate ALL opponent knowledge for target ───
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

  -- Find unlocked indices
  v_unlocked := '{}';
  FOR v_i IN 0..2 LOOP
    IF NOT v_t_locks[v_i + 1] THEN
      v_unlocked := v_unlocked || v_i;
    END IF;
  END LOOP;

  IF array_length(v_unlocked, 1) > 1 THEN
    -- Extract unlocked cards into array
    v_cards := '{}';
    FOR v_i IN 1..array_length(v_unlocked, 1) LOOP
      v_cards := v_cards || (v_t_priv.hand->(v_unlocked[v_i]));
    END LOOP;

    -- Fisher-Yates shuffle using random()
    FOR v_i IN REVERSE array_length(v_cards, 1)..2 LOOP
      v_j := 1 + floor(random() * v_i)::INT;
      v_temp := v_cards[v_i];
      v_cards[v_i] := v_cards[v_j];
      v_cards[v_j] := v_temp;
    END LOOP;

    -- Rebuild hand
    v_new_hand := v_t_priv.hand;
    FOR v_i IN 1..array_length(v_unlocked, 1) LOOP
      v_new_hand := jsonb_set(v_new_hand, ARRAY[(v_unlocked[v_i])::TEXT], v_cards[v_i]);
    END LOOP;

    -- Clear target's own known for shuffled slots
    v_new_known := v_t_priv.known;
    FOR v_i IN 1..array_length(v_unlocked, 1) LOOP
      v_new_known := v_new_known - (v_unlocked[v_i])::TEXT;
    END LOOP;

    UPDATE public.game_private_state SET hand = v_new_hand, known = v_new_known
      WHERE game_id = p_game_id AND player_id = p_target_player;

    -- Invalidate all opponent knowledge of target player (all slots changed)
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


-- ─── 9. Update _bounded_log_append cap from 50 → 100 ────────
-- Allows game log to hold up to 100 entries for full history.
CREATE OR REPLACE FUNCTION public._bounded_log_append(
  p_log     JSONB,
  p_ts      BIGINT,
  p_msg     TEXT
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
          SELECT jsonb_build_object('ts', p_ts, 'msg', p_msg), 9999
        ) sub
      )
      ELSE p_log || jsonb_build_array(jsonb_build_object('ts', p_ts, 'msg', p_msg))
  END;
$$;
