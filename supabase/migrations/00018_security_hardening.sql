-- ============================================================
-- Lucky Seven - Migration 18: Security Hardening
-- ============================================================
-- Hardens SECURITY DEFINER RPCs by removing client-trusted
-- identity fields, bounding untrusted input sizes, and
-- whitelisting analytics event names.
-- ============================================================

-- Derive chat identity on the server instead of trusting client input.
CREATE OR REPLACE FUNCTION public.send_chat_message(
  p_game_id UUID,
  p_text    TEXT,
  p_msg_id  TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid          UUID := auth.uid();
  v_display_name TEXT;
  v_seat_index   INT;
  v_text         TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT gp.display_name, gp.seat_index
    INTO v_display_name, v_seat_index
    FROM public.game_players gp
    WHERE gp.game_id = p_game_id
      AND gp.player_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not a member of this game';
  END IF;

  v_text := left(btrim(coalesce(p_text, '')), 300);
  IF v_text = '' THEN
    RAISE EXCEPTION 'Message cannot be empty';
  END IF;

  INSERT INTO public.game_chat_messages (id, game_id, user_id, display_name, seat_index, text, ts)
  VALUES (
    left(coalesce(p_msg_id, ''), 64),
    p_game_id,
    v_uid,
    v_display_name,
    v_seat_index,
    v_text,
    (extract(epoch FROM now()) * 1000)::BIGINT
  );
END;
$$;

-- Validate and bound feedback input server-side so client bypasses
-- cannot insert oversized or blank payloads.
CREATE OR REPLACE FUNCTION public.submit_feedback(
  p_rating      INT,
  p_name        TEXT,
  p_message     TEXT,
  p_app_version TEXT,
  p_theme       TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid         UUID := auth.uid();
  v_name        TEXT := left(coalesce(nullif(btrim(p_name), ''), 'Anonymous'), 30);
  v_message     TEXT := left(btrim(coalesce(p_message, '')), 500);
  v_app_version TEXT := left(coalesce(nullif(btrim(p_app_version), ''), 'unknown'), 50);
  v_theme       TEXT := left(coalesce(nullif(btrim(p_theme), ''), 'blue'), 20);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Invalid rating';
  END IF;

  IF v_message = '' THEN
    RAISE EXCEPTION 'Message cannot be empty';
  END IF;

  INSERT INTO public.feedback (rating, name, message, app_version, theme, user_id)
  VALUES (p_rating, v_name, v_message, v_app_version, v_theme, v_uid);
END;
$$;

-- Store analytics using the authenticated user from the JWT instead of
-- accepting a spoofable user_id from the client, and reject unknown events.
CREATE OR REPLACE FUNCTION public.track_event(
  p_event_name   TEXT,
  p_user_id      UUID     DEFAULT NULL,
  p_game_id      UUID     DEFAULT NULL,
  p_session_id   TEXT     DEFAULT NULL,
  p_route        TEXT     DEFAULT NULL,
  p_device_type  TEXT     DEFAULT NULL,
  p_screen_width INT      DEFAULT NULL,
  p_theme        TEXT     DEFAULT NULL,
  p_metadata     JSONB    DEFAULT '{}'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF p_event_name NOT IN (
    'page_view',
    'create_game',
    'join_game',
    'game_finished',
    'rematch_clicked',
    'feedback_submitted'
  ) THEN
    RAISE EXCEPTION 'Invalid event name';
  END IF;

  INSERT INTO public.analytics_events (
    event_name, user_id, game_id, session_id,
    route, device_type, screen_width, theme, metadata
  ) VALUES (
    p_event_name,
    v_uid,
    p_game_id,
    left(coalesce(p_session_id, ''), 100),
    left(coalesce(p_route, ''), 200),
    left(coalesce(p_device_type, ''), 20),
    greatest(0, least(coalesce(p_screen_width, 0), 10000)),
    left(coalesce(p_theme, ''), 20),
    jsonb_strip_nulls(coalesce(p_metadata, '{}'::JSONB))
  );

  IF p_event_name = 'page_view' THEN
    UPDATE public.global_stats SET page_views = page_views + 1 WHERE id = 1;
  ELSIF p_event_name = 'game_finished' THEN
    UPDATE public.global_stats SET games_finished = games_finished + 1 WHERE id = 1;
  END IF;
END;
$$;

-- Attribute client error logs to the authenticated user from the JWT and
-- clamp field sizes to reduce abuse and oversized payload storage.
CREATE OR REPLACE FUNCTION public.log_client_error(
  p_user_id     UUID     DEFAULT NULL,
  p_session_id  TEXT     DEFAULT NULL,
  p_error_name  TEXT     DEFAULT 'Error',
  p_message     TEXT     DEFAULT '',
  p_stack       TEXT     DEFAULT NULL,
  p_context     TEXT     DEFAULT NULL,
  p_route       TEXT     DEFAULT NULL,
  p_device_type TEXT     DEFAULT NULL,
  p_user_agent  TEXT     DEFAULT NULL,
  p_app_version TEXT     DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  INSERT INTO public.client_error_logs (
    user_id, session_id, error_name, message, stack,
    context, route, device_type, user_agent, app_version
  ) VALUES (
    v_uid,
    left(coalesce(p_session_id, ''), 100),
    left(coalesce(p_error_name, 'Error'), 200),
    left(coalesce(p_message, ''), 2000),
    left(p_stack, 4000),
    left(p_context, 200),
    left(p_route, 200),
    left(p_device_type, 20),
    left(p_user_agent, 500),
    left(p_app_version, 50)
  );
END;
$$;
