DO $$
DECLARE
  v_alice    UUID := '00000000-0000-0000-0000-000000000201';
  v_bob      UUID := '00000000-0000-0000-0000-000000000202';
  v_game_id  UUID;
  v_result   JSONB;
  v_priv     public.game_private_state%ROWTYPE;
BEGIN
  PERFORM test_support.set_auth(v_alice);
  v_game_id := public.create_game(
    'Alice',
    2,
    test_support.settings(
      jsonb_build_object(
        'powerAssignments', jsonb_build_object(
          '10', 'peek_one_of_your_cards',
          'J', 'peek_all_three_of_your_cards',
          'Q', 'swap_one_to_one',
          'K', 'lock_one_card',
          'JOKER', 'rearrange_cards'
        )
      )
    ),
    'TPWRP1',
    'seed-powers-peek',
    0
  )::UUID;

  PERFORM test_support.set_auth(v_bob);
  PERFORM public.join_game(v_game_id, 'Bob', 1);

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
      test_support.card('peek-one', '10', 'spades'),
      test_support.card('peek-all', 'J', 'diamonds'),
      test_support.card('peek-opponent', '10', 'clubs'),
      test_support.card('peek-all-opponent', 'J', 'hearts')
    )
  );

  PERFORM public.draw_from_pile(v_game_id);
  SELECT public.use_peek_one(v_game_id, 0, FALSE) INTO v_result;

  SELECT * INTO v_priv FROM public.game_private_state WHERE game_id = v_game_id AND player_id = v_alice;
  PERFORM test_support.assert_true(v_result->>'id' = 'alice-a', 'use_peek_one should reveal the selected own card');
  PERFORM test_support.assert_true(v_priv.known->'0'->>'id' = 'alice-a', 'use_peek_one should persist self knowledge in normal mode');
  PERFORM test_support.assert_true(
    test_support.last_history_event(v_game_id)->>'kind' = 'power_peek'
      AND test_support.last_history_event(v_game_id)->>'variant' = 'self_one',
    'use_peek_one should emit a structured self_one power_peek event'
  );

  PERFORM test_support.set_auth(v_bob);
  PERFORM public.draw_from_pile(v_game_id);
  SELECT public.use_peek_all(v_game_id, FALSE) INTO v_result;

  SELECT * INTO v_priv FROM public.game_private_state WHERE game_id = v_game_id AND player_id = v_bob;
  PERFORM test_support.assert_true(
    jsonb_object_length(v_result) = 3,
    'use_peek_all should reveal all unlocked self cards'
  );
  PERFORM test_support.assert_true(v_priv.known->'2'->>'id' = 'bob-6', 'use_peek_all should persist revealed cards in known');
  PERFORM test_support.assert_true(
    test_support.last_history_event(v_game_id)->>'kind' = 'power_peek'
      AND test_support.last_history_event(v_game_id)->>'variant' = 'self_all',
    'use_peek_all should emit a structured self_all power_peek event'
  );

  PERFORM test_support.set_auth(v_alice);
  PERFORM public.draw_from_pile(v_game_id);
  SELECT public.use_peek_opponent(v_game_id, v_bob, 2, FALSE) INTO v_result;

  SELECT * INTO v_priv FROM public.game_private_state WHERE game_id = v_game_id AND player_id = v_alice;
  PERFORM test_support.assert_true(v_result->'card'->>'id' = 'bob-6', 'use_peek_opponent should reveal the requested opponent card');
  PERFORM test_support.assert_true(
    v_priv.opponent_known->(v_bob::TEXT)->'2'->>'id' = 'bob-6',
    'use_peek_opponent should persist opponent knowledge in normal mode'
  );
  PERFORM test_support.assert_true(
    test_support.last_history_event(v_game_id)->>'kind' = 'power_peek'
      AND test_support.last_history_event(v_game_id)->>'variant' = 'opponent_one',
    'use_peek_opponent should emit a structured opponent_one power_peek event'
  );

  PERFORM test_support.set_auth(v_bob);
  PERFORM public.draw_from_pile(v_game_id);
  SELECT public.use_peek_all_opponent(v_game_id, v_alice, FALSE) INTO v_result;

  SELECT * INTO v_priv FROM public.game_private_state WHERE game_id = v_game_id AND player_id = v_bob;
  PERFORM test_support.assert_true(
    jsonb_object_length(v_result->'cards') = 3,
    'use_peek_all_opponent should reveal all unlocked opponent cards'
  );
  PERFORM test_support.assert_true(
    v_priv.opponent_known->(v_alice::TEXT)->'0'->>'id' = 'alice-a',
    'use_peek_all_opponent should persist revealed opponent cards'
  );
  PERFORM test_support.assert_true(
    test_support.last_history_event(v_game_id)->>'kind' = 'power_peek'
      AND test_support.last_history_event(v_game_id)->>'variant' = 'opponent_all',
    'use_peek_all_opponent should emit a structured opponent_all power_peek event'
  );
END;
$$;


DO $$
DECLARE
  v_alice      UUID := '00000000-0000-0000-0000-000000000211';
  v_bob        UUID := '00000000-0000-0000-0000-000000000212';
  v_game_id    UUID;
  v_alice_hand JSONB;
  v_alice_priv public.game_private_state%ROWTYPE;
  v_locks      BOOLEAN[];
BEGIN
  PERFORM test_support.set_auth(v_alice);
  v_game_id := public.create_game(
    'Alice',
    2,
    test_support.settings(),
    'TPWRP2',
    'seed-powers-control',
    0
  )::UUID;

  PERFORM test_support.set_auth(v_bob);
  PERFORM public.join_game(v_game_id, 'Bob', 1);

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
      test_support.card('lock-card', 'K', 'spades'),
      test_support.card('unlock-card', '10', 'diamonds'),
      test_support.card('swap-card', 'Q', 'clubs'),
      test_support.card('chaos-card', 'A', 'hearts', TRUE)
    )
  );

  PERFORM public.draw_from_pile(v_game_id);
  PERFORM public.use_lock(v_game_id, v_bob, 1);

  SELECT locks INTO v_locks FROM public.game_players WHERE game_id = v_game_id AND player_id = v_bob;
  PERFORM test_support.assert_true(v_locks[2] IS TRUE, 'use_lock should lock the targeted slot');
  PERFORM test_support.assert_true(
    test_support.last_history_event(v_game_id)->>'kind' = 'power_lock',
    'use_lock should emit a structured power_lock event'
  );

  PERFORM test_support.set_auth(v_bob);
  PERFORM public.draw_from_pile(v_game_id);
  PERFORM public.use_unlock(v_game_id, v_bob, 1);

  SELECT locks INTO v_locks FROM public.game_players WHERE game_id = v_game_id AND player_id = v_bob;
  PERFORM test_support.assert_true(v_locks[2] IS FALSE, 'use_unlock should clear the lock from the targeted slot');
  PERFORM test_support.assert_true(
    test_support.last_history_event(v_game_id)->>'kind' = 'power_unlock'
      AND COALESCE((test_support.last_history_event(v_game_id)->>'fizzled')::BOOLEAN, TRUE) IS FALSE,
    'use_unlock should emit a structured non-fizzled power_unlock event'
  );

  PERFORM test_support.set_auth(v_alice);
  PERFORM public.draw_from_pile(v_game_id);
  PERFORM public.use_swap_power(v_game_id, v_alice, 0, v_bob, 0);

  SELECT hand INTO v_alice_hand FROM public.game_private_state WHERE game_id = v_game_id AND player_id = v_alice;
  PERFORM test_support.assert_true(v_alice_hand->0->>'id' = 'bob-4', 'use_swap_power should swap the selected cards');
  PERFORM test_support.assert_true(
    test_support.last_history_event(v_game_id)->>'kind' = 'power_swap',
    'use_swap_power should emit a structured power_swap event'
  );

  UPDATE public.game_private_state
    SET known = jsonb_build_object('0', hand->0, '1', hand->1)
    WHERE game_id = v_game_id AND player_id = v_alice;

  PERFORM test_support.set_auth(v_bob);
  PERFORM public.draw_from_pile(v_game_id);
  PERFORM setseed(0.42);
  PERFORM public.use_rearrange(v_game_id, v_alice);

  SELECT * INTO v_alice_priv FROM public.game_private_state WHERE game_id = v_game_id AND player_id = v_alice;
  PERFORM test_support.assert_true(
    test_support.last_history_event(v_game_id)->>'kind' = 'power_rearrange',
    'use_rearrange should emit a structured power_rearrange event'
  );
  PERFORM test_support.assert_true(
    jsonb_array_length(v_alice_priv.hand) = 3,
    'use_rearrange should leave a valid hand after shuffling'
  );
  PERFORM test_support.assert_true(
    v_alice_priv.known = '{}'::JSONB,
    'use_rearrange should clear stale self-knowledge for the shuffled unlocked slots'
  );
END;
$$;


DO $$
DECLARE
  v_alice    UUID := '00000000-0000-0000-0000-000000000221';
  v_bob      UUID := '00000000-0000-0000-0000-000000000222';
  v_game_id  UUID;
  v_reveal   public.game_reveals%ROWTYPE;
BEGIN
  PERFORM test_support.set_auth(v_alice);
  v_game_id := public.create_game(
    'Alice',
    2,
    test_support.settings(),
    'TPWRS3',
    'seed-reveal-score',
    0
  )::UUID;

  PERFORM test_support.set_auth(v_bob);
  PERFORM public.join_game(v_game_id, 'Bob', 1);

  PERFORM test_support.set_auth(v_alice);
  PERFORM public.start_game(
    v_game_id,
    jsonb_build_array(
      test_support.card('tmp-a', 'A', 'hearts'),
      test_support.card('tmp-2', '2', 'clubs'),
      test_support.card('tmp-3', '3', 'spades'),
      test_support.card('tmp-4', '4', 'diamonds'),
      test_support.card('tmp-5', '5', 'hearts'),
      test_support.card('tmp-6', '6', 'clubs'),
      test_support.card('tmp-7', '7', 'spades')
    )
  );

  UPDATE public.game_private_state
    SET hand = jsonb_build_array(
      test_support.card('joker-score', 'A', 'hearts', TRUE),
      test_support.card('seven-score', '7', 'clubs'),
      test_support.card('ace-score', 'A', 'spades')
    )
    WHERE game_id = v_game_id AND player_id = v_alice;

  PERFORM public.reveal_hand(v_game_id);
  PERFORM public.reveal_hand(v_game_id);

  SELECT * INTO v_reveal
    FROM public.game_reveals
    WHERE game_id = v_game_id AND player_id = v_alice;

  PERFORM test_support.assert_true(v_reveal.total = 11, 'reveal_hand should score Joker as 10, seven as 0, and ace as 1');
  PERFORM test_support.assert_true(v_reveal.sevens = 1, 'reveal_hand should count sevens for tie-breakers');
  PERFORM test_support.assert_true(
    test_support.history_event_count(v_game_id, 'hand_revealed') = 1,
    'reveal_hand should be idempotent and only emit one hand_revealed event'
  );
  PERFORM test_support.assert_true(
    test_support.last_history_event(v_game_id)->>'kind' = 'hand_revealed'
      AND (test_support.last_history_event(v_game_id)->>'total')::INT = 11,
    'reveal_hand should emit structured scoring details'
  );
END;
$$;
