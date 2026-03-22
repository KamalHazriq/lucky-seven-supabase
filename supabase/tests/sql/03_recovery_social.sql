DO $$
DECLARE
  v_alice          UUID := '00000000-0000-0000-0000-000000000301';
  v_bob            UUID := '00000000-0000-0000-0000-000000000302';
  v_carol          UUID := '00000000-0000-0000-0000-000000000303';
  v_game_id        UUID;
  v_game           public.games%ROWTYPE;
  v_alice_player   public.game_players%ROWTYPE;
  v_expected_ver   INT;
BEGIN
  PERFORM test_support.set_auth(v_alice);
  v_game_id := public.create_game(
    'Alice',
    3,
    test_support.settings(),
    'TAFKS1',
    'seed-afk-skip',
    0
  )::UUID;

  PERFORM test_support.set_auth(v_bob);
  PERFORM public.join_game(v_game_id, 'Bob', 1);

  PERFORM test_support.set_auth(v_carol);
  PERFORM public.join_game(v_game_id, 'Carol', 2);

  PERFORM test_support.set_auth(v_alice);
  PERFORM public.start_game(
    v_game_id,
    jsonb_build_array(
      test_support.card('alice-a', 'A', 'hearts'),
      test_support.card('alice-2', '2', 'clubs'),
      test_support.card('alice-3', '3', 'spades'),
      test_support.card('bob-4', '4', 'diamonds'),
      test_support.card('bob-5', '5', 'hearts'),
      test_support.card('bob-6', '6', 'clubs'),
      test_support.card('carol-7', '7', 'spades'),
      test_support.card('carol-8', '8', 'diamonds'),
      test_support.card('carol-9', '9', 'hearts'),
      test_support.card('afk-draw', '10', 'clubs'),
      test_support.card('bob-draw', 'J', 'spades'),
      test_support.card('carol-draw', 'Q', 'diamonds'),
      test_support.card('reserve-draw', 'K', 'clubs')
    )
  );

  PERFORM public.draw_from_pile(v_game_id);
  SELECT action_version INTO v_expected_ver FROM public.games WHERE id = v_game_id;

  PERFORM test_support.set_auth(v_bob);
  PERFORM public.skip_turn(v_game_id, v_expected_ver);

  SELECT * INTO v_game FROM public.games WHERE id = v_game_id;
  SELECT * INTO v_alice_player FROM public.game_players WHERE game_id = v_game_id AND player_id = v_alice;

  PERFORM test_support.assert_true(v_game.discard_top->>'id' = 'afk-draw', 'skip_turn should auto-discard the staged card on the first AFK strike');
  PERFORM test_support.assert_true(v_game.current_turn_player_id = v_bob, 'skip_turn should advance to the next player after the first AFK strike');
  PERFORM test_support.assert_true(v_alice_player.afk_strikes = 1, 'skip_turn should increment AFK strikes on the first timeout');

  PERFORM public.draw_from_pile(v_game_id);
  PERFORM public.discard_drawn(v_game_id);

  PERFORM test_support.set_auth(v_carol);
  PERFORM public.draw_from_pile(v_game_id);
  PERFORM public.discard_drawn(v_game_id);

  SELECT action_version INTO v_expected_ver FROM public.games WHERE id = v_game_id;
  PERFORM public.skip_turn(v_game_id, v_expected_ver);

  SELECT * INTO v_game FROM public.games WHERE id = v_game_id;
  SELECT * INTO v_alice_player FROM public.game_players WHERE game_id = v_game_id AND player_id = v_alice;

  PERFORM test_support.assert_true(NOT (v_alice = ANY(v_game.player_order)), 'skip_turn should remove the player after the second AFK strike');
  PERFORM test_support.assert_true(v_game.current_turn_player_id = v_bob, 'AFK kick should pass the turn to the next remaining player');
  PERFORM test_support.assert_true(v_alice_player.connected IS FALSE, 'AFK-kicked players should be marked disconnected');
  PERFORM test_support.assert_true(
    test_support.last_history_event(v_game_id)->>'kind' = 'player_kicked'
      AND test_support.last_history_event(v_game_id)->>'reason' = 'afk',
    'AFK kick should emit a structured player_kicked event with afk reason'
  );
END;
$$;


DO $$
DECLARE
  v_alice        UUID := '00000000-0000-0000-0000-000000000311';
  v_bob          UUID := '00000000-0000-0000-0000-000000000312';
  v_carol        UUID := '00000000-0000-0000-0000-000000000313';
  v_dave         UUID := '00000000-0000-0000-0000-000000000314';
  v_erin         UUID := '00000000-0000-0000-0000-000000000315';
  v_frank        UUID := '00000000-0000-0000-0000-000000000316';
  v_game_id      UUID;
  v_game         public.games%ROWTYPE;
  v_frank_player public.game_players%ROWTYPE;
BEGIN
  PERFORM test_support.set_auth(v_alice);
  v_game_id := public.create_game(
    'Alice',
    6,
    test_support.settings(),
    'TVOTE1',
    'seed-vote-kick-progress',
    0
  )::UUID;

  PERFORM test_support.set_auth(v_bob);
  PERFORM public.join_game(v_game_id, 'Bob', 1);
  PERFORM test_support.set_auth(v_carol);
  PERFORM public.join_game(v_game_id, 'Carol', 2);
  PERFORM test_support.set_auth(v_dave);
  PERFORM public.join_game(v_game_id, 'Dave', 3);
  PERFORM test_support.set_auth(v_erin);
  PERFORM public.join_game(v_game_id, 'Erin', 4);
  PERFORM test_support.set_auth(v_frank);
  PERFORM public.join_game(v_game_id, 'Frank', 5);

  PERFORM test_support.set_auth(v_alice);
  PERFORM public.start_game(
    v_game_id,
    jsonb_build_array(
      test_support.card('c01', 'A', 'hearts'),
      test_support.card('c02', '2', 'clubs'),
      test_support.card('c03', '3', 'spades'),
      test_support.card('c04', '4', 'diamonds'),
      test_support.card('c05', '5', 'hearts'),
      test_support.card('c06', '6', 'clubs'),
      test_support.card('c07', '7', 'spades'),
      test_support.card('c08', '8', 'diamonds'),
      test_support.card('c09', '9', 'hearts'),
      test_support.card('c10', '10', 'clubs'),
      test_support.card('c11', 'J', 'spades'),
      test_support.card('c12', 'Q', 'diamonds'),
      test_support.card('c13', 'K', 'hearts'),
      test_support.card('c14', 'A', 'clubs'),
      test_support.card('c15', '2', 'spades'),
      test_support.card('c16', '3', 'diamonds'),
      test_support.card('c17', '4', 'hearts'),
      test_support.card('c18', '5', 'clubs'),
      test_support.card('c19', '6', 'spades')
    )
  );

  PERFORM public.initiate_vote_kick(v_game_id, v_frank);
  PERFORM test_support.assert_true(
    test_support.last_history_event(v_game_id)->>'kind' = 'vote_kick_started'
      AND (test_support.last_history_event(v_game_id)->>'requiredVotes')::INT = 3,
    'initiate_vote_kick should emit the required vote threshold'
  );

  PERFORM test_support.set_auth(v_bob);
  PERFORM public.cast_vote_kick(v_game_id, TRUE);
  PERFORM test_support.assert_true(
    test_support.last_history_event(v_game_id)->>'kind' = 'vote_kick_progress'
      AND (test_support.last_history_event(v_game_id)->>'votes')::INT = 2,
    'cast_vote_kick should emit a progress event before the threshold is reached'
  );

  PERFORM test_support.set_auth(v_carol);
  PERFORM public.cast_vote_kick(v_game_id, TRUE);

  SELECT * INTO v_game FROM public.games WHERE id = v_game_id;
  SELECT * INTO v_frank_player FROM public.game_players WHERE game_id = v_game_id AND player_id = v_frank;

  PERFORM test_support.assert_true(NOT (v_frank = ANY(v_game.player_order)), 'successful vote kick should remove the target from player_order');
  PERFORM test_support.assert_true(v_frank_player.connected IS FALSE, 'successful vote kick should disconnect the target player');
  PERFORM test_support.assert_true(
    test_support.last_history_event(v_game_id)->>'kind' = 'player_kicked'
      AND test_support.last_history_event(v_game_id)->>'reason' = 'kick',
    'successful vote kick should emit a structured kick event'
  );
END;
$$;


DO $$
DECLARE
  v_alice   UUID := '00000000-0000-0000-0000-000000000321';
  v_bob     UUID := '00000000-0000-0000-0000-000000000322';
  v_carol   UUID := '00000000-0000-0000-0000-000000000323';
  v_dave    UUID := '00000000-0000-0000-0000-000000000324';
  v_game_id UUID;
  v_game    public.games%ROWTYPE;
BEGIN
  PERFORM test_support.set_auth(v_alice);
  v_game_id := public.create_game(
    'Alice',
    4,
    test_support.settings(),
    'TVOTE2',
    'seed-vote-kick-cancel',
    0
  )::UUID;

  PERFORM test_support.set_auth(v_bob);
  PERFORM public.join_game(v_game_id, 'Bob', 1);
  PERFORM test_support.set_auth(v_carol);
  PERFORM public.join_game(v_game_id, 'Carol', 2);
  PERFORM test_support.set_auth(v_dave);
  PERFORM public.join_game(v_game_id, 'Dave', 3);

  PERFORM test_support.set_auth(v_alice);
  PERFORM public.start_game(
    v_game_id,
    jsonb_build_array(
      test_support.card('v1', 'A', 'hearts'),
      test_support.card('v2', '2', 'clubs'),
      test_support.card('v3', '3', 'spades'),
      test_support.card('v4', '4', 'diamonds'),
      test_support.card('v5', '5', 'hearts'),
      test_support.card('v6', '6', 'clubs'),
      test_support.card('v7', '7', 'spades'),
      test_support.card('v8', '8', 'diamonds'),
      test_support.card('v9', '9', 'hearts'),
      test_support.card('v10', '10', 'clubs'),
      test_support.card('v11', 'J', 'spades'),
      test_support.card('v12', 'Q', 'diamonds'),
      test_support.card('v13', 'K', 'hearts')
    )
  );

  PERFORM public.initiate_vote_kick(v_game_id, v_dave);

  PERFORM test_support.set_auth(v_bob);
  PERFORM public.cast_vote_kick(v_game_id, FALSE);

  SELECT * INTO v_game FROM public.games WHERE id = v_game_id;
  PERFORM test_support.assert_true(v_game.vote_kick IS NULL, 'vote no should cancel the active vote');
  PERFORM test_support.assert_true(
    test_support.last_history_event(v_game_id)->>'kind' = 'vote_kick_cancelled'
      AND test_support.last_history_event(v_game_id)->>'reason' = 'vote_no',
    'vote no should emit a structured vote_kick_cancelled event'
  );
END;
$$;


DO $$
DECLARE
  v_alice        UUID := '00000000-0000-0000-0000-000000000331';
  v_bob          UUID := '00000000-0000-0000-0000-000000000332';
  v_finished_id  UUID;
  v_rematch_id_1 UUID;
  v_rematch_id_2 UUID;
  v_rematch      public.games%ROWTYPE;
BEGIN
  PERFORM test_support.set_auth(v_alice);
  v_finished_id := public.create_game(
    'Alice',
    2,
    test_support.settings(),
    'TRMAT1',
    'seed-rematch-origin',
    0
  )::UUID;

  PERFORM test_support.set_auth(v_bob);
  PERFORM public.join_game(v_finished_id, 'Bob', 1);

  PERFORM test_support.set_auth(v_alice);
  PERFORM public.start_game(
    v_finished_id,
    jsonb_build_array(
      test_support.card('r1', 'A', 'hearts'),
      test_support.card('r2', '2', 'clubs'),
      test_support.card('r3', '3', 'spades'),
      test_support.card('r4', '4', 'diamonds'),
      test_support.card('r5', '5', 'hearts'),
      test_support.card('r6', '6', 'clubs'),
      test_support.card('r7', '7', 'spades')
    )
  );

  UPDATE public.games
    SET status = 'finished',
        current_turn_player_id = NULL,
        turn_phase = NULL
    WHERE id = v_finished_id;

  v_rematch_id_1 := public.play_again(
    v_finished_id,
    'Alice',
    2,
    test_support.settings(),
    'TRMAT2',
    'seed-rematch-new',
    0
  )::UUID;

  PERFORM test_support.set_auth(v_bob);
  v_rematch_id_2 := public.play_again(
    v_finished_id,
    'Bob',
    2,
    test_support.settings(),
    'TRMAT3',
    'seed-rematch-join',
    1
  )::UUID;

  SELECT * INTO v_rematch FROM public.games WHERE id = v_rematch_id_1;

  PERFORM test_support.assert_true(v_rematch_id_1 = v_rematch_id_2, 'play_again should converge everyone onto the same rematch lobby');
  PERFORM test_support.assert_true(v_rematch.status = 'lobby', 'play_again should create a fresh lobby for the rematch');
  PERFORM test_support.assert_true(array_length(v_rematch.player_order, 1) = 2, 'play_again should allow later callers to join the existing rematch lobby');
  PERFORM test_support.assert_true(
    (SELECT rematch_lobby_id FROM public.games WHERE id = v_finished_id) = v_rematch_id_1,
    'play_again should back-link the finished game to its rematch lobby'
  );
  PERFORM test_support.assert_true(
    test_support.history_event_count(v_rematch_id_1, 'game_created') = 1
      AND test_support.history_event_count(v_rematch_id_1, 'player_joined') = 1,
    'play_again should preserve structured history for both rematch creation and later joins'
  );
END;
$$;
