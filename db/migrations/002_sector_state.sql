-- ===========================================================================
-- Migration 002 — sector charting state (Stage 1.5, Workstream H0)
--
-- `chart_status` is a statement about the WORLD ITSELF, made by the admin,
-- the same for everyone:
--   'uncharted' = the sector exists as a name/shape only
--   'charted'   = the admin has declared it developed canon
--
-- Division of labor: chart_status (global, admin-set) gates authoring and the
-- admin's view; per-vessel discovery (vessel_discoveries) gates what each
-- player sees. A player's DISPLAYED tier on a sector is capped at heard_of
-- while the sector is uncharted (one line in domain.displayLevel()), which
-- also guarantees uncharted sectors always render small for players.
--
-- Run AFTER 001_geometry.sql on existing databases.
-- ===========================================================================

ALTER TABLE public.world_encyclopedia
  ADD COLUMN IF NOT EXISTS chart_status TEXT DEFAULT 'uncharted'
    CHECK (chart_status IN ('uncharted','charted'));

-- Backfill: sectors that already have published children are canon-developed.
UPDATE public.world_encyclopedia s
SET chart_status = 'charted'
WHERE s.entity_type = 'sector'
  AND s.chart_status = 'uncharted'
  AND EXISTS (
    SELECT 1 FROM public.world_encyclopedia k
    WHERE k.parent_id = s.id AND k.is_published = true
  );

-- NOTE on RLS: players only hold SELECT, so chart_status is admin-write-only
-- by construction (test checklist: "player session cannot ... write geometry
-- or chart_status").
