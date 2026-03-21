CREATE SCHEMA IF NOT EXISTS test_support;

CREATE OR REPLACE FUNCTION test_support.assert_true(
  p_condition BOOLEAN,
  p_message   TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT COALESCE(p_condition, FALSE) THEN
    RAISE EXCEPTION 'assertion failed: %', p_message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION test_support.set_auth(p_uid UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid::TEXT, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION test_support.card(
  p_id      TEXT,
  p_rank    TEXT,
  p_suit    TEXT DEFAULT 'hearts',
  p_joker   BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_strip_nulls(
    jsonb_build_object(
      'id', p_id,
      'rank', p_rank,
      'suit', p_suit,
      'isJoker', CASE WHEN p_joker THEN TRUE ELSE NULL END
    )
  );
$$;

CREATE OR REPLACE FUNCTION test_support.settings(
  p_overrides JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'powerAssignments', jsonb_build_object(
      '10', 'unlock_one_locked_card',
      'J', 'peek_all_three_of_your_cards',
      'Q', 'swap_one_to_one',
      'K', 'lock_one_card',
      'JOKER', 'rearrange_cards'
    ),
    'jokerCount', 2,
    'deckSize', 1,
    'turnSeconds', 0,
    'peekAllowsOpponent', TRUE,
    'cardsPerPlayer', 3,
    'noMemoryMode', FALSE
  ) || COALESCE(p_overrides, '{}'::JSONB);
$$;

CREATE OR REPLACE FUNCTION test_support.last_history_event(p_game_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT gh.event
  FROM public.game_history gh
  WHERE gh.game_id = p_game_id
  ORDER BY gh.ts DESC, gh.id DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION test_support.last_log_event(p_game_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN jsonb_array_length(g.log) = 0 THEN NULL
    ELSE g.log->(jsonb_array_length(g.log) - 1)->'event'
  END
  FROM public.games g
  WHERE g.id = p_game_id;
$$;

CREATE OR REPLACE FUNCTION test_support.history_event_count(
  p_game_id UUID,
  p_kind    TEXT
)
RETURNS INT
LANGUAGE sql
STABLE
AS $$
  SELECT count(*)::INT
  FROM public.game_history gh
  WHERE gh.game_id = p_game_id
    AND gh.event->>'kind' = p_kind;
$$;
