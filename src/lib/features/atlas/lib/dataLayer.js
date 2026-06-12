// dataLayer.js — the reactive backbone shared by every component.
//
// Holds the world as Svelte stores. init() loads from Supabase when configured,
// otherwise from the bundled mock. The component-facing API (the stores plus
// grant/clear/reset/toggleFaction) is IDENTICAL in both modes, so swapping the
// source at Stage-2 merge changes nothing in the components.

import { writable, get } from 'svelte/store'
import { supabase, isSupabaseConfigured } from './supabase.js'
import { loadMockWorld } from './mockData.js'

export const entities = writable([])
export const deepLore = writable([])
export const locationTypes = writable([])
export const discoveries = writable({}) // { entityId: 'heard_of'|'visited'|'known' }
export const factionAccess = writable(new Set())
export const ready = writable(false)
export const sourceMode = writable(isSupabaseConfigured ? 'supabase' : 'mock')

let _initialDiscoveries = {}
let _seedFactionAccess = []

export async function init(vId) {
  if (isSupabaseConfigured) {
    await loadFromSupabase(vId)
  } else {
    loadFromMock()
  }
  ready.set(true)
}

function loadFromMock() {
  const w = loadMockWorld()
  entities.set(fillChartStatus(w.entities))
  deepLore.set(w.deepLore)
  locationTypes.set(w.locationTypes)
  _initialDiscoveries = w.initialDiscoveries
  _seedFactionAccess = w.factionAccess
  discoveries.set({ ..._initialDiscoveries })
  factionAccess.set(new Set(_seedFactionAccess))
}

// H0 backfill: rows authored before chart_status existed get a sensible value —
// a sector that already has published children is canon-developed ('charted');
// an empty one stays 'uncharted'. Explicit values are never overwritten.
function fillChartStatus(list) {
  return list.map((e) => {
    if (e.entity_type !== 'sector' || e.chart_status) return e
    const populated = list.some((k) => k.parent_id === e.id && k.is_published)
    return { ...e, chart_status: populated ? 'charted' : 'uncharted' }
  })
}

async function loadFromSupabase(vId) {
  // Published-only reads are enforced by RLS for players; admin policies return
  // everything. Shape rows to match the seed's field names the components use.
  const [{ data: ents }, { data: deep }, { data: types }, { data: disc }] = await Promise.all([
    supabase.from('world_encyclopedia').select('*'),
    supabase.from('deep_lore_entries').select('*'),
    supabase.from('location_types').select('*').order('sort_order'),
    supabase.from('vessel_discoveries').select('entity_id, discovery_level').eq('vessel_id', vId),
  ])
  entities.set(fillChartStatus((ents || []).map(normaliseEntity)))
  deepLore.set((deep || []).map(normaliseDeep))
  locationTypes.set(types || [])
  const map = {}
  ;(disc || []).forEach((d) => (map[d.entity_id] = d.discovery_level))
  _initialDiscoveries = { ...map }
  discoveries.set(map)
  factionAccess.set(new Set()) // faction access comes from real standing in Stage 2
}

// Map DB column names -> the field names the components read. Most already match.
// D0: blob_cx/blob_cy -> blob_center:[x,y] so map components don't change.
function normaliseEntity(r) {
  const e = {
    ...r,
    common: r.common_knowledge,
    uncommon: r.uncommon_knowledge,
    rare: r.rare_knowledge,
    gm: r.gm_lore,
  }
  if (e.blob_center == null && r.blob_cx != null && r.blob_cy != null)
    e.blob_center = [r.blob_cx, r.blob_cy]
  return e
}
function normaliseDeep(r) {
  return { ...r }
}

// ---------- mutations (admin grants drive exploration %) ----------
export async function grantDiscovery(id, level) {
  discoveries.update((d) => ({ ...d, [id]: level }))
  if (isSupabaseConfigured) {
    await supabase
      .from('vessel_discoveries')
      .upsert(
        { vessel_id: get(vesselIdRef), entity_id: id, discovery_level: level },
        { onConflict: 'vessel_id,entity_id' },
      )
  }
}
export async function clearDiscovery(id) {
  discoveries.update((d) => {
    const n = { ...d }
    delete n[id]
    return n
  })
  if (isSupabaseConfigured) {
    await supabase
      .from('vessel_discoveries')
      .delete()
      .eq('vessel_id', get(vesselIdRef))
      .eq('entity_id', id)
  }
}
export function resetDiscoveries() {
  discoveries.set({ ..._initialDiscoveries })
  factionAccess.set(new Set(_seedFactionAccess))
}
export function toggleFaction(f) {
  factionAccess.update((set) => {
    const n = new Set(set)
    n.has(f) ? n.delete(f) : n.add(f)
    return n
  })
}

// ---------- admin CRUD (Section 16) ----------
// In offline mode these mutate the in-memory stores. When Supabase is
// configured they also upsert/delete the backing rows. Component code is
// identical in both modes.
const DB_FIELDS = [
  'id', 'entity_type', 'name', 'parent_id', 'rumour', 'common_knowledge',
  'uncommon_knowledge', 'rare_knowledge', 'gm_lore', 'admin_notes',
  'location_subtype', 'location_scale', 'marker_icon', 'map_layer', 'svg_path_id',
  'coord_x', 'coord_y', 'sequence_index', 'sector_count', 'power_level',
  'water_level', 'tags', 'is_published',
  // D0: blob geometry + reroll seed; H0: canon charting state; Index/waypoints ordering
  'blob_cx', 'blob_cy', 'blob_r', 'blob_seed', 'chart_status', 'sort_order',
]
function pick(obj, fields) {
  const o = {}
  fields.forEach((f) => { if (obj[f] !== undefined) o[f] = obj[f] })
  return o
}
// component shape -> DB row (blob_center:[x,y] -> blob_cx/blob_cy)
function toDbRow(entity) {
  const row = pick(entity, DB_FIELDS)
  if (Array.isArray(entity.blob_center)) {
    row.blob_cx = entity.blob_center[0]
    row.blob_cy = entity.blob_center[1]
  }
  return row
}

export async function upsertEntity(entity) {
  // H3 defensive rail: micro locations may only live inside charted sectors.
  if (entity.entity_type === 'location' && (entity.location_scale || 'micro') === 'micro' && entity.parent_id) {
    const p = get(entities).find((e) => e.id === entity.parent_id)
    if (p && p.entity_type === 'sector' && (p.chart_status || 'uncharted') !== 'charted') {
      return { error: 'Micro locations need a charted sector — mark the parent sector charted first.' }
    }
  }
  entities.update((list) => {
    const i = list.findIndex((e) => e.id === entity.id)
    if (i >= 0) {
      const next = list.slice()
      next[i] = { ...list[i], ...entity }
      return next
    }
    return [...list, entity]
  })
  if (isSupabaseConfigured) {
    const { error } = await supabase.from('world_encyclopedia').upsert(toDbRow(entity))
    if (error) return { error: error.message }
  }
  return { ok: true }
}
/**
 * D1/D3 — persist a geometry-only patch (blob_center / blob_r / blob_seed /
 * coord_x / coord_y / sequence_index). The store is assumed to be optimistically
 * updated already (the drag engine writes while dragging); in Supabase mode a
 * failed upsert REVERTS the optimistic position and reports the error.
 */
export async function patchGeometry(id, patch, before = null) {
  entities.update((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  if (isSupabaseConfigured) {
    const row = toDbRow({ id, ...patch })
    const { error } = await supabase.from('world_encyclopedia').update(row).eq('id', id)
    if (error) {
      if (before) entities.update((list) => list.map((e) => (e.id === id ? { ...e, ...before } : e)))
      return { error: error.message }
    }
  }
  return { ok: true }
}

export async function deleteEntity(id) {
  entities.update((list) => list.filter((e) => e.id !== id))
  deepLore.update((list) => list.filter((d) => d.entity_id !== id))
  if (isSupabaseConfigured) {
    await supabase.from('world_encyclopedia').delete().eq('id', id)
  }
}
export async function upsertDeep(entry) {
  deepLore.update((list) => {
    const i = list.findIndex((d) => d.id === entry.id)
    if (i >= 0) {
      const next = list.slice()
      next[i] = { ...list[i], ...entry }
      return next
    }
    return [...list, entry]
  })
  if (isSupabaseConfigured) {
    const { id, entity_id, origin_faction, origin_entity_id, lore_text, access_note, sort_order, is_published } = entry
    await supabase
      .from('deep_lore_entries')
      .upsert({ id, entity_id, origin_faction, origin_entity_id, lore_text, access_note, sort_order, is_published })
  }
}
export async function deleteDeep(id) {
  deepLore.update((list) => list.filter((d) => d.id !== id))
  if (isSupabaseConfigured) {
    await supabase.from('deep_lore_entries').delete().eq('id', id)
  }
}

// vesselId is injected from the shell (bindVesselId) to avoid a hard import of
// lib/core/session.js here — keeps the data layer runnable on its own in tests.
let vesselIdRef = writable('TEST_VESSEL_ID')
export function bindVesselId(store) {
  vesselIdRef = store
}
