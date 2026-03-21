DO $$
DECLARE
  v_alice   UUID := '00000000-0000-0000-0000-000000000101';
  v_bob     UUID := '00000000-0000-0000-0000-000000000102';
  v_game_id UUID;
  v_game    public.games%ROWTYPE;
  v_priv    public.game_private_state%ROWTYPE;
BEGIN
  PERFORM test_support.set_auth(v_alice);
  v_game_id := public.create_game(
    'Alice',
    2,
    test_support.settings(),
    'TCORE1',
    'seed-core-1',
    0
  )::UUID;

  PERFORM test_support.assert_true(
    test_support.last_history_event(v_game_id)->>'kind' = 'game_created',
    'create_game should emit a structured game_created event'
  );

  PERFORM test_support.set_auth(v_bob);
  PERFORM public.join_game(v_game_id, 'Bob', 1);

  PERFORM test_support.assert_true(
    test_support.last_history_event(v_game_id)->>'kind' = 'player_joined',
    'join_game should emit a structured player_joined event'
  );

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
      test_support.card('draw-7', '7', 'spades'),
      test_support.card('draw-8', '8', 'hearts')
    )
  );

  SELECT * INTO v_game FROM public.games WHERE id = v_game_id;
  PERFORM test_support.assert_true(v_game.status = 'active', 'start_game should activate the game');
  PERFORM test_support.assert_true(v_game.current_turn_player_id = v_alice, 'host should take the first turn');
  PERFORM test_support.assert_true(
    test_support.last_history_event(v_game_id)->>'kind' = 'game_started',
    'start_game should emit a structured game_started event'
  );

  PERFORM public.draw_from_pile(v_game_id);

  SELECT * INTO v_game FROM public.games WHERE id = v_game_id;
  SELECT * INTO v_priv FROM public.game_private_state WHERE game_id = v_game_id AND player_id = v_alice;

  PERFORM test_support.assert_true(v_game.turn_phase = 'action', 'draw_from_pile should move the turn to action phase');
  PERFORM test_support.assert_true(v_game.draw_pile_count = 1, 'draw_from_pile should decrement the draw pile count');
  PERFORM test_support.assert_true(v_priv.drawn_card->>'id' = 'draw-7', 'draw_from_pile should place the top card into drawn_card');
  PERFORM test_support.assert_true(v_priv.drawn_card_source = 'pile', 'draw_from_pile should track the source');
  PERFORM test_support.assert_true(
    test_support.last_history_event(v_game_id)->>'kind' = 'draw_pile',
    'draw_from_pile should emit a structured draw_pile event'
  );
  PERFORM test_support.assert_true(
    test_support.last_log_event(v_game_id)->>'kind' = 'draw_pile',
    'draw_from_pile should store the structured event in the bounded game log'
  );

  PERFORM public.discard_drawn(v_game_id);

  SELECT * INTO v_game FROM public.games WHERE id = v_game_id;
  SELECT * INTO v_priv FROM public.game_private_state WHERE game_id = v_game_id AND player_id = v_alice;

  PERFORM test_support.assert_true(v_game.discard_top->>'id' = 'draw-7', 'discard_drawn should move the drawn card to discard');
  PERFORM test_support.assert_true(v_game.current_turn_player_id = v_bob, 'discard_drawn should advance the turn');
  PERFORM test_support.assert_true(v_game.turn_phase = 'draw', 'discard_drawn should reset the next turn to draw phase');
  PERFORM test_support.assert_true(v_priv.drawn_card IS NULL, 'discard_drawn should clear drawn_card');
  PERFORM test_support.assert_true(
    test_support.last_history_event(v_game_id)->>'kind' = 'discard_drawn',
    'discard_drawn should emit a structured discard event'
  );

  PERFORM test_support.set_auth(v_bob);
  PERFORM public.take_from_discard(v_game_id);

  SELECT * INTO v_game FROM public.games WHERE id = v_game_id;
  SELECT * INTO v_priv FROM public.game_private_state WHERE game_id = v_game_id AND player_id = v_bob;

  PERFORM test_support.assert_true(v_game.discard_top IS NULL, 'take_from_discard should clear the public discard pile');
  PERFORM test_support.assert_true(v_game.turn_phase = 'action', 'take_from_discard should move to action phase');
  PERFORM test_support.assert_true(v_priv.drawn_card->>'id' = 'draw-7', 'take_from_discard should move the discard to drawn_card');
  PERFORM test_support.assert_true(v_priv.drawn_card_source = 'discard', 'take_from_discard should preserve discard source');
  PERFORM test_support.assert_true(
    test_support.last_history_event(v_game_id)->>'kind' = 'take_discard',
    'take_from_discard should emit a structured take_discard event'
  );

  PERFORM public.cancel_draw(v_game_id);

  SELECT * INTO v_game FROM public.games WHERE id = v_game_id;
  SELECT * INTO v_priv FROM public.game_private_state WHERE game_id = v_game_id AND player_id = v_bob;

  PERFORM test_support.assert_true(v_game.discard_top->>'id' = 'draw-7', 'cancel_draw should restore the discard top');
  PERFORM test_support.assert_true(v_game.turn_phase = 'draw', 'cancel_draw should restore draw phase');
  PERFORM test_support.assert_true(v_game.current_turn_player_id = v_bob, 'cancel_draw should keep the current player');
  PERFORM test_support.assert_true(v_priv.drawn_card IS NULL, 'cancel_draw should clear the staged card');
  PERFORM test_support.assert_true(
    test_support.last_history_event(v_game_id)->>'kind' = 'cancel_draw',
    'cancel_draw should emit a structured cancel_draw event'
  );

  PERFORM public.take_from_discard(v_game_id);
  PERFORM public.swap_with_slot(v_game_id, 1);

  SELECT * INTO v_game FROM public.games WHERE id = v_game_id;
  SELECT * INTO v_priv FROM public.game_private_state WHERE game_id = v_game_id AND player_id = v_bob;

  PERFORM test_support.assert_true(v_priv.hand->1->>'id' = 'draw-7', 'swap_with_slot should place the drawn card into the requested slot');
  PERFORM test_support.assert_true(v_game.discard_top->>'id' = 'bob-5', 'swap_with_slot should discard the replaced card');
  PERFORM test_support.assert_true(v_game.current_turn_player_id = v_alice, 'swap_with_slot should end the acting player turn');
  PERFORM test_support.assert_true(v_game.turn_phase = 'draw', 'swap_with_slot should reset the next turn to draw phase');
  PERFORM test_support.assert_true(
    test_support.last_history_event(v_game_id)->>'kind' = 'swap_slot'
      AND (test_support.last_history_event(v_game_id)->>'slotIndex')::INT = 1,
    'swap_with_slot should emit a structured swap_slot event with the affected slot'
  );

  PERFORM test_support.set_auth(v_alice);
  PERFORM public.call_end(v_game_id);

  SELECT * INTO v_game FROM public.games WHERE id = v_game_id;

  PERFORM test_support.assert_true(v_game.status = 'ending', 'call_end should move the game into ending state');
  PERFORM test_support.assert_true(v_game.end_called_by = v_alice, 'call_end should record the caller');
  PERFORM test_support.assert_true(
    test_support.last_history_event(v_game_id)->>'kind' = 'call_end',
    'call_end should emit a structured call_end event'
  );
END;
$$;
