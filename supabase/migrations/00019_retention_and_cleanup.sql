-- ============================================================
-- Lucky Seven — Migration 19: Retention & Cleanup System
-- ============================================================
-- 1. analytics_daily — daily aggregation table (kept forever)
-- 2. aggregate_analytics_daily() — aggregate before raw deletion
-- 3. prune_client_error_logs() — retention for error logs
-- 4. run_maintenance() — updated defaults + new steps
-- ============================================================


-- ─── 1. analytics_daily table ─────────────────────────────────
-- One row per day. Kept forever. Tiny footprint.
-- Allows long-term trend analysis after raw analytics_events are pruned.
CREATE TABLE IF NOT EXISTS public.analytics_daily (
  day             DATE        PRIMARY KEY,
  page_views      INT         NOT NULL DEFAULT 0,
  games_created   INT         NOT NULL DEFAULT 0,
  games_started   INT         NOT NULL DEFAULT 0,
  games_finished  INT         NOT NULL DEFAULT 0,
  rematches       INT         NOT NULL DEFAULT 0,
  feedback_count  INT         NOT NULL DEFAULT 0,
  dev_activations INT         NOT NULL DEFAULT 0,
  joins           INT         NOT NULL DEFAULT 0,
  unique_sessions INT         NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No client access — admin/service role only
ALTER TABLE public.analytics_daily ENABLE ROW LEVEL SECURITY;


-- ─── 2. aggregate_analytics_daily() ───────────────────────────
-- Aggregate one day's raw analytics_events into analytics_daily.
-- Idempotent via ON CONFLICT DO UPDATE.
-- Called by run_maintenance() before pruning old events.
CREATE OR REPLACE FUNCTION public.aggregate_analytics_daily(
  p_for_date DATE DEFAULT (CURRENT_DATE - 1)
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.analytics_daily (
    day,
    page_views,
    games_created,
    games_started,
    games_finished,
    rematches,
    feedback_count,
    dev_activations,
    joins,
    unique_sessions,
    updated_at
  )
  SELECT
    p_for_date,
    COUNT(*) FILTER (WHERE event_name = 'page_view'),
    COUNT(*) FILTER (WHERE event_name = 'create_game'),
    COUNT(*) FILTER (WHERE event_name = 'start_game'),
    COUNT(*) FILTER (WHERE event_name = 'game_finished'),
    COUNT(*) FILTER (WHERE event_name = 'rematch_clicked'),
    COUNT(*) FILTER (WHERE event_name = 'feedback_submitted'),
    COUNT(*) FILTER (WHERE event_name = 'dev_mode_activated'),
    COUNT(*) FILTER (WHERE event_name = 'join_game'),
    COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL),
    now()
  FROM public.analytics_events
  WHERE created_at::DATE = p_for_date
  ON CONFLICT (day) DO UPDATE SET
    page_views      = EXCLUDED.page_views,
    games_created   = EXCLUDED.games_created,
    games_started   = EXCLUDED.games_started,
    games_finished  = EXCLUDED.games_finished,
    rematches       = EXCLUDED.rematches,
    feedback_count  = EXCLUDED.feedback_count,
    dev_activations = EXCLUDED.dev_activations,
    joins           = EXCLUDED.joins,
    unique_sessions = EXCLUDED.unique_sessions,
    updated_at      = now();
$$;


-- ─── 3. prune_client_error_logs() ─────────────────────────────
-- Delete old client error logs in batches.
-- No archive needed — diagnostic only, not long-term records.
CREATE OR REPLACE FUNCTION public.prune_client_error_logs(
  p_days INT DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch_size INT := 5000;
  v_cutoff     TIMESTAMPTZ;
  v_total      INT := 0;
  v_deleted    INT;
BEGIN
  v_cutoff := now() - (p_days || ' days')::INTERVAL;

  LOOP
    DELETE FROM public.client_error_logs
    WHERE id IN (
      SELECT id FROM public.client_error_logs
      WHERE  created_at < v_cutoff
      LIMIT  v_batch_size
    );

    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    v_total := v_total + v_deleted;

    IF v_deleted < v_batch_size THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'task',        'prune_client_error_logs',
    'cutoff_days', p_days,
    'rows_deleted', v_total
  );
END;
$$;


-- ─── 4. run_maintenance() — updated orchestrator ──────────────
-- Changes vs previous version:
--   - p_chat_days:      30 → 21
--   - p_history_days:   30 → 21
--   - p_games_days:     90 → 60
--   - p_analytics_days: new param (was separate fn, now integrated), default 45
--   - p_error_log_days: new param, default 90
--   - Step added: aggregate_analytics_daily() before pruning analytics
--   - Step added: prune_client_error_logs()
CREATE OR REPLACE FUNCTION public.run_maintenance(
  p_chat_days      INT DEFAULT 7,
  p_history_days   INT DEFAULT 7,
  p_games_days     INT DEFAULT 14,
  p_analytics_days INT DEFAULT 14,
  p_error_log_days INT DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run_id    UUID;
  v_started   TIMESTAMPTZ := now();
  v_result    JSONB;
  v_chat      JSONB;
  v_history   JSONB;
  v_games     JSONB;
  v_analytics JSONB;
  v_errors    JSONB;
  v_locked    BOOLEAN;
BEGIN
  -- ① Acquire advisory lock
  v_locked := public._acquire_maintenance_lock();
  IF NOT v_locked THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'reason', 'Another maintenance run is already in progress (advisory lock 777 held)'
    );
  END IF;

  -- ② Log start
  INSERT INTO public.maintenance_runs (started_at, status)
  VALUES (v_started, 'running')
  RETURNING id INTO v_run_id;

  BEGIN
    -- ③ Aggregate yesterday's analytics before we prune them
    PERFORM public.aggregate_analytics_daily(CURRENT_DATE - 1);

    -- ④ Run prune tasks
    v_chat      := public.prune_old_chat_messages(p_chat_days);
    v_history   := public.prune_old_game_history(p_history_days);
    v_games     := public.archive_and_prune_finished_games(p_games_days);
    v_analytics := public.prune_analytics_events(p_analytics_days);
    v_errors    := public.prune_client_error_logs(p_error_log_days);

    -- ⑤ Build summary
    v_result := jsonb_build_object(
      'status',       'completed',
      'run_id',       v_run_id,
      'started_at',   v_started,
      'finished_at',  now(),
      'duration_ms',  (extract(epoch FROM (now() - v_started)) * 1000)::INT,
      'chat',         v_chat,
      'history',      v_history,
      'games',        v_games,
      'analytics',    v_analytics,
      'error_logs',   v_errors
    );

    -- ⑥ Log success
    UPDATE public.maintenance_runs
    SET    finished_at = now(),
           status      = 'completed',
           summary     = v_result
    WHERE  id = v_run_id;

  EXCEPTION WHEN OTHERS THEN
    UPDATE public.maintenance_runs
    SET    finished_at  = now(),
           status       = 'failed',
           error_detail = SQLERRM
    WHERE  id = v_run_id;

    v_result := jsonb_build_object(
      'status', 'failed',
      'run_id', v_run_id,
      'error',  SQLERRM
    );
  END;

  -- ⑦ Always release lock
  PERFORM public._release_maintenance_lock();

  RETURN v_result;
END;
$$;
