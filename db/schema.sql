-- ===========================================================================
-- Blood of the World — Encyclopedia schema (Section 13 of encyclopedia_MASTER)
--
-- Run this in the Supabase SQL Editor. All four tables are ADDITIVE and
-- ISOLATED: the live HTML site never queries them, so it is unaffected
-- (Section 25c, Option A — same project, new tables).
--
-- The only shared dependency is the existing public.is_admin() function and the
-- character_vessels / user_roles tables the policies reference. These are only
-- READ by the new policies, never altered.
--
-- After running this file:
--   1. run db/seed_location_types.sql  (62 types — generate with `npm run gen:sql`)
--   2. optionally run db/seed_world.sql (the Q2 starter world)
-- ===========================================================================

-- 13a. world_encyclopedia ----------------------------------------------------
CREATE TABLE public.world_encyclopedia (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type     TEXT NOT NULL CHECK (entity_type IN (
                    'continent','quadrant','sector','location',
                    'corridor','waypoint',
                    'faction','people','role','item','lore_entry')),
  name            TEXT NOT NULL,
  parent_id       UUID REFERENCES public.world_encyclopedia(id) ON DELETE SET NULL,
  -- Lore layers (single-text tiers; all freely editable by admin at any time)
  rumour             TEXT DEFAULT '',
  common_knowledge   TEXT DEFAULT '',
  uncommon_knowledge TEXT DEFAULT '',
  rare_knowledge     TEXT DEFAULT '',
  -- (deep_lore is a SEPARATE table — faction-attributed, multiple — see 13c)
  gm_lore            TEXT DEFAULT '',
  admin_notes        TEXT DEFAULT '',
  -- Location typing & placement
  location_subtype TEXT DEFAULT NULL,        -- one of the location type ids (Section 11)
  location_scale   TEXT DEFAULT 'micro' CHECK (location_scale IN ('micro','macro')),
  marker_icon      TEXT DEFAULT NULL,         -- optional override; defaults from type
  -- Map positioning
  map_layer       TEXT DEFAULT 'world',       -- 'world'|'continent'|'quadrant'|'sector'|'corridor'
  svg_path_id     TEXT DEFAULT '',
  coord_x         FLOAT DEFAULT 0,
  coord_y         FLOAT DEFAULT 0,
  sequence_index  INTEGER DEFAULT NULL,        -- waypoint order along a corridor
  -- Region blob geometry (Stage 1.5, D0 — drawn by quadrant/sector maps and
  -- written by Edit-map drag; blob_seed lets admins reroll a shape without
  -- renaming the entity — it defaults to the entity id at render time)
  blob_cx         FLOAT DEFAULT NULL,
  blob_cy         FLOAT DEFAULT NULL,
  blob_r          FLOAT DEFAULT NULL,
  blob_seed       TEXT DEFAULT NULL,
  -- Canon charting state (Stage 1.5, H0 — GLOBAL admin-set lifecycle; gates
  -- micro-location authoring and drives render size. Per-vessel discovery
  -- stays confined to vessel_discoveries.)
  chart_status    TEXT DEFAULT 'uncharted' CHECK (chart_status IN ('uncharted','charted')),
  sort_order      INTEGER DEFAULT NULL,        -- Index ordering / corridor waypoints
  -- Worldbuilding metadata
  sector_count    INTEGER DEFAULT NULL,        -- quadrants: 5-11
  power_level     TEXT DEFAULT NULL,           -- 'low'|'moderate'|'high'
  water_level     TEXT DEFAULT NULL,           -- 'scarce'|'moderate'|'abundant'
  tags            TEXT[] DEFAULT '{}',
  is_published    BOOLEAN DEFAULT false,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.world_encyclopedia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "players_read_published_entries"
ON public.world_encyclopedia FOR SELECT TO authenticated
USING (is_published = true);

CREATE POLICY "admin_full_access_encyclopedia"
ON public.world_encyclopedia FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 13b. vessel_discoveries ----------------------------------------------------
CREATE TABLE public.vessel_discoveries (
  id              BIGSERIAL PRIMARY KEY,
  vessel_id       UUID REFERENCES public.character_vessels(id) ON DELETE CASCADE NOT NULL,
  entity_id       UUID REFERENCES public.world_encyclopedia(id) ON DELETE CASCADE NOT NULL,
  discovery_level TEXT NOT NULL DEFAULT 'heard_of'
                  CHECK (discovery_level IN ('heard_of','visited','known')),
  discovered_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  granted_by      TEXT DEFAULT 'admin',
  UNIQUE (vessel_id, entity_id)
);

ALTER TABLE public.vessel_discoveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "players_read_own_discoveries"
ON public.vessel_discoveries FOR SELECT TO authenticated
USING (
  vessel_id IN (SELECT id FROM public.character_vessels WHERE user_id = auth.uid())
  OR public.is_admin()
);

CREATE POLICY "admin_manage_discoveries"
ON public.vessel_discoveries FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 13c. deep_lore_entries (faction-attributed deep lore) ----------------------
CREATE TABLE public.deep_lore_entries (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_id        UUID REFERENCES public.world_encyclopedia(id) ON DELETE CASCADE NOT NULL,
  origin_faction   TEXT NOT NULL,
  origin_entity_id UUID REFERENCES public.world_encyclopedia(id) ON DELETE SET NULL,
  lore_text        TEXT NOT NULL,
  access_note      TEXT DEFAULT '',
  sort_order       INTEGER DEFAULT 0,
  is_published     BOOLEAN DEFAULT false,
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.deep_lore_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "players_read_published_deep_lore"
ON public.deep_lore_entries FOR SELECT TO authenticated
USING (is_published = true);

CREATE POLICY "admin_manage_deep_lore"
ON public.deep_lore_entries FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 13d. location_types (reference table) --------------------------------------
CREATE TABLE public.location_types (
  id            TEXT PRIMARY KEY,             -- type id, e.g. 'ruins'
  display_name  TEXT NOT NULL,
  category      TEXT NOT NULL,
  marker_colour TEXT NOT NULL,
  icon_ref      TEXT NOT NULL,                -- '#icon-ruins'
  description   TEXT DEFAULT '',
  sort_order    INTEGER DEFAULT 0
);

ALTER TABLE public.location_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "all_read_location_types"
ON public.location_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_manage_location_types"
ON public.location_types FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Helpful indexes for the read paths the app uses.
CREATE INDEX idx_we_parent       ON public.world_encyclopedia(parent_id);
CREATE INDEX idx_we_type         ON public.world_encyclopedia(entity_type);
CREATE INDEX idx_we_published    ON public.world_encyclopedia(is_published);
CREATE INDEX idx_vd_vessel       ON public.vessel_discoveries(vessel_id);
CREATE INDEX idx_vd_entity       ON public.vessel_discoveries(entity_id);
CREATE INDEX idx_dle_entity      ON public.deep_lore_entries(entity_id);

-- updated_at trigger (Stage 1.5, D0)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_we_updated_at
  BEFORE UPDATE ON public.world_encyclopedia
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_dle_updated_at
  BEFORE UPDATE ON public.deep_lore_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
