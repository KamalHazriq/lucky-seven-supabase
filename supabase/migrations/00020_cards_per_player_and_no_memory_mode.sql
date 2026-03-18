-- ============================================================
-- Lucky Seven - Migration 20: Cards Per Player + No Memory Mode
-- ============================================================
-- Adds:
--   - settings.cardsPerPlayer (3 | 4)
--   - settings.noMemoryMode (boolean)
-- and updates dealing / peek RPCs to respect both settings.
-- ============================================================

CREATE OR REPLACE FUNCTION public._normalize_game_settings(p_settings JSONB)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(p_settings, '{}'::JSONB) || jsonb_build_object(
    'cardsPerPlayer',
    CASE WHEN COALESCE(p_settings->>'cardsPerPlayer', '3') = '4' THEN 4 ELSE 3 END,
    'noMemoryMode',
    CASE WHEN lower(COALESCE(p_settings->>'noMemoryMode', 'false')) = 'true' THEN TRUE ELSE FALSE END
  );
$$;


CREATE OR REPLACE FUNCTION public._cards_per_player(p_settings JSONB)
RETURNS INT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN COALESCE((public._normalize_game_settings(p_settings)->>'cardsPerPlayer')::INT, 3) = 4 THEN 4
    ELSE 3
  END;
$$;


CREATE OR REPLACE FUNCTION public._no_memory_mode(p_settings JSONB)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE((public._normalize_game_settings(p_settings)->>'noMemoryMode')::BOOLEAN, FALSE);
$$;


CREATE OR REPLACE FUNCTION public._default_locks(p_count INT)
RETURNS BOOLEAN[]
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(array_agg(FALSE), '{}'::BOOLEAN[])
  FROM generate_series(1, GREATEST(COALESCE(p_count, 3), 1));
$$;


CREATE OR REPLACE FUNCTION public._default_locked_by(p_count INT)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT COALESCE(jsonb_agg('null'::JSONB), '[]'::JSONB)
  FROM generate_series(1, GREATEST(COALESCE(p_count, 3), 1));
$$;


UPDATE public.games
SET settings = public._normalize_game_settings(settings);


CREATE OR REPLACE FUNCTION public.create_game(
  p_display_name  TEXT,
  p_max_players   INT,
  p_settings      JSONB,
  p_join_code     TEXT,
  p_seed          TEXT,
  p_color_key     INT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_now  BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_id   UUID;
  v_settings JSONB := public._normalize_game_settings(p_settings);
  v_cards_per_player INT := public._cards_per_player(v_settings);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.games
    WHERE join_code = p_join_code AND status = 'lobby'
  ) THEN
    RAISE EXCEPTION 'Join code conflict, please retry';
  END IF;

  v_id := gen_random_uuid();

  INSERT INTO public.games (
    id, status, host_id, created_at, max_players,
    current_turn_player_id, draw_pile_count, discard_top,
    seed, end_called_by, end_round_start_seat_index,
    log, turn_phase, player_order, join_code,
    action_version, last_action_at, settings,
    spent_power_card_ids, turn_start_at, vote_kick, rematch_lobby_id
  ) VALUES (
    v_id, 'lobby', v_uid, v_now, p_max_players,
    NULL, 0, NULL,
    p_seed, NULL, NULL,
    jsonb_build_array(jsonb_build_object('ts', v_now, 'msg', 'Game created by ' || p_display_name)),
    NULL, ARRAY[v_uid], p_join_code,
    0, v_now, v_settings,
    '{}', 0, NULL, NULL
  );

  INSERT INTO public.game_players (
    game_id, player_id, display_name, seat_index,
    connected, locks, locked_by, color_key, afk_strikes
  ) VALUES (
    v_id, v_uid, p_display_name, 0,
    TRUE, public._default_locks(v_cards_per_player),
    public._default_locked_by(v_cards_per_player),
    p_color_key, 0
  );

  INSERT INTO public.game_private_state (
    game_id, player_id, hand, drawn_card, drawn_card_source, known, opponent_known
  ) VALUES (
    v_id, v_uid, '[]'::JSONB, NULL, NULL, '{}'::JSONB, '{}'::JSONB
  );

  RETURN v_id::TEXT;
END;
$$;


CREATE OR REPLACE FUNCTION public.join_game(
  p_game_id      UUID,
  p_display_name TEXT,
  p_color_key    INT DEFAULT NULL
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
  v_seat      INT;
  v_name_lower TEXT;
  v_assigned_color INT;
  v_taken_colors INT[];
  v_available  INT[];
  v_i INT;
  v_cards_per_player INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_game
    FROM public.games
    WHERE id = p_game_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;
  IF v_game.status != 'lobby' THEN
    RAISE EXCEPTION 'Game already started';
  END IF;
  IF v_uid = ANY(v_game.player_order) THEN
    RETURN;
  END IF;
  IF array_length(v_game.player_order, 1) >= v_game.max_players THEN
    RAISE EXCEPTION 'Game is full';
  END IF;

  v_name_lower := lower(p_display_name);
  IF EXISTS (
    SELECT 1 FROM public.game_players
    WHERE game_id = p_game_id AND lower(display_name) = v_name_lower
      AND connected = TRUE
  ) THEN
    RAISE EXCEPTION 'Name already taken in this lobby';
  END IF;

  IF p_color_key IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.game_players
      WHERE game_id = p_game_id AND color_key = p_color_key
        AND connected = TRUE
    ) THEN
      RAISE EXCEPTION 'Color already taken';
    END IF;
    v_assigned_color := p_color_key;
  ELSE
    SELECT array_agg(gp.color_key) INTO v_taken_colors
      FROM public.game_players gp
      WHERE gp.game_id = p_game_id AND gp.color_key IS NOT NULL
        AND gp.connected = TRUE;

    v_available := '{}';
    FOR v_i IN 0..15 LOOP
      IF v_taken_colors IS NULL OR NOT (v_i = ANY(v_taken_colors)) THEN
        v_available := v_available || v_i;
      END IF;
    END LOOP;

    IF array_length(v_available, 1) > 0 THEN
      v_assigned_color := v_available[1 + floor(random() * array_length(v_available, 1))::INT];
    END IF;
  END IF;

  v_seat := array_length(v_game.player_order, 1);
  v_cards_per_player := public._cards_per_player(v_game.settings);

  UPDATE public.games SET
    player_order = player_order || v_uid,
    log = CASE
      WHEN jsonb_array_length(log) >= 50
        THEN (log - 0) || jsonb_build_array(jsonb_build_object('ts', v_now, 'msg', p_display_name || ' joined'))
        ELSE log || jsonb_build_array(jsonb_build_object('ts', v_now, 'msg', p_display_name || ' joined'))
    END
  WHERE id = p_game_id;

  INSERT INTO public.game_players (
    game_id, player_id, display_name, seat_index,
    connected, locks, locked_by, color_key, afk_strikes
  ) VALUES (
    p_game_id, v_uid, p_display_name, v_seat,
    TRUE, public._default_locks(v_cards_per_player),
    public._default_locked_by(v_cards_per_player),
    v_assigned_color, 0
  );

  INSERT INTO public.game_private_state (
    game_id, player_id, hand, drawn_card, drawn_card_source, known, opponent_known
  ) VALUES (
    p_game_id, v_uid, '[]'::JSONB, NULL, NULL, '{}'::JSONB, '{}'::JSONB
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.update_game_settings(
  p_game_id  UUID,
  p_settings JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_game public.games%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_game
    FROM public.games
    WHERE id = p_game_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;
  IF v_game.host_id != v_uid THEN
    RAISE EXCEPTION 'Only the host can change settings';
  END IF;
  IF v_game.status != 'lobby' THEN
    RAISE EXCEPTION 'Settings can only be changed in the lobby';
  END IF;

  UPDATE public.games SET
    settings = public._normalize_game_settings(v_game.settings || p_settings)
  WHERE id = p_game_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.play_again(
  p_finished_game_id UUID,
  p_display_name     TEXT,
  p_max_players      INT,
  p_settings         JSONB,
  p_join_code        TEXT,
  p_seed             TEXT,
  p_color_key        INT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_now          BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_finished     RECORD;
  v_rematch      RECORD;
  v_new_id       UUID;
  v_seat_index   INT;
  v_settings     JSONB := public._normalize_game_settings(p_settings);
  v_cards_per_player INT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT id, rematch_lobby_id, status
    INTO v_finished
    FROM public.games
    WHERE id = p_finished_game_id
    FOR UPDATE;

  IF v_finished IS NULL THEN
    RAISE EXCEPTION 'Game not found';
  END IF;

  IF v_finished.rematch_lobby_id IS NOT NULL THEN
    SELECT id, status, player_order, max_players, settings
      INTO v_rematch
      FROM public.games
      WHERE id = v_finished.rematch_lobby_id
      FOR UPDATE;

    IF v_rematch IS NOT NULL THEN
      IF v_uid = ANY(v_rematch.player_order) THEN
        RETURN v_rematch.id::TEXT;
      END IF;

      IF v_rematch.status = 'lobby'
         AND array_length(v_rematch.player_order, 1) < v_rematch.max_players
      THEN
        v_seat_index := array_length(v_rematch.player_order, 1);
        v_cards_per_player := public._cards_per_player(v_rematch.settings);

        UPDATE public.games
          SET player_order = player_order || ARRAY[v_uid],
              log = public._bounded_log_append(
                log,
                jsonb_build_object('ts', v_now, 'msg', p_display_name || ' joined')
              )
          WHERE id = v_rematch.id;

        INSERT INTO public.game_players (
          game_id, player_id, display_name, seat_index,
          connected, locks, locked_by, color_key, afk_strikes
        ) VALUES (
          v_rematch.id, v_uid, p_display_name, v_seat_index,
          TRUE, public._default_locks(v_cards_per_player),
          public._default_locked_by(v_cards_per_player),
          p_color_key, 0
        );

        INSERT INTO public.game_private_state (
          game_id, player_id, hand, drawn_card, drawn_card_source, known, opponent_known
        ) VALUES (
          v_rematch.id, v_uid, '[]'::JSONB, NULL, NULL, '{}'::JSONB, '{}'::JSONB
        );

        RETURN v_rematch.id::TEXT;
      END IF;
    END IF;
  END IF;

  v_new_id := gen_random_uuid();
  v_cards_per_player := public._cards_per_player(v_settings);

  INSERT INTO public.games (
    id, status, host_id, created_at, max_players,
    current_turn_player_id, draw_pile_count, discard_top,
    seed, end_called_by, end_round_start_seat_index,
    log, turn_phase, player_order, join_code,
    action_version, last_action_at, settings,
    spent_power_card_ids, turn_start_at, vote_kick, rematch_lobby_id
  ) VALUES (
    v_new_id, 'lobby', v_uid, v_now, p_max_players,
    NULL, 0, NULL,
    p_seed, NULL, NULL,
    jsonb_build_array(jsonb_build_object('ts', v_now, 'msg', 'Game created by ' || p_display_name)),
    NULL, ARRAY[v_uid], p_join_code,
    0, v_now, v_settings,
    '{}', 0, NULL, NULL
  );

  INSERT INTO public.game_players (
    game_id, player_id, display_name, seat_index,
    connected, locks, locked_by, color_key, afk_strikes
  ) VALUES (
    v_new_id, v_uid, p_display_name, 0,
    TRUE, public._default_locks(v_cards_per_player),
    public._default_locked_by(v_cards_per_player),
    p_color_key, 0
  );

  INSERT INTO public.game_private_state (
    game_id, player_id, hand, drawn_card, drawn_card_source, known, opponent_known
  ) VALUES (
    v_new_id, v_uid, '[]'::JSONB, NULL, NULL, '{}'::JSONB, '{}'::JSONB
  );

  UPDATE public.games
    SET rematch_lobby_id = v_new_id
    WHERE id = p_finished_game_id;

  RETURN v_new_id::TEXT;
END;
$$;


CREATE OR REPLACE FUNCTION public.start_game(
  p_game_id  UUID,
  p_deck     JSONB
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
  v_player_count INT;
  v_cards_per_player INT;
  v_cards_needed INT;
  v_i           INT;
  v_pid         UUID;
  v_hand        JSONB;
  v_remaining   JSONB;
  v_log_entry   JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_game
    FROM public.games
    WHERE id = p_game_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;
  IF v_game.host_id != v_uid THEN
    RAISE EXCEPTION 'Only host can start';
  END IF;
  IF v_game.status != 'lobby' THEN
    RAISE EXCEPTION 'Game already started';
  END IF;

  v_player_count := array_length(v_game.player_order, 1);
  IF v_player_count < 2 THEN
    RAISE EXCEPTION 'Need at least 2 players';
  END IF;

  v_cards_per_player := public._cards_per_player(v_game.settings);
  v_cards_needed := v_player_count * v_cards_per_player;

  IF jsonb_array_length(p_deck) < v_cards_needed THEN
    RAISE EXCEPTION 'Deck too small for player count';
  END IF;

  FOR v_i IN 0..(v_player_count - 1) LOOP
    v_pid := v_game.player_order[v_i + 1];
    v_hand := (
      SELECT jsonb_agg(elem)
      FROM jsonb_array_elements(p_deck) WITH ORDINALITY AS t(elem, idx)
      WHERE t.idx > (v_i * v_cards_per_player)
        AND t.idx <= ((v_i + 1) * v_cards_per_player)
    );

    UPDATE public.game_private_state SET
      hand = v_hand,
      drawn_card = NULL,
      drawn_card_source = NULL,
      known = '{}'::JSONB,
      opponent_known = '{}'::JSONB
    WHERE game_id = p_game_id AND player_id = v_pid;

    UPDATE public.game_players SET
      locks = public._default_locks(v_cards_per_player),
      locked_by = public._default_locked_by(v_cards_per_player)
    WHERE game_id = p_game_id AND player_id = v_pid;
  END LOOP;

  v_remaining := (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements(p_deck) WITH ORDINALITY AS t(elem, idx)
    WHERE t.idx > v_cards_needed
  );
  IF v_remaining IS NULL THEN
    v_remaining := '[]'::JSONB;
  END IF;

  INSERT INTO public.game_internal (game_id, draw_pile)
  VALUES (p_game_id, v_remaining)
  ON CONFLICT (game_id) DO UPDATE SET draw_pile = EXCLUDED.draw_pile;

  INSERT INTO public.game_history (game_id, ts, msg)
  VALUES (p_game_id, v_now, 'Game started! Cards dealt.');

  v_log_entry := jsonb_build_object('ts', v_now, 'msg', 'Game started! Cards dealt.');

  UPDATE public.games SET
    status = 'active',
    draw_pile_count = jsonb_array_length(v_remaining),
    discard_top = NULL,
    current_turn_player_id = v_game.player_order[1],
    turn_phase = 'draw',
    action_version = 1,
    last_action_at = v_now,
    turn_start_at = v_now,
    end_called_by = NULL,
    end_round_start_seat_index = NULL,
    spent_power_card_ids = '{}',
    vote_kick = NULL,
    log = CASE
      WHEN jsonb_array_length(v_game.log) >= 50
        THEN (v_game.log - 0) || jsonb_build_array(v_log_entry)
        ELSE v_game.log || jsonb_build_array(v_log_entry)
    END
  WHERE id = p_game_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.use_peek_all(p_game_id UUID)
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
  v_revealed JSONB := '{}'::JSONB;
  v_new_known JSONB;
  v_card     JSONB;
  v_i        INT;
  v_slot_count INT;
  v_no_memory BOOLEAN;
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
  v_no_memory := public._no_memory_mode(v_game.settings);
  v_new_known := v_priv.known;
  v_slot_count := jsonb_array_length(v_priv.hand);

  FOR v_i IN 0..(v_slot_count - 1) LOOP
    IF NOT COALESCE(v_locks[v_i + 1], FALSE) THEN
      v_card := v_priv.hand->v_i;
      IF NOT v_no_memory THEN
        v_new_known := v_new_known || jsonb_build_object(v_i::TEXT, v_card);
      END IF;
      v_revealed := v_revealed || jsonb_build_object(v_i::TEXT, v_card);
    END IF;
  END LOOP;

  UPDATE public.game_private_state SET
    drawn_card = NULL, drawn_card_source = NULL, known = v_new_known
  WHERE game_id = p_game_id AND player_id = v_uid;

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


CREATE OR REPLACE FUNCTION public.use_peek_one(
  p_game_id    UUID,
  p_slot_index INT
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
  v_new_known := CASE
    WHEN public._no_memory_mode(v_game.settings)
      THEN v_priv.known
    ELSE v_priv.known || jsonb_build_object(p_slot_index::TEXT, v_peeked)
  END;

  UPDATE public.game_private_state SET
    drawn_card = NULL, drawn_card_source = NULL, known = v_new_known
  WHERE game_id = p_game_id AND player_id = v_uid;

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


CREATE OR REPLACE FUNCTION public.use_peek_opponent(
  p_game_id         UUID,
  p_target_player   UUID,
  p_slot_index      INT
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
    RAISE EXCEPTION 'Cannot peek your own card - use Peek instead';
  END IF;

  SELECT locks, display_name INTO v_target_locks, v_target_name
    FROM public.game_players WHERE game_id = p_game_id AND player_id = p_target_player;
  IF v_target_locks[p_slot_index + 1] THEN RAISE EXCEPTION 'That card is locked!'; END IF;

  SELECT * INTO v_target_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = p_target_player;

  v_peeked := v_target_priv.hand->p_slot_index;

  IF NOT public._no_memory_mode(v_game.settings) THEN
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


CREATE OR REPLACE FUNCTION public.use_peek_all_opponent(
  p_game_id       UUID,
  p_target_player UUID
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
  v_msg      TEXT;
  v_i        INT;
  v_slot_count INT;
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
    RAISE EXCEPTION 'Cannot peek your own cards - use Peek All instead';
  END IF;

  SELECT locks, display_name INTO v_target_locks, v_target_name
    FROM public.game_players WHERE game_id = p_game_id AND player_id = p_target_player;
  SELECT * INTO v_target_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = p_target_player;

  v_slot_count := jsonb_array_length(v_target_priv.hand);
  FOR v_i IN 0..(v_slot_count - 1) LOOP
    IF NOT COALESCE(v_target_locks[v_i + 1], FALSE) THEN
      v_revealed := v_revealed || jsonb_build_object(v_i::TEXT, v_target_priv.hand->v_i);
    END IF;
  END LOOP;

  IF NOT public._no_memory_mode(v_game.settings) THEN
    v_new_opp_known := COALESCE(v_priv.opponent_known->p_target_player::TEXT, '{}'::JSONB) || v_revealed;
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

  v_msg := v_pname || ' used ' || v_rank_key || ' as peek_all_opponent on ' || v_target_name || '''s cards';

  INSERT INTO public.game_history (game_id, ts, msg) VALUES (p_game_id, v_now, v_msg);

  PERFORM public._apply_end_turn(
    p_game_id, v_uid, v_priv.drawn_card, v_msg,
    v_game.status, v_game.player_order,
    v_game.end_round_start_seat_index, v_game.action_version,
    v_game.draw_pile_count, v_game.log
  );
  UPDATE public.games SET spent_power_card_ids = spent_power_card_ids || ARRAY[v_priv.drawn_card->>'id']
    WHERE id = p_game_id;

  RETURN jsonb_build_object('cards', v_revealed, 'playerName', v_target_name, 'locks', v_target_locks);
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
  v_msg       TEXT;
  v_i         INT;
  v_slot_count INT;
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

  v_unlocked := '{}';
  v_slot_count := COALESCE(array_length(v_t_locks, 1), 0);
  FOR v_i IN 0..(v_slot_count - 1) LOOP
    IF NOT COALESCE(v_t_locks[v_i + 1], FALSE) THEN
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
