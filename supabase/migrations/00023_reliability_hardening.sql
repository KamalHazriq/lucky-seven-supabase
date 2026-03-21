-- ============================================================
-- Lucky Seven — Migration 23: Reliability Hardening
-- ============================================================
-- Finishes the structured event rollout for lobby/rematch/vote
-- flows, preserves event payloads during archival, and aligns
-- backend reveal scoring with the documented Joker value.
-- ============================================================

ALTER TABLE public.archive_game_history
  ADD COLUMN IF NOT EXISTS event JSONB;


CREATE OR REPLACE FUNCTION public.prune_old_game_history(
  p_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch_size  INT := 5000;
  v_cutoff_ms   BIGINT;
  v_total       INT := 0;
  v_batch_count INT;
  v_batch_ids   UUID[];
BEGIN
  v_cutoff_ms := (extract(epoch FROM (now() - (p_days || ' days')::INTERVAL)) * 1000)::BIGINT;

  LOOP
    SELECT array_agg(id)
    INTO   v_batch_ids
    FROM (
      SELECT id FROM public.game_history
      WHERE ts < v_cutoff_ms
      LIMIT v_batch_size
    ) sub;

    IF v_batch_ids IS NULL OR array_length(v_batch_ids, 1) IS NULL THEN
      EXIT;
    END IF;

    v_batch_count := array_length(v_batch_ids, 1);

    INSERT INTO public.archive_game_history (id, game_id, ts, msg, event)
    SELECT id, game_id, ts, msg, event
    FROM   public.game_history
    WHERE  id = ANY(v_batch_ids)
    ON CONFLICT (id) DO NOTHING;

    DELETE FROM public.game_history
    WHERE  id = ANY(v_batch_ids);

    v_total := v_total + v_batch_count;

    IF v_batch_count < v_batch_size THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'task',    'prune_old_game_history',
    'cutoff_days', p_days,
    'rows_archived', v_total
  );
END;
$$;


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
  v_uid        UUID := auth.uid();
  v_now        BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_id         UUID;
  v_msg        TEXT;
  v_event      JSONB;
  v_log_entry  JSONB;
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
  v_msg := 'Game created by ' || p_display_name;
  v_event := public._make_action_event('game_created', jsonb_build_object('actorId', v_uid::TEXT));
  v_log_entry := public._make_log_entry(v_now, v_msg, v_event);

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
    jsonb_build_array(v_log_entry),
    NULL, ARRAY[v_uid], p_join_code,
    0, v_now, p_settings,
    '{}', 0, NULL, NULL
  );

  INSERT INTO public.game_players (
    game_id, player_id, display_name, seat_index,
    connected, locks, locked_by, color_key, afk_strikes
  ) VALUES (
    v_id, v_uid, p_display_name, 0,
    TRUE, '{false,false,false}',
    '[null,null,null]'::JSONB,
    p_color_key, 0
  );

  INSERT INTO public.game_private_state (
    game_id, player_id, hand, drawn_card, drawn_card_source, known
  ) VALUES (
    v_id, v_uid, '[]'::JSONB, NULL, NULL, '{}'::JSONB
  );

  PERFORM public._append_game_history(v_id, v_now, v_msg, v_event);

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
  v_uid            UUID := auth.uid();
  v_now            BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game           public.games%ROWTYPE;
  v_seat           INT;
  v_name_lower     TEXT;
  v_assigned_color INT;
  v_taken_colors   INT[];
  v_available      INT[];
  v_msg            TEXT;
  v_event          JSONB;
  v_i              INT;
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
  v_msg := p_display_name || ' joined';
  v_event := public._make_action_event('player_joined', jsonb_build_object('actorId', v_uid::TEXT));

  UPDATE public.games SET
    player_order = player_order || v_uid,
    log = public._bounded_log_append(v_game.log, v_now, v_msg, v_event)
  WHERE id = p_game_id;

  INSERT INTO public.game_players (
    game_id, player_id, display_name, seat_index,
    connected, locks, locked_by, color_key, afk_strikes
  ) VALUES (
    p_game_id, v_uid, p_display_name, v_seat,
    TRUE, '{false,false,false}',
    '[null,null,null]'::JSONB,
    v_assigned_color, 0
  );

  INSERT INTO public.game_private_state (
    game_id, player_id, hand, drawn_card, drawn_card_source, known
  ) VALUES (
    p_game_id, v_uid, '[]'::JSONB, NULL, NULL, '{}'::JSONB
  );

  PERFORM public._append_game_history(p_game_id, v_now, v_msg, v_event);
END;
$$;


CREATE OR REPLACE FUNCTION public.start_game(p_game_id UUID, p_deck JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_now          BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game         public.games%ROWTYPE;
  v_player_count INT;
  v_cards_needed INT;
  v_cpp          INT;
  v_i            INT;
  v_pid          UUID;
  v_hand         JSONB;
  v_remaining    JSONB;
  v_msg          TEXT := 'Game started!';
  v_event        JSONB;
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

  v_cpp := COALESCE((v_game.settings->>'cardsPerPlayer')::INT, 3);
  IF v_cpp NOT IN (3, 4) THEN v_cpp := 3; END IF;

  v_cards_needed := v_player_count * v_cpp;

  IF jsonb_array_length(p_deck) < v_cards_needed THEN
    RAISE EXCEPTION 'Deck too small for player count';
  END IF;

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

    UPDATE public.game_players SET
      locks = array_fill(false, ARRAY[v_cpp]),
      locked_by = CASE WHEN v_cpp = 4
        THEN '[null,null,null,null]'::JSONB
        ELSE '[null,null,null]'::JSONB
      END
    WHERE game_id = p_game_id AND player_id = v_pid;
  END LOOP;

  v_remaining := (
    SELECT jsonb_agg(elem)
    FROM jsonb_array_elements(p_deck) WITH ORDINALITY AS t(elem, idx)
    WHERE t.idx > v_cards_needed
  );
  IF v_remaining IS NULL THEN v_remaining := '[]'::JSONB; END IF;

  INSERT INTO public.game_internal (game_id, draw_pile)
  VALUES (p_game_id, v_remaining)
  ON CONFLICT (game_id) DO UPDATE SET draw_pile = EXCLUDED.draw_pile;

  v_event := public._make_action_event('game_started', jsonb_build_object('actorId', v_uid::TEXT));

  UPDATE public.games SET
    status = 'active',
    current_turn_player_id = v_game.player_order[1],
    turn_phase = 'draw',
    draw_pile_count = jsonb_array_length(v_remaining),
    discard_top = NULL,
    action_version = 1,
    last_action_at = v_now,
    turn_start_at = v_now,
    log = jsonb_build_array(public._make_log_entry(v_now, v_msg, v_event))
  WHERE id = p_game_id;

  PERFORM public._append_game_history(p_game_id, v_now, v_msg, v_event);
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
  v_msg          TEXT;
  v_event        JSONB;
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
  IF v_finished.status != 'finished' THEN
    RAISE EXCEPTION 'Game is not finished';
  END IF;

  IF v_finished.rematch_lobby_id IS NOT NULL THEN
    SELECT id, status, player_order, max_players
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
        v_msg := p_display_name || ' joined';
        v_event := public._make_action_event('player_joined', jsonb_build_object('actorId', v_uid::TEXT));

        UPDATE public.games
          SET player_order = player_order || ARRAY[v_uid],
              log = public._bounded_log_append(log, v_now, v_msg, v_event)
          WHERE id = v_rematch.id;

        INSERT INTO public.game_players (
          game_id, player_id, display_name, seat_index,
          connected, locks, locked_by, color_key, afk_strikes
        ) VALUES (
          v_rematch.id, v_uid, p_display_name, v_seat_index,
          TRUE, '{false,false,false}', '[null,null,null]'::JSONB,
          p_color_key, 0
        );

        INSERT INTO public.game_private_state (
          game_id, player_id, hand, drawn_card, drawn_card_source, known
        ) VALUES (
          v_rematch.id, v_uid, '[]'::JSONB, NULL, NULL, '{}'::JSONB
        );

        PERFORM public._append_game_history(v_rematch.id, v_now, v_msg, v_event);

        RETURN v_rematch.id::TEXT;
      END IF;
    END IF;
  END IF;

  v_new_id := gen_random_uuid();
  v_msg := 'Game created by ' || p_display_name;
  v_event := public._make_action_event('game_created', jsonb_build_object('actorId', v_uid::TEXT));

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
    jsonb_build_array(public._make_log_entry(v_now, v_msg, v_event)),
    NULL, ARRAY[v_uid], p_join_code,
    0, v_now, p_settings,
    '{}', 0, NULL, NULL
  );

  INSERT INTO public.game_players (
    game_id, player_id, display_name, seat_index,
    connected, locks, locked_by, color_key, afk_strikes
  ) VALUES (
    v_new_id, v_uid, p_display_name, 0,
    TRUE, '{false,false,false}', '[null,null,null]'::JSONB,
    p_color_key, 0
  );

  INSERT INTO public.game_private_state (
    game_id, player_id, hand, drawn_card, drawn_card_source, known
  ) VALUES (
    v_new_id, v_uid, '[]'::JSONB, NULL, NULL, '{}'::JSONB
  );

  UPDATE public.games
    SET rematch_lobby_id = v_new_id
    WHERE id = p_finished_game_id;

  PERFORM public._append_game_history(v_new_id, v_now, v_msg, v_event);

  RETURN v_new_id::TEXT;
END;
$$;


CREATE OR REPLACE FUNCTION public.initiate_vote_kick(
  p_game_id        UUID,
  p_target_player  UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_now          BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game         RECORD;
  v_target_name  TEXT;
  v_voter_count  INT;
  v_required     INT;
  v_msg          TEXT;
  v_event        JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF v_game IS NULL THEN RAISE EXCEPTION 'Game not found'; END IF;

  IF v_game.status NOT IN ('active', 'ending') THEN
    RAISE EXCEPTION 'Game not active';
  END IF;
  IF array_length(v_game.player_order, 1) < 3 THEN
    RAISE EXCEPTION 'Vote kick requires at least 3 players';
  END IF;
  IF NOT (v_uid = ANY(v_game.player_order)) THEN
    RAISE EXCEPTION 'You are not in this game';
  END IF;
  IF NOT (p_target_player = ANY(v_game.player_order)) THEN
    RAISE EXCEPTION 'Target is not in this game';
  END IF;
  IF v_uid = p_target_player THEN
    RAISE EXCEPTION 'Cannot vote to kick yourself';
  END IF;
  IF (v_game.vote_kick->>'active')::BOOLEAN IS TRUE THEN
    RAISE EXCEPTION 'A vote is already in progress';
  END IF;

  SELECT display_name INTO v_target_name
    FROM public.game_players
    WHERE game_id = p_game_id AND player_id = p_target_player;

  v_voter_count := array_length(v_game.player_order, 1) - 1;
  v_required := ceil(v_voter_count::NUMERIC / 2);
  v_msg := 'Vote to kick ' || v_target_name || ' started.';
  v_event := public._make_action_event(
    'vote_kick_started',
    jsonb_build_object(
      'actorId', v_uid::TEXT,
      'targetPlayerId', p_target_player::TEXT,
      'requiredVotes', v_required
    )
  );

  UPDATE public.games
    SET vote_kick = jsonb_build_object(
          'active', TRUE,
          'targetId', p_target_player,
          'targetName', v_target_name,
          'startedBy', v_uid,
          'createdAt', v_now,
          'votes', jsonb_build_array(v_uid),
          'requiredVotes', v_required
        ),
        action_version = v_game.action_version + 1,
        log = public._bounded_log_append(v_game.log, v_now, v_msg, v_event)
    WHERE id = p_game_id;

  PERFORM public._append_game_history(p_game_id, v_now, v_msg, v_event);
END;
$$;


CREATE OR REPLACE FUNCTION public.cast_vote_kick(
  p_game_id  UUID,
  p_vote_yes BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_now         BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game        RECORD;
  v_vk          JSONB;
  v_target_pid  UUID;
  v_target_name TEXT;
  v_votes       JSONB;
  v_vote_count  INT;
  v_required    INT;
  v_new_order   UUID[];
  v_idx         INT;
  v_vote_dur    BIGINT;
  v_msg         TEXT;
  v_event       JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF v_game IS NULL THEN RAISE EXCEPTION 'Game not found'; END IF;

  v_vk := v_game.vote_kick;
  IF v_vk IS NULL OR (v_vk->>'active')::BOOLEAN IS NOT TRUE THEN
    RAISE EXCEPTION 'No active vote';
  END IF;
  IF NOT (v_uid = ANY(v_game.player_order)) THEN
    RAISE EXCEPTION 'You are not in this game';
  END IF;

  v_target_pid := (v_vk->>'targetId')::UUID;
  v_target_name := v_vk->>'targetName';
  v_required := (v_vk->>'requiredVotes')::INT;
  v_votes := v_vk->'votes';

  IF v_uid = v_target_pid THEN
    RAISE EXCEPTION 'Target cannot vote';
  END IF;
  IF v_votes @> to_jsonb(v_uid) THEN
    RAISE EXCEPTION 'Already voted';
  END IF;

  IF NOT p_vote_yes THEN
    v_vote_dur := v_now - COALESCE((v_vk->>'createdAt')::BIGINT, v_now);
    v_msg := 'Vote to kick ' || v_target_name || ' failed.';
    v_event := public._make_action_event(
      'vote_kick_cancelled',
      jsonb_build_object(
        'actorId', v_uid::TEXT,
        'targetPlayerId', v_target_pid::TEXT,
        'reason', 'vote_no'
      )
    );

    UPDATE public.games
      SET vote_kick = NULL,
          action_version = v_game.action_version + 1,
          turn_start_at = v_game.turn_start_at + v_vote_dur,
          log = public._bounded_log_append(v_game.log, v_now, v_msg, v_event)
      WHERE id = p_game_id;

    PERFORM public._append_game_history(p_game_id, v_now, v_msg, v_event);
    RETURN;
  END IF;

  v_votes := v_votes || to_jsonb(v_uid);
  v_vote_count := jsonb_array_length(v_votes);

  IF v_vote_count >= v_required THEN
    v_new_order := array_remove(v_game.player_order, v_target_pid);
    v_msg := CASE
      WHEN array_length(v_new_order, 1) < 2
        THEN v_target_name || ' was kicked. Not enough players — game over.'
      ELSE v_target_name || ' was kicked by vote.'
    END;
    v_event := public._make_action_event(
      'player_kicked',
      jsonb_build_object('playerId', v_target_pid::TEXT, 'reason', 'kick')
    );

    IF array_length(v_new_order, 1) < 2 THEN
      UPDATE public.games
        SET status = 'finished',
            current_turn_player_id = NULL,
            turn_phase = NULL,
            player_order = v_new_order,
            vote_kick = NULL,
            action_version = v_game.action_version + 1,
            last_action_at = v_now,
            turn_start_at = 0,
            log = public._bounded_log_append(v_game.log, v_now, v_msg, v_event)
        WHERE id = p_game_id;
    ELSE
      v_idx := array_position(v_game.player_order, v_target_pid);

      UPDATE public.games
        SET player_order = v_new_order,
            vote_kick = NULL,
            action_version = v_game.action_version + 1,
            last_action_at = v_now,
            current_turn_player_id = CASE
              WHEN v_game.current_turn_player_id = v_target_pid
              THEN v_new_order[((v_idx - 1) % array_length(v_new_order, 1)) + 1]
              ELSE v_game.current_turn_player_id
            END,
            turn_phase = CASE
              WHEN v_game.current_turn_player_id = v_target_pid THEN 'draw'
              ELSE v_game.turn_phase
            END,
            turn_start_at = CASE
              WHEN v_game.current_turn_player_id = v_target_pid THEN v_now
              ELSE v_game.turn_start_at
            END,
            host_id = CASE
              WHEN v_game.host_id = v_target_pid THEN v_new_order[1]
              ELSE v_game.host_id
            END,
            log = public._bounded_log_append(v_game.log, v_now, v_msg, v_event)
        WHERE id = p_game_id;
    END IF;

    UPDATE public.game_players
      SET connected = FALSE, afk_strikes = 0
      WHERE game_id = p_game_id AND player_id = v_target_pid;
    UPDATE public.game_private_state
      SET drawn_card = NULL, drawn_card_source = NULL
      WHERE game_id = p_game_id AND player_id = v_target_pid;

    PERFORM public._append_game_history(p_game_id, v_now, v_msg, v_event);
  ELSE
    v_msg := 'Vote to kick ' || v_target_name || ': ' || v_vote_count::TEXT || '/' || v_required::TEXT || ' votes.';
    v_event := public._make_action_event(
      'vote_kick_progress',
      jsonb_build_object(
        'actorId', v_uid::TEXT,
        'targetPlayerId', v_target_pid::TEXT,
        'votes', v_vote_count,
        'requiredVotes', v_required
      )
    );

    UPDATE public.games
      SET vote_kick = jsonb_set(v_vk, '{votes}', v_votes),
          action_version = v_game.action_version + 1,
          log = public._bounded_log_append(v_game.log, v_now, v_msg, v_event)
      WHERE id = p_game_id;

    PERFORM public._append_game_history(p_game_id, v_now, v_msg, v_event);
  END IF;
END;
$$;


CREATE OR REPLACE FUNCTION public.cancel_vote_kick(p_game_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_now          BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_game         RECORD;
  v_vote_dur     BIGINT;
  v_target_pid   UUID;
  v_cancel_reason TEXT;
  v_msg          TEXT;
  v_event        JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF v_game IS NULL THEN RETURN; END IF;

  IF v_game.vote_kick IS NULL OR (v_game.vote_kick->>'active')::BOOLEAN IS NOT TRUE THEN
    RETURN;
  END IF;

  IF v_uid <> (v_game.vote_kick->>'startedBy')::UUID
     AND v_uid <> v_game.host_id
  THEN
    RAISE EXCEPTION 'Only the vote initiator or host can cancel';
  END IF;

  v_vote_dur := v_now - COALESCE((v_game.vote_kick->>'createdAt')::BIGINT, v_now);
  v_target_pid := (v_game.vote_kick->>'targetId')::UUID;
  v_cancel_reason := CASE
    WHEN v_uid = (v_game.vote_kick->>'startedBy')::UUID THEN 'starter_cancel'
    ELSE 'host_cancel'
  END;
  v_msg := 'Vote to kick ' || (v_game.vote_kick->>'targetName') || ' was cancelled.';
  v_event := public._make_action_event(
    'vote_kick_cancelled',
    jsonb_build_object(
      'actorId', v_uid::TEXT,
      'targetPlayerId', v_target_pid::TEXT,
      'reason', v_cancel_reason
    )
  );

  UPDATE public.games
    SET vote_kick = NULL,
        action_version = v_game.action_version + 1,
        turn_start_at = v_game.turn_start_at + v_vote_dur,
        log = public._bounded_log_append(v_game.log, v_now, v_msg, v_event)
    WHERE id = p_game_id;

  PERFORM public._append_game_history(p_game_id, v_now, v_msg, v_event);
END;
$$;


CREATE OR REPLACE FUNCTION public.reveal_hand(p_game_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_now       BIGINT := (extract(epoch FROM clock_timestamp()) * 1000)::BIGINT;
  v_priv      public.game_private_state%ROWTYPE;
  v_pname     TEXT;
  v_total     INT := 0;
  v_sevens    INT := 0;
  v_card      JSONB;
  v_rank      TEXT;
  v_val       INT;
  v_i         INT;
  v_rows_inserted INT := 0;
  v_msg       TEXT;
  v_event     JSONB;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_priv FROM public.game_private_state
    WHERE game_id = p_game_id AND player_id = v_uid;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT display_name INTO v_pname
    FROM public.game_players WHERE game_id = p_game_id AND player_id = v_uid;
  IF NOT FOUND THEN RETURN; END IF;

  FOR v_i IN 0..jsonb_array_length(v_priv.hand)-1 LOOP
    v_card := v_priv.hand->v_i;
    IF COALESCE((v_card->>'isJoker')::BOOLEAN, FALSE) THEN
      v_val := 10;
    ELSE
      v_rank := v_card->>'rank';
      CASE v_rank
        WHEN '7' THEN v_val := 0; v_sevens := v_sevens + 1;
        WHEN 'A' THEN v_val := 1;
        WHEN '2' THEN v_val := 2;
        WHEN '3' THEN v_val := 3;
        WHEN '4' THEN v_val := 4;
        WHEN '5' THEN v_val := 5;
        WHEN '6' THEN v_val := 6;
        WHEN '8' THEN v_val := 8;
        WHEN '9' THEN v_val := 9;
        WHEN '10','J','Q','K' THEN v_val := 10;
        ELSE v_val := 0;
      END CASE;
    END IF;
    v_total := v_total + v_val;
  END LOOP;

  INSERT INTO public.game_reveals (game_id, player_id, display_name, hand, total, sevens)
  VALUES (p_game_id, v_uid, v_pname, v_priv.hand, v_total, v_sevens)
  ON CONFLICT (game_id, player_id) DO NOTHING;

  GET DIAGNOSTICS v_rows_inserted = ROW_COUNT;
  IF v_rows_inserted = 0 THEN
    RETURN;
  END IF;

  v_msg := v_pname || ' revealed their hand (' || v_total::TEXT || ' points, ' || v_sevens::TEXT || ' sevens).';
  v_event := public._make_action_event(
    'hand_revealed',
    jsonb_build_object(
      'actorId', v_uid::TEXT,
      'total', v_total,
      'sevens', v_sevens
    )
  );

  PERFORM public._append_game_history(p_game_id, v_now, v_msg, v_event);
END;
$$;
