-- Migration 00020: Drop old single-param peek function overloads
--
-- After migration 00019 added p_no_memory to peek functions via CREATE OR REPLACE,
-- PostgreSQL created NEW overloads (different param list = new signature), leaving
-- the old signatures intact. PostgREST cannot reliably route ambiguous overloads,
-- causing "function not found in schema cache" errors.
--
-- This migration drops the old overloads so only the new signatures remain.
-- The client always passes p_no_memory explicitly after this migration.

DROP FUNCTION IF EXISTS public.use_peek_all(UUID);
DROP FUNCTION IF EXISTS public.use_peek_one(UUID, INT);
DROP FUNCTION IF EXISTS public.use_peek_opponent(UUID, UUID, INT);
DROP FUNCTION IF EXISTS public.use_peek_all_opponent(UUID, UUID);

-- Force PostgREST to reload its schema cache so the new signatures are visible
NOTIFY pgrst, 'reload schema';
