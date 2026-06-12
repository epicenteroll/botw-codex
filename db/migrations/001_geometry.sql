-- ===========================================================================
-- Migration 001 — blob geometry persistence (Stage 1.5, Workstream D0)
--
-- Fixes finding F5: quadrant/sector shapes were drawn from blob_center/blob_r
-- which existed ONLY in seed.json. These columns give the drag/move tooling
-- (Workstream D) something to write to, and make Supabase mode render the
-- continent/quadrant maps correctly.
--
-- Run AFTER db/schema.sql on databases created before Stage 1.5.
-- Fresh installs: db/schema.sql already contains these columns.
-- ===========================================================================

ALTER TABLE public.world_encyclopedia
  ADD COLUMN IF NOT EXISTS blob_cx FLOAT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS blob_cy FLOAT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS blob_r  FLOAT DEFAULT NULL,
  -- blob_seed lets the admin "reroll" a region's coastline without renaming
  -- the entity; it defaults to the entity id at render time when NULL, so
  -- re-slugging an entity later won't silently change its shape once set.
  ADD COLUMN IF NOT EXISTS blob_seed TEXT DEFAULT NULL,
  -- ordering for the Index and corridor waypoints (cheap to add now)
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT NULL;

-- updated_at trigger (added if the function/trigger are not already present)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_we_updated_at ON public.world_encyclopedia;
CREATE TRIGGER trg_we_updated_at
  BEFORE UPDATE ON public.world_encyclopedia
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_dle_updated_at ON public.deep_lore_entries;
CREATE TRIGGER trg_dle_updated_at
  BEFORE UPDATE ON public.deep_lore_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- NOTE on RLS: no policy changes are needed. Players only hold SELECT on
-- world_encyclopedia (published rows), so geometry columns are admin-write-only
-- by construction — verified by the Stage-1.5 test checklist.
