// domain.js — the discovery / knowledge-gating rules (Sections 7, 8).
//
// All functions are PURE: they take the current world state explicitly
// (entities, a discoveries map, the isAdmin flag) and return derived values.
// Nothing here is stored — exploration % in particular is always computed live.
//
// `discoveries` is a plain object: { [entityId]: 'heard_of'|'visited'|'known' }.
// Absence of a key means "unknown" (no row, in DB terms).

import { s } from './utils.js'
import { resolveLinkTarget } from './linkResolve.js'

export const ENTITY_TYPE_NAMES = {
  continent: 'Continent',
  quadrant: 'Quadrant',
  sector: 'Sector',
  location: 'Location',
  corridor: 'Corridor',
  waypoint: 'Road Waypoint',
  faction: 'Faction',
  people: 'Figure',
  role: 'Role',
  item: 'Item',
  lore_entry: 'Lore Entry',
}

export const byId = (entities, id) => entities.find((e) => e.id === id)
export const childrenOf = (entities, pid) =>
  entities.filter((e) => e.parent_id === pid && e.is_published)
export const deepFor = (deepLore, eid) =>
  deepLore
    .filter((d) => d.entity_id === eid && d.is_published)
    .sort((a, b) => a.sort_order - b.sort_order)

// stored discovery level for the vessel (null = undiscovered)
export const rawLevel = (disc, id) => disc[id] || null

// exploration % — discovered published children / total (computed live)
export function explorationPct(entities, disc, id) {
  const kids = childrenOf(entities, id)
  if (!kids.length) return null
  const found = kids.filter((k) => rawLevel(disc, k.id)).length
  return Math.round((found / kids.length) * 100)
}

// effective tier used for gating: 100% promotes visited -> known
export function effectiveLevel(entities, disc, id) {
  const lv = rawLevel(disc, id)
  if (!lv) return null
  const pct = explorationPct(entities, disc, id)
  if (lv === 'visited' && pct === 100) return 'known'
  return lv
}

// what the map should render this region/marker as for the current mode
export function displayLevel(entities, disc, id, isAdmin) {
  if (isAdmin) return effectiveLevel(entities, disc, id) || 'known' // admin sees all lit
  let lv = effectiveLevel(entities, disc, id) || 'unknown'
  // H0: players can never out-know the canon — a sector's displayed tier is
  // capped at heard_of while the sector is uncharted, which also guarantees
  // uncharted sectors always render small for players.
  const e = byId(entities, id)
  if (e && e.entity_type === 'sector' && chartStatus(e) !== 'charted' && (lv === 'visited' || lv === 'known'))
    lv = 'heard_of'
  return lv
}

// people show "Met" instead of "Visited" (UI-only, Section 9)
export function tierLabel(entity, lv) {
  if (lv === 'visited' && entity && entity.entity_type === 'people') return 'Met'
  return (
    { heard_of: 'Heard Of', visited: 'Visited', known: 'Known', unknown: 'Unknown' }[lv] ||
    'Unknown'
  )
}

// CSS-class form of a tier ('heard_of' -> 'heard-of')
export const tierClass = (lv) => (lv ? lv.replace('_', '-') : 'unknown')

// which lore layers a player can see (admin sees all). Section 8 gating.
export function unlocked(entities, disc, entity, isAdmin) {
  const set = new Set()
  if (isAdmin) {
    ;['rumour', 'common', 'uncommon', 'rare', 'deep', 'gm', 'admin'].forEach((x) => set.add(x))
    return set
  }
  const lv = effectiveLevel(entities, disc, entity.id)
  const pct = explorationPct(entities, disc, entity.id)
  if (!lv) return set // undiscovered: nothing
  set.add('rumour') // heard_of
  if (lv === 'visited' || lv === 'known') {
    set.add('common')
    if (pct === null) {
      if (lv === 'known') {
        set.add('uncommon')
        set.add('rare')
      }
    } else if (pct >= 50) {
      set.add('uncommon')
    }
  }
  if (lv === 'known') {
    set.add('uncommon')
    set.add('rare')
    set.add('deep')
  }
  return set
}

// ---------- name-link parsing (discovery-aware, Section 12) ----------
// Accepts BOTH the explicit form [[Label|target]] and the bare form [[Name]]
// (the way the GM writes raw notes). `target` is resolved to an entity by id,
// slug, or name (resolveLinkTarget), and the clickable span carries the entity's
// REAL id in data-go so navigation works in Supabase mode (where ids are UUIDs
// but lore targets are slugs — the parked cross-link bug). A link renders as a
// clickable span ONLY if its target is discovered (heard_of+) or the viewer is
// admin; otherwise it falls back to plain prose so undiscovered names never leak.
export function renderLore(text, entities, disc, isAdmin) {
  if (!text) return ''
  let out = ''
  const re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g
  let last = 0,
    m
  while ((m = re.exec(text))) {
    out += s(text.slice(last, m.index))
    const label = m[1]
    const target = (m[2] || m[1]).trim()
    const tEnt = resolveLinkTarget(entities, target)
    const visible = isAdmin || (tEnt && rawLevel(disc, tEnt.id))
    if (visible && tEnt)
      out += `<span class="lk" data-go="${s(tEnt.id)}" data-type="${s(tEnt.entity_type)}" role="link" tabindex="0">${s(label)}</span>`
    else out += s(label)
    last = m.index + m[0].length
  }
  out += s(text.slice(last))
  return out
}

// ===========================================================================
// Stage 1.5 additions (encyclopedia-update-plan)
// ===========================================================================

// ---------- parent validity (C1) ----------
// A location's parent must be a sector; a waypoint's a corridor; etc.
// `null` in the list means "no parent is valid".
export const VALID_PARENTS = {
  continent: [null],
  quadrant: ['continent'],
  sector: ['quadrant'],
  location: ['sector'],
  corridor: ['continent'],
  waypoint: ['corridor'],
  faction: [null],
  people: [null],
  role: [null],
  item: [null],
  lore_entry: [null],
}

/** All published-or-not children (admin views need drafts too — C3). */
export const allChildrenOf = (entities, pid) => entities.filter((e) => e.parent_id === pid)

/** Entities that are valid parents for a given entity_type (C1 picker). */
export function validParentsFor(entities, entityType) {
  const types = (VALID_PARENTS[entityType] || [null]).filter(Boolean)
  if (!types.length) return []
  return entities
    .filter((e) => types.includes(e.entity_type))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Breadcrumb-ish path string for an entity: "Impure Fracta › Q2 › Dust Gullets". */
export function pathFor(entities, id) {
  const parts = []
  let cur = byId(entities, id)
  let guard = 0
  while (cur && guard++ < 10) {
    parts.unshift(cur.name.split(' — ')[0])
    cur = cur.parent_id ? byId(entities, cur.parent_id) : null
  }
  return parts.join(' › ')
}

// ---------- canon charting state (H0) ----------
// `chart_status` is a GLOBAL, admin-set column: 'uncharted' | 'charted'.
// It gates authoring (micro locations) and the admin's view of size; per-vessel
// discovery gates what each player sees. The two never mix.
export const chartStatus = (e) => (e && e.chart_status) || 'uncharted'

// ---------- display radius (H1) ----------
// The stored blob_r is ALWAYS the full-grown size; the factor is render-time
// only, so growth needs no geometry writes and drag/overlap math keeps using
// stored values.
export function displayRadius(entity, lv, populated, isAdmin) {
  const r = entity.blob_r || 100
  if (entity.entity_type !== 'sector') return r
  if (isAdmin) return chartStatus(entity) === 'charted' ? r : 0.55 * r
  if (!lv || lv === 'unknown' || lv === 'heard_of') return 0.55 * r
  if (!populated) return 0.75 * r
  return r
}

// ---------- scale-based marker visibility (H4) ----------
// ONE rule set shared by every map. viewLevel: 'macro' (quadrant-level framing)
// or 'micro' (inside a sector). Returns null when the marker must not render.
//   { labelText, labelMode: 'normal'|'hover-anon'|'admin-dim', draft }
export function markerVisibility(loc, viewLevel, lv, isAdmin) {
  const scale = loc.location_scale || 'micro'
  // Micro markers NEVER appear at macro view — for anyone, admin included.
  if (viewLevel === 'macro' && scale === 'micro') return null
  if (!isAdmin && (!loc.is_published || !lv || lv === 'unknown')) return null
  const draft = !!isAdmin && !loc.is_published
  let labelText = loc.name
  let labelMode = 'normal'
  if (scale === 'micro') {
    if (isAdmin) {
      // admin keeps all labels but dims undiscovered-by-the-test-vessel ones
      labelMode = !lv || lv === 'unknown' || lv === 'heard_of' ? 'admin-dim' : 'normal'
    } else if (lv === 'heard_of') {
      // marker shows but anonymously until visited
      labelText = 'An unknown place'
      labelMode = 'hover-anon'
    }
  }
  return { labelText, labelMode, draft }
}

// ---------- link scanning & validation (E2) ----------
const LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g

export function scanLinks(text) {
  if (!text) return []
  const out = []
  let m
  const re = new RegExp(LINK_RE.source, 'g')
  while ((m = re.exec(text))) out.push({ label: m[1], id: (m[2] || m[1]).trim() })
  return out
}

const LORE_FIELDS = ['rumour', 'common_knowledge', 'uncommon_knowledge', 'rare_knowledge', 'gm_lore', 'admin_notes']

/** Returns the list of link targets in an entity's lore that do not resolve. */
export function brokenLinks(entity, entities) {
  const missing = new Set()
  LORE_FIELDS.forEach((f) => {
    scanLinks(entity[f]).forEach((l) => {
      if (!resolveLinkTarget(entities, l.id)) missing.add(l.id)
    })
  })
  return [...missing]
}

/** Backlinks: every entity (or deep-lore row) whose lore resolves to `id`. */
export function backlinksFor(entities, deepLore, id) {
  const refs = []
  const hits = (text) =>
    scanLinks(text).some((l) => {
      const r = resolveLinkTarget(entities, l.id)
      return r && r.id === id
    })
  for (const e of entities) {
    if (e.id === id) continue
    if (LORE_FIELDS.some((f) => e[f] && hits(e[f]))) refs.push(e)
  }
  for (const d of deepLore || []) {
    if (d.lore_text && hits(d.lore_text)) {
      const host = byId(entities, d.entity_id)
      if (host && host.id !== id && !refs.includes(host)) refs.push(host)
    }
  }
  return refs
}

// ---------- save-time validation (C3 / H3) ----------
// Returns { errors: [], warnings: [] }. Errors block the save; warnings toast.
export function validateEntity(draft, entities) {
  const errors = []
  const warnings = []
  const validTypes = VALID_PARENTS[draft.entity_type] || [null]

  if (!draft.name || !draft.name.trim()) errors.push('Name is required.')

  if (draft.parent_id) {
    const p = byId(entities, draft.parent_id)
    if (!p) errors.push(`Parent "${draft.parent_id}" does not exist.`)
    else if (!validTypes.includes(p.entity_type))
      errors.push(
        `A ${ENTITY_TYPE_NAMES[draft.entity_type] || draft.entity_type} cannot live inside a ${ENTITY_TYPE_NAMES[p.entity_type] || p.entity_type}.`,
      )
    // H3: micro locations only inside charted sectors
    if (p && draft.entity_type === 'location' && (draft.location_scale || 'micro') === 'micro' && chartStatus(p) !== 'charted')
      errors.push('Micro locations need a charted sector — mark the parent sector charted first.')
  } else if (validTypes.filter(Boolean).length) {
    errors.push(`A ${ENTITY_TYPE_NAMES[draft.entity_type] || draft.entity_type} needs a parent (${validTypes.filter(Boolean).join(', ')}).`)
  }

  // coords inside the 1000×700 viewBox
  const cx = Number(draft.coord_x)
  const cy = Number(draft.coord_y)
  if (draft.coord_x != null && (isNaN(cx) || cx < 0 || cx > 1000)) errors.push('coord_x must be between 0 and 1000.')
  if (draft.coord_y != null && (isNaN(cy) || cy < 0 || cy > 700)) errors.push('coord_y must be between 0 and 700.')

  // warn (don't block) on empty rumour for published entries
  if (draft.is_published && !(draft.rumour || '').trim())
    warnings.push('Published with an empty Rumour — players will see nothing at Heard Of.')

  const missing = brokenLinks(draft, entities)
  if (missing.length)
    warnings.push(`${missing.length} link${missing.length > 1 ? 's' : ''} point to missing entries: ${missing.join(', ')}`)

  return { errors, warnings }
}

// ---------- slug helper (QuickAdd / new entries) ----------
export function slugify(name, entities) {
  let base =
    (name || 'entry')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'entry'
  let slug = base
  let n = 2
  while (entities.some((e) => e.id === slug)) slug = `${base}-${n++}`
  return slug
}
