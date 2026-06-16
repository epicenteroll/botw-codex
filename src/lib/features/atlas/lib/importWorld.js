// importWorld.js — parse a "world-patch" JSON (the file Claude produces from raw
// session notes) and build an idempotent, preview-able upsert PLAN against the
// world already loaded in the `entities` store. PURE: no Supabase, no stores —
// it takes the patch text + the current entities array and returns a plan the
// AdminImport panel renders as a diff and then applies via dataLayer.upsertEntity.
//
// Design decisions (Phase C):
//  • id is DETERMINISTIC — uuidFromSlug(slug) — identical to the seed/gen-world
//    scheme, so re-uploading a session (or two sessions naming the same place)
//    resolves to the SAME row and MERGES instead of duplicating, and merges with
//    seeded content for free. This is the whole idempotency story.
//  • parent is given by slug and resolved to the parent's deterministic id.
//  • [[links]] in lore are rewritten to [[Label|id]] with the real id, so stored
//    lore is self-consistent (and the Phase A renderer resolves it either way).
//  • everything created is is_published:false (a DRAFT); merges never flip an
//    already-published row and never touch its geometry.
//  • the GM's keyword vocabulary is normalised (region→quadrant, place→location,
//    npc→people, event→lore_entry, …) so notes can use natural words.

import { uuidFromSlug, toSlug } from './linkResolve.js'

export const PATCH_FORMAT = 'botw-world-patch'

const VALID_TYPES = [
  'continent', 'quadrant', 'sector', 'location', 'corridor', 'waypoint',
  'faction', 'people', 'role', 'item', 'lore_entry',
]

// GM-friendly synonyms → canonical entity_type (answer #4: normalise keywords).
const TYPE_SYNONYMS = {
  continent: 'continent',
  quadrant: 'quadrant', region: 'quadrant',
  sector: 'sector', area: 'sector', subregion: 'sector', part: 'sector',
  location: 'location', place: 'location', site: 'location', settlement: 'location', poi: 'location',
  corridor: 'corridor', road: 'corridor', route: 'corridor', path: 'corridor',
  waypoint: 'waypoint', stop: 'waypoint',
  faction: 'faction', group: 'faction', cult: 'faction', clan: 'faction', order: 'faction',
  people: 'people', person: 'people', npc: 'people', character: 'people', figure: 'people',
  role: 'role', archetype: 'role', title: 'role',
  item: 'item', artifact: 'item', object: 'item', relic: 'item',
  lore: 'lore_entry', lore_entry: 'lore_entry', event: 'lore_entry', concept: 'lore_entry', vision: 'lore_entry',
}

// entity_type → map_layer (spatial types only; others have no layer).
const LAYER_FOR = { continent: 'world', quadrant: 'continent', sector: 'quadrant', location: 'sector', corridor: 'continent', waypoint: 'corridor' }

// apply order so a parent is upserted before its child (parent_id is a FK).
const TYPE_RANK = { continent: 0, faction: 0, people: 0, role: 0, item: 0, lore_entry: 0, quadrant: 1, corridor: 1, sector: 2, waypoint: 2, location: 3 }

// note-tier key → DB column.
const TIER_COL = { rumour: 'rumour', common: 'common_knowledge', uncommon: 'uncommon_knowledge', rare: 'rare_knowledge', gm: 'gm_lore', admin: 'admin_notes' }
const LORE_COLS = Object.values(TIER_COL)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isUuid = (s) => typeof s === 'string' && UUID_RE.test(s)

export function normaliseType(t) {
  return TYPE_SYNONYMS[String(t || '').trim().toLowerCase()] || null
}

// Rewrite [[Name]] / [[Label|slug]] → [[Label|deterministic-id]].
export function rewriteLinks(text) {
  if (!text) return text || ''
  return String(text).replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, label, target) => {
    const raw = (target || label).trim()
    const id = isUuid(raw) ? raw : uuidFromSlug(target ? raw : toSlug(label))
    return `[[${label.trim()}|${id}]]`
  })
}

// Build a world-patch entity from an APPROVED vessel-note submission (Phase D).
// The player's free text becomes common_knowledge — a draft tier the GM can
// re-bin or expand in the editor — and proposed_type carries the entity_type.
// No parent: the GM sets hierarchy and publishes afterwards. Because the slug
// (and thus the id) is derived from the title, approving two notes about the
// same subject merges them, and re-approving is a no-op (buildPlan handles it).
export function submissionToPatchEntity(sub) {
  const name = (sub?.title || '').trim() || 'Untitled submission'
  return {
    slug: toSlug(name),
    name,
    type: sub?.proposed_type || 'lore_entry',
    tiers: { common: sub?.content || '' },
  }
}

// ---- parse + validate the patch shape -------------------------------------
export function parseWorldPatch(text) {
  let patch
  try {
    patch = typeof text === 'string' ? JSON.parse(text) : text
  } catch (e) {
    return { error: 'Not valid JSON: ' + e.message }
  }
  if (!patch || typeof patch !== 'object') return { error: 'Patch is empty.' }
  if (patch.format !== PATCH_FORMAT) return { error: `Wrong file: expected "format":"${PATCH_FORMAT}".` }
  if (!Array.isArray(patch.entities)) return { error: 'Patch has no "entities" array.' }
  return { ok: true, patch }
}

// ---- build the upsert plan against the current world ----------------------
// existing = the entities array from the store. Returns:
//   { entities:[upsertObjects], deep:[deepRows], plan:[rows for the diff UI],
//     warnings:[...], errors:[...], counts:{create,merge} }
export function buildPlan(patch, existing = []) {
  const byId = new Map(existing.map((e) => [e.id, e]))
  const errors = []
  const warnings = []
  // every slug AND its deterministic id declared in the patch, so we can flag
  // parents that resolve to neither the patch nor the existing world.
  const patchKeys = new Set()
  for (const r of patch.entities || []) {
    if (r.slug) { patchKeys.add(r.slug); patchKeys.add(uuidFromSlug(r.slug)) }
  }

  const out = []
  const planRows = []

  for (const raw of patch.entities) {
    const name = (raw.name || '').trim()
    const slug = (raw.slug || toSlug(name)).trim()
    if (!slug || !name) { errors.push(`Entity missing slug/name: ${JSON.stringify(raw).slice(0, 80)}`); continue }
    const type = normaliseType(raw.type)
    if (!type) { errors.push(`"${name}": unknown type "${raw.type}".`); continue }
    if (!VALID_TYPES.includes(type)) { errors.push(`"${name}": type "${type}" not allowed.`); continue }

    // Match existing by deterministic id (Supabase) OR by slug (offline/mock),
    // and reuse whichever id the existing row actually has so the upsert merges.
    const idU = uuidFromSlug(slug)
    const existingRow = byId.get(idU) || byId.get(slug)
    const id = existingRow ? existingRow.id : idU

    let parentId = null
    if (raw.parent) {
      const ps = String(raw.parent).trim()
      const pU = uuidFromSlug(ps)
      parentId = byId.has(pU) ? pU : byId.has(ps) ? ps : pU
      if (!patchKeys.has(ps) && !patchKeys.has(pU) && !byId.has(pU) && !byId.has(ps))
        warnings.push(`"${name}": parent "${raw.parent}" isn't in this file or the world yet — it'll attach once that parent exists.`)
    }

    // collect tier text from raw.tiers {rumour,common,uncommon,rare,gm,admin}
    const tiers = raw.tiers || {}
    const loreIn = {}
    for (const [k, col] of Object.entries(TIER_COL)) loreIn[col] = rewriteLinks(tiers[k] || '')

    const meta = {
      entity_type: type,
      name,
      parent_id: parentId,
      map_layer: LAYER_FOR[type] || null,
      location_subtype: raw.location_type || raw.location_subtype || '',
      tags: Array.isArray(raw.tags) ? raw.tags : [],
    }
    // spatial defaults so a new region/location is visible & draggable in Edit
    // mode (the GM repositions; geometry is never auto-guessed beyond a default
    // center). location_scale defaults to 'macro' to avoid the micro+uncharted rail.
    if (type === 'location') { meta.location_scale = raw.location_scale || 'macro'; }

    if (!existingRow) {
      // CREATE (draft)
      const e = { id, ...meta, ...loreIn, rumour: loreIn.rumour, is_published: false }
      if (type === 'quadrant') { e.blob_center = [500, 350]; e.blob_r = 100; e.blob_seed = slug; e.sector_count = Number(raw.sector_count) || 0 }
      if (type === 'sector') { e.blob_center = [500, 350]; e.blob_r = 120; e.blob_seed = slug; e.chart_status = 'uncharted' }
      if (type === 'continent') { e.blob_center = [500, 350]; e.blob_r = 160; e.blob_seed = slug }
      if (type === 'location') { e.coord_x = 500; e.coord_y = 350 }
      if (type === 'waypoint') { e.sequence_index = Number(raw.sequence_index) || 1 }
      out.push(e)
      const changes = [{ field: 'type', kind: 'set', to: type }]
      if (parentId) changes.push({ field: 'parent', kind: 'set', to: raw.parent })
      for (const col of LORE_COLS) if (loreIn[col]) changes.push({ field: col, kind: 'set' })
      planRows.push({ slug, name, type, action: 'create', changes })
    } else {
      // MERGE — meta fills/changes; lore appends-if-absent; never unpublish, never move geometry.
      const merged = { id }
      const changes = []
      // meta
      for (const [f, v] of Object.entries(meta)) {
        if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue
        const cur = existingRow[f]
        const same = Array.isArray(v) ? JSON.stringify(v) === JSON.stringify(cur || []) : v === cur
        if (!same) { merged[f] = v; changes.push({ field: f, kind: cur ? 'change' : 'set', from: cur, to: Array.isArray(v) ? v.join(', ') : v }) }
      }
      // lore: append-if-absent (idempotent + additive across sessions)
      for (const col of LORE_COLS) {
        const add = loreIn[col]
        if (!add) continue
        const cur = existingRow[col] || ''
        if (cur.includes(add)) continue // already present → no change (idempotent)
        merged[col] = cur ? cur + '\n\n' + add : add
        changes.push({ field: col, kind: cur ? 'append' : 'set' })
      }
      if (changes.length) {
        out.push({ ...existingRow, ...merged })
        planRows.push({ slug, name, type, action: 'merge', changes })
      } else {
        planRows.push({ slug, name, type, action: 'unchanged', changes: [] })
      }
    }
  }

  // optional deep-lore rows
  const deep = []
  for (const d of patch.deep_lore || []) {
    const eslug = (d.entity || '').trim()
    if (!eslug) { warnings.push('A deep_lore row has no "entity" slug — skipped.'); continue }
    const entity_id = uuidFromSlug(eslug)
    const idx = d.index ?? deep.filter((x) => x.entity_id === entity_id).length
    deep.push({
      id: uuidFromSlug(`deep:${eslug}:${d.origin_faction || 'unknown'}:${idx}`),
      entity_id,
      origin_faction: d.origin_faction || '',
      origin_entity_id: d.origin_entity ? uuidFromSlug(d.origin_entity) : null,
      lore_text: rewriteLinks(d.text || ''),
      access_note: d.access_note || '',
      sort_order: Number(d.sort_order) || idx,
      is_published: false,
    })
  }

  // apply parents before children
  out.sort((a, b) => (TYPE_RANK[a.entity_type] ?? 0) - (TYPE_RANK[b.entity_type] ?? 0))

  const counts = {
    create: planRows.filter((r) => r.action === 'create').length,
    merge: planRows.filter((r) => r.action === 'merge').length,
    unchanged: planRows.filter((r) => r.action === 'unchanged').length,
  }
  return { entities: out, deep, plan: planRows, warnings, errors, counts }
}
