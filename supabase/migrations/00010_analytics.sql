-- ============================================================
-- Lucky Seven — Supabase Schema Migration 10: Analytics
-- ============================================================
-- Lightweight analytics events table + enhanced global stats.
--
-- DESIGN:
-- - Write-only from client (no SELECT policy)
-- - track_event RPC auto-increments global_stats counters
-- - Minimal writes: only meaningful game events
-- ============================================================


-- ─── Add new metric columns to global_stats ─────────────────
ALTER TABLE public.global_stats
  ADD COLUMN IF NOT EXISTS page_views INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS games_finished INT NOT NULL DEFAULT 0;


-- ─── Analytics events table ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name   TEXT NOT NULL,
  user_id      UUID,
  game_id      UUID,
  session_id   TEXT,
  route        TEXT,
  device_type  TEXT,
  screen_width INT,
  theme        TEXT,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_analytics_event_name_ts
  ON public.analytics_events (event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_game_id
  ON public.analytics_events (game_id) WHERE game_id IS NOT NULL;

-- RLS: write-only (no client reads — analytics are read via RPCs)
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;


-- ─── track_event RPC ────────────────────────────────────────
-- Insert an analytics event and auto-increment global counters
-- for key metric events.
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
BEGIN
  INSERT INTO public.analytics_events (
    event_name, user_id, game_id, session_id,
    route, device_type, screen_width, theme, metadata
  ) VALUES (
    p_event_name, p_user_id, p_game_id, p_session_id,
    p_route, p_device_type, p_screen_width, p_theme, p_metadata
  );

  -- Auto-increment global counters for key events
  IF p_event_name = 'page_view' THEN
    UPDATE public.global_stats SET page_views = page_views + 1 WHERE id = 1;
  ELSIF p_event_name = 'game_finished' THEN
    UPDATE public.global_stats SET games_finished = games_finished + 1 WHERE id = 1;
  END IF;
END;
$$;


-- ─── Update get_global_stats to include new columns ─────────
DROP FUNCTION IF EXISTS public.get_global_stats();

CREATE OR REPLACE FUNCTION public.get_global_stats()
RETURNS TABLE (
  games_played   INT,
  total_visits   INT,
  last_game_at   BIGINT,
  page_views     INT,
  games_finished INT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT gs.games_played, gs.total_visits, gs.last_game_at,
         gs.page_views, gs.games_finished
  FROM public.global_stats gs
  WHERE gs.id = 1;
$$;
