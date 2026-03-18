/**
 * Lucky Seven — Daily Cleanup Edge Function
 *
 * Calls run_maintenance() to prune old data according to retention policy.
 * Schedule: 0 3 * * * (3 AM UTC daily) via Supabase Dashboard → Edge Functions → Schedule
 *
 * Retention defaults (configurable via run_maintenance params):
 *   chat messages:   21 days
 *   game history:    21 days
 *   finished games:  60 days  (JSONB snapshots kept forever)
 *   analytics:       45 days  (aggregated into analytics_daily first)
 *   error logs:      90 days
 *
 * Manual trigger: Supabase Dashboard → Edge Functions → daily-cleanup → Invoke
 * Manual SQL:     SELECT run_maintenance();
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

Deno.serve(async (_req: Request) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data, error } = await supabase.rpc('run_maintenance')

  if (error) {
    console.error('[daily-cleanup] Maintenance failed:', error.message)
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    )
  }

  console.log('[daily-cleanup] Completed:', JSON.stringify(data))
  return new Response(
    JSON.stringify({ success: true, result: data }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
