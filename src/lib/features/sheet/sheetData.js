// sheetData.js — the Sheet's data layer (§5 rule 2). The ONLY file in the
// feature that imports the Supabase client; components call these functions and
// never talk to the database themselves.
//
// The live site stores a character in `character_vessels.sheet_data` as a FLAT
// dictionary keyed by HTML element id (it literally scraped the page). We keep
// writing that EXACT shape so the live site and this rebuild read each other's
// saves with zero database migration. Internally a real `sheet` object is the
// source of truth; we map it ↔ the flat blob only at the load/save boundary.
//
// PORT (plan §5): the redesigned sheet adds structured data the live blob has no
// slot for (per-prof wound/combat/style, ascension split, N weapons with rarity,
// manifestations, custom disciplines, backpack metadata, the hour clock). To
// stay live-compatible we use a HYBRID shape (D2):
//   • REUSE existing flat keys wherever one already exists — crit counters,
//     end-session marks, sigil totals, allocations, the first two weapons, the
//     first 24 inventory slots, grit, dice, calendar age/crucible/month/day.
//   • Put everything genuinely-new under ONE namespaced JSON key, `vesselV2`, so
//     the merge-on-save preserves it and it can't collide with a live key.
// Old vessels have no `vesselV2`; the loader defaults every new field (D4) and,
// for a couple of fields, reconstructs from the legacy flat keys.
//
// Two safety upgrades over the live `persistState` are kept: we MERGE the
// sheet's fields over the freshly re-fetched blob (so calendar / notes / deeds /
// unknown keys survive — the live save rebuilt from scratch and wiped them), and
// the only Supabase touch in the feature lives here.
//
// CO-OWNERSHIP (flagged, not silently reconciled):
//   • advancementPoints — also written by Deeds (as an int). The Sheet writes a
//     String; both loaders tolerate both (F2). We do NOT unify the type here.
//   • calendar age/crucible/month/day — also written by the Calendar feature.
//     The Time & Rest card advances time, so the Sheet now mirrors those four
//     keys (in the Calendar's own types) while leaving cruciblesData and
//     manualTransitionDuration untouched (merge preserves them). New flag F7.
//   • notes / deeds — owned by their own features; the Sheet's quick cards persist
//     through notesData / deedsData, NOT through this file. toBlob never writes
//     dynamicVesselNotes / dynamicAchievementsList, so the merge preserves them.

import { supabase, isSupabaseConfigured } from '$lib/core/supabase.js'
import { isDemoId, demoBlob } from '$lib/core/demoVessel.js' // DEMO-PREVIEW (offline only)
import {
  combatCurrentFromWeapons, inventoryMax, critMarkers,
  COMBAT_TITLES, COMBAT_STYLES,
} from './rules.js'

export const GLOBAL_NAME = '__GLOBAL_CAMPAIGN__'
const MAX_SLOTS = 24 // the live persisted-inventory range (saved_item_*_1..24)

// ── Field groups, named exactly as the live blob keys ───────────────────────
const VALUE_FIELDS = [
  'characterName', 'characterBackground', 'archonDomain', 'rmcBalance', 'advancementPoints',
  'val_str', 'val_dex', 'val_wil',
  'rmCur', 'rmMax', 'taintCur', 'veilCur',
  'abilitiesLogBox', 'diceQty', 'diceSides',
]
// Skill allocation lives in the flat alloc_* keys (combined = origin + ascension).
const SKILLS = ['endurance', 'grip', 'reaction', 'grace', 'focus', 'resolve']
const ALLOC_OF = Object.fromEntries(SKILLS.map((s) => [s, `alloc_${s}`]))
// Legacy proficiency slot keys (8 fixed slots; slot 5 is the combat slot).
const PROF_TITLES = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `profTitle_${i}`)
const PROF_CUR = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `profC_${i}`)
const PROF_MAX = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `profM_${i}`)
const PROF_CRIT = [1, 2, 3, 4, 5, 6, 7, 8].map((i) => `crit_prof_${i}`)

const COUNTER_FIELDS = [
  'favorTokens', 'favorGlyphs', 'globalSuccessCount', 'critMarkersDisplay',
  'crit_attr_str', 'crit_attr_dex', 'crit_attr_wil',
  'crit_sk_end', 'crit_sk_grp', 'crit_sk_rea', 'crit_sk_gra', 'crit_sk_foc', 'crit_sk_res',
  'cleanseDays', 'sigilParry', 'sigilEvasion', 'sigilBarrier', 'abilitySuccessTracker',
]
const SKILL_CRIT = { // skill key → its legacy crit counter
  endurance: 'crit_sk_end', grip: 'crit_sk_grp', reaction: 'crit_sk_rea',
  grace: 'crit_sk_gra', focus: 'crit_sk_foc', resolve: 'crit_sk_res',
}
const SKILL_CHK = { // skill key → its legacy end-session mark
  endurance: 'chk_endurance', grip: 'chk_grip', reaction: 'chk_reaction',
  grace: 'chk_grace', focus: 'chk_focus', resolve: 'chk_resolve',
}
const CHECK_FIELDS = [
  'gritStatus', 'chk_endurance', 'chk_grip', 'chk_reaction', 'chk_grace', 'chk_focus', 'chk_resolve',
  'weapEquip_1', 'weapEquip_2',
]

// ── Calendar defaults (mirror the Calendar feature's DEFAULTS so a sheet-created
// calendar matches what the Calendar page would show). The Sheet only ever
// touches these four keys + the new hour. ──────────────────────────────────
const CAL_DEFAULTS = { age: 'Age of Nightmares', crucible: 17, month: 7, day: 1, hour: 8 }

// The three defensive sigils, in fixed order (label / attribute / tone). Their
// TOTALS live in the legacy sigil* keys; used/broken live in vesselV2.sigils.
const SIGIL_DEFS = [
  { label: 'Parry', attr: 'str', tone: 'blue', totalKey: 'sigilParry' },
  { label: 'Evasion', attr: 'dex', tone: 'gold', totalKey: 'sigilEvasion' },
  { label: 'Barrier', attr: 'wil', tone: 'taint', totalKey: 'sigilBarrier' },
]
// The four default disciplines (schools), seeded for any vessel without custom
// ones. Names/models from the approved prototype.
const DEFAULT_DISCIPLINES = [
  { id: 'bow', name: 'Blood of the World', color: '#c01f2f', model: 'bow' },
  { id: 'pharmakia', name: 'Pharmakia', color: '#86efac', model: 'pharmakia' },
  { id: 'magia', name: 'Archono Magia', color: '#7c3aed', model: 'magia' },
  { id: 'intervention', name: 'Archonic Intervention', color: '#d4af37', model: 'intervention' },
]

const NUMBER_DEFAULTS = {
  rmcBalance: 0, advancementPoints: 3,
  val_str: 7, val_dex: 7, val_wil: 7,
  rmCur: 120, rmMax: 120, taintCur: 0, veilCur: 0,
  diceQty: 1, diceSides: 100,
}
const COUNTER_DEFAULTS = { sigilParry: 2, sigilEvasion: 2, sigilBarrier: 0 } // else 0
const TITLE_DEFAULTS = {
  profTitle_1: 'Signature Proficiency (Main)', profTitle_2: 'Secondary Field',
  profTitle_3: 'Tertiary Field', profTitle_4: 'Quaternary Field',
  profTitle_5: 'Precision Strike',
  profTitle_6: 'Auxiliary Field 6', profTitle_7: 'Auxiliary Field 7', profTitle_8: 'Auxiliary Field 8',
}
const PROF_CUR_DEFAULTS = [19, 14, 14, 14, 14, 14, 14, 14]
const PROF_MAX_DEFAULTS = [19, 14, 14, 14, 14, 14, 14, 14]

const num = (v, def = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}
const intOf = (v, def = 0) => {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : def
}
const boolOf = (v) => v === true || v === 'true'
const clampInt = (v, lo, hi, def = lo) => Math.min(Math.max(intOf(v, def), lo), hi)

// ── blank sheet (a fresh vessel — identical to a fresh live sheet, plus the new
// structured fields at their defaults) ──────────────────────────────────────
export function blankSheet(name = 'Unnamed Vessel') {
  const sheet = {}
  for (const k of VALUE_FIELDS) sheet[k] = k in NUMBER_DEFAULTS ? NUMBER_DEFAULTS[k] : ''
  sheet.characterName = name

  // skills: origin (legacy alloc) + ascension split (new). Fresh = 0/0.
  sheet.skillOrigin = Object.fromEntries(SKILLS.map((s) => [s, 0]))
  sheet.skillAsc = Object.fromEntries(SKILLS.map((s) => [s, 0]))

  for (const k of COUNTER_FIELDS) sheet[k] = COUNTER_DEFAULTS[k] ?? 0
  for (const k of CHECK_FIELDS) sheet[k] = false
  sheet.corruptionVal = 0
  sheet.archonAsh = 0

  // proficiencies: the 8 default slots, slot 5 = combat.
  sheet.profs = PROF_CUR_DEFAULTS.map((cur, i) => {
    const combat = i === 4
    return {
      title: TITLE_DEFAULTS[`profTitle_${i + 1}`],
      cur, max: PROF_MAX_DEFAULTS[i],
      combat, style: combat ? 'Precision Strike' : undefined,
      wounded: false, woundRank: 0, crit: 0,
    }
  })

  // sigils: totals from defaults, none used/broken.
  sheet.sigilState = SIGIL_DEFS.map(() => ({ used: 0, broken: 0 }))

  sheet.weapons = [] // a fresh vessel carries no armaments
  sheet.inventory = [] // dynamic backpack (name/weight/broken/prof)
  sheet.manifestations = []
  sheet.disciplines = DEFAULT_DISCIPLINES.map((d) => ({ ...d }))
  sheet.pharmakia = { reagents: false, doses: 0 }
  sheet.cal = { ...CAL_DEFAULTS }
  return sheet
}

// ── coercers for the structured arrays out of a vesselV2 blob ───────────────
function coerceProf(p, i) {
  const o = p || {}
  const combat = !!o.combat
  return {
    title: o.title != null ? String(o.title) : `Field ${i + 1}`,
    cur: intOf(o.cur, 14),
    max: intOf(o.max, 14),
    combat,
    style: combat ? (COMBAT_STYLES.includes(o.style) ? o.style : 'Precision Strike') : undefined,
    wounded: !!o.wounded,
    woundRank: intOf(o.woundRank, 0),
    crit: Math.max(0, intOf(o.crit, 0)),
  }
}
function coerceWeapon(w) {
  const o = w || {}
  const rarity = ['common', 'uncommon', 'rare', 'epic'].includes(o.rarity) ? o.rarity : 'common'
  const named = !!o.named && (rarity === 'rare' || rarity === 'epic')
  return {
    name: o.name != null ? String(o.name) : '',
    rarity,
    mod: intOf(o.mod, 0),
    combatType: COMBAT_STYLES.includes(o.combatType) ? o.combatType : 'Precision Strike',
    broken: !!o.broken,
    named,
    namedTitle: o.namedTitle != null ? String(o.namedTitle) : '',
    unique: Math.max(0, intOf(o.unique, 0)),
    equipped: !!o.equipped,
  }
}
function coerceManifest(m) {
  const o = m || {}
  const out = {
    name: o.name != null ? String(o.name) : 'Manifestation',
    disc: o.disc != null ? String(o.disc) : 'bow',
    desc: o.desc != null ? String(o.desc) : '',
    successes: Math.max(0, intOf(o.successes, 0)),
  }
  if (o.bow != null) out.bow = intOf(o.bow, 40)
  if (o.glyph != null) out.glyph = Math.max(0, intOf(o.glyph, 0))
  if (o.ash != null) out.ash = Math.max(0, intOf(o.ash, 0))
  return out
}
function coerceDiscipline(d) {
  const o = d || {}
  return {
    id: o.id != null ? String(o.id) : 'd' + Math.random().toString(36).slice(2),
    name: o.name != null ? String(o.name) : 'Discipline',
    color: o.color != null ? String(o.color) : '#9ca3af',
    model: ['bow', 'pharmakia', 'magia', 'intervention', 'custom'].includes(o.model) ? o.model : 'custom',
  }
}

// ── Flat blob → structured sheet object ─────────────────────────────────────
export function fromBlob(blob) {
  const b = blob || {}
  const v2 = (b.vesselV2 && typeof b.vesselV2 === 'object') ? b.vesselV2 : {}
  const sheet = blankSheet(b.characterName ?? 'Unnamed Vessel')

  // 1) simple value fields
  for (const k of VALUE_FIELDS) {
    if (b[k] === undefined || b[k] === null || b[k] === '') continue
    sheet[k] = k in NUMBER_DEFAULTS ? num(b[k], NUMBER_DEFAULTS[k]) : String(b[k])
  }

  // 2) counters / checks / corruption
  for (const k of COUNTER_FIELDS) sheet[k] = intOf(b[k], COUNTER_DEFAULTS[k] ?? 0)
  for (const k of CHECK_FIELDS) sheet[k] = boolOf(b[k])
  sheet.corruptionVal = intOf(b.corruptionVal, 0)
  sheet.archonAsh = Math.max(0, intOf(v2.archonAsh, 0))

  // 3) skills — alloc_* (combined) split into origin + ascension. ascension
  //    comes from vesselV2.skillAsc (default 0); origin = alloc − asc (≥0).
  const asc = (v2.skillAsc && typeof v2.skillAsc === 'object') ? v2.skillAsc : {}
  for (const s of SKILLS) {
    const combined = intOf(b[ALLOC_OF[s]], 0)
    const a = Math.max(0, intOf(asc[s], 0))
    sheet.skillAsc[s] = a
    sheet.skillOrigin[s] = Math.max(0, combined - a)
  }

  // 4) proficiencies — vesselV2.profs is the source of truth when present;
  //    otherwise reconstruct the 8 legacy slots (slot 5 = combat).
  if (Array.isArray(v2.profs) && v2.profs.length) {
    sheet.profs = v2.profs.map(coerceProf)
  } else {
    sheet.profs = PROF_TITLES.map((tk, i) => {
      const combat = i === 4
      const rawTitle = b[tk] != null && b[tk] !== '' ? String(b[tk]) : TITLE_DEFAULTS[tk]
      return {
        title: combat ? 'Combat' : rawTitle,
        cur: intOf(b[PROF_CUR[i]], PROF_CUR_DEFAULTS[i]),
        max: intOf(b[PROF_MAX[i]], PROF_MAX_DEFAULTS[i]),
        combat,
        style: combat ? (COMBAT_STYLES.includes(rawTitle) ? rawTitle : 'Precision Strike') : undefined,
        wounded: false, woundRank: 0,
        crit: Math.max(0, intOf(b[PROF_CRIT[i]], 0)),
      }
    })
  }

  // 5) sigils — totals stay in the legacy keys (already loaded into the COUNTER
  //    fields above); used/broken overlay from vesselV2.sigils.
  const sigV2 = Array.isArray(v2.sigils) ? v2.sigils : []
  sheet.sigilState = SIGIL_DEFS.map((_, i) => ({
    used: Math.max(0, intOf(sigV2[i]?.used, 0)),
    broken: Math.max(0, intOf(sigV2[i]?.broken, 0)),
  }))

  // 6) weapons — vesselV2.weapons when present; else reconstruct the 2 legacy.
  if (Array.isArray(v2.weapons) && v2.weapons.length) {
    sheet.weapons = v2.weapons.map(coerceWeapon)
  } else {
    sheet.weapons = []
    for (const w of [1, 2]) {
      const nm = b[`weapName_${w}`]
      if (nm == null || nm === '') continue
      sheet.weapons.push(coerceWeapon({
        name: String(nm), mod: intOf(b[`weapMod_${w}`], 0), equipped: boolOf(b[`weapEquip_${w}`]),
      }))
    }
  }

  // 7) inventory — name/weight from the legacy slots, broken/prof overlaid from
  //    vesselV2.backpack by index. Trailing empty slots are trimmed.
  const bp = Array.isArray(v2.backpack) ? v2.backpack : []
  const items = []
  for (let i = 1; i <= MAX_SLOTS; i++) {
    const nm = b[`saved_item_name_${i}`]
    const wt = b[`saved_item_weight_${i}`]
    items.push({
      name: nm != null ? String(nm) : '',
      weight: intOf(wt, 0),
      broken: !!bp[i - 1]?.broken,
      prof: bp[i - 1]?.prof != null ? String(bp[i - 1].prof) : '—',
    })
  }
  while (items.length && !items[items.length - 1].name && !items[items.length - 1].weight) items.pop()
  sheet.inventory = items

  // 8) manifestations / disciplines / pharmakia (all vesselV2). Migration: if no
  //    manifestations but the legacy free-text abilities box has content, seed
  //    one freeform Abilities manifestation from it (plan §5c).
  sheet.disciplines = Array.isArray(v2.disciplines) && v2.disciplines.length
    ? v2.disciplines.map(coerceDiscipline)
    : DEFAULT_DISCIPLINES.map((d) => ({ ...d }))
  if (Array.isArray(v2.manifestations) && v2.manifestations.length) {
    sheet.manifestations = v2.manifestations.map(coerceManifest)
  } else if (sheet.abilitiesLogBox && String(sheet.abilitiesLogBox).trim()) {
    sheet.manifestations = [coerceManifest({
      name: 'Inscribed Abilities (legacy)', disc: 'bow', desc: String(sheet.abilitiesLogBox), bow: 40,
    })]
  } else {
    sheet.manifestations = []
  }
  sheet.pharmakia = {
    reagents: !!(v2.pharmakia?.reagents),
    doses: Math.max(0, intOf(v2.pharmakia?.doses, 0)),
  }

  // 9) calendar — read the four live keys (Calendar feature owns them too); the
  //    hour is new (vesselV2.calendarHour).
  sheet.cal = {
    age: b.currentAge != null && b.currentAge !== '' ? String(b.currentAge) : CAL_DEFAULTS.age,
    crucible: intOf(b.currentCrucible, CAL_DEFAULTS.crucible) || CAL_DEFAULTS.crucible,
    month: intOf(b.calendarCurrentMonth, CAL_DEFAULTS.month) || CAL_DEFAULTS.month,
    day: intOf(b.calendarCurrentDay, CAL_DEFAULTS.day) || CAL_DEFAULTS.day,
    hour: clampInt(v2.calendarHour, 0, 23, CAL_DEFAULTS.hour),
  }

  return sheet
}

// ── Structured sheet → flat blob, MERGED over the existing blob ──────────────
export function toBlob(sheet, existing = {}) {
  const blob = { ...existing }

  // 1) value fields (live types: strings)
  for (const k of VALUE_FIELDS) blob[k] = String(sheet[k] ?? '')

  // 2) skills — write the COMBINED allocation back to the legacy alloc_* keys.
  for (const s of SKILLS) {
    const origin = Math.max(0, intOf(sheet.skillOrigin?.[s], 0))
    const a = Math.max(0, intOf(sheet.skillAsc?.[s], 0))
    blob[ALLOC_OF[s]] = String(origin + a)
  }

  // 3) proficiencies — derive the 8 legacy slots from sheet.profs (first 8).
  //    Combat slot: title→style, cur→derived combat current, max→max.
  for (let i = 0; i < 8; i++) {
    const p = sheet.profs?.[i]
    if (p) {
      const isCombat = !!p.combat
      blob[PROF_TITLES[i]] = String(isCombat ? (p.style || 'Precision Strike') : (p.title ?? ''))
      blob[PROF_MAX[i]] = String(intOf(p.max, 0))
      blob[PROF_CUR[i]] = String(isCombat
        ? combatCurrentFromWeapons(p.max, p.style, sheet.weapons)
        : intOf(p.cur, 0))
      blob[PROF_CRIT[i]] = String(Math.max(0, intOf(p.crit, 0)))
    } else {
      // no prof in this slot → keep a stable, live-readable default
      blob[PROF_TITLES[i]] = TITLE_DEFAULTS[PROF_TITLES[i]] ?? `Field ${i + 1}`
      blob[PROF_MAX[i]] = String(PROF_MAX_DEFAULTS[i])
      blob[PROF_CUR[i]] = String(PROF_CUR_DEFAULTS[i])
      blob[PROF_CRIT[i]] = '0'
    }
  }

  // 4) counters — sigil TOTALS come from sheet.sigilState-bearing keys; the
  //    totals themselves remain in the COUNTER_FIELDS (sigilParry/…); crit
  //    markers display derived from successes.
  for (const k of COUNTER_FIELDS) blob[k] = String(sheet[k] ?? 0)
  blob.critMarkersDisplay = String(critMarkers(sheet.globalSuccessCount))

  // 5) checks — and equip mirrors from the first two weapons.
  for (const k of ['gritStatus', 'chk_endurance', 'chk_grip', 'chk_reaction', 'chk_grace', 'chk_focus', 'chk_resolve']) {
    blob[k] = !!sheet[k]
  }
  blob.weapEquip_1 = !!(sheet.weapons?.[0]?.equipped)
  blob.weapEquip_2 = !!(sheet.weapons?.[1]?.equipped)

  blob.corruptionVal = intOf(sheet.corruptionVal, 0)

  // 6) weapons — mirror the first two to the legacy keys (named title preferred).
  for (const w of [1, 2]) {
    const wp = sheet.weapons?.[w - 1]
    if (wp) {
      blob[`weapName_${w}`] = String((wp.named ? wp.namedTitle : wp.name) ?? '')
      blob[`weapMod_${w}`] = String(intOf(wp.mod, 0))
    } else {
      blob[`weapName_${w}`] = ''
      blob[`weapMod_${w}`] = '0'
    }
  }

  // 7) inventory — write the live slots (1..min(STR+DEX,24)); clear stale higher.
  const cap = Math.min(inventoryMax(sheet.val_str, sheet.val_dex), MAX_SLOTS)
  const slots = Math.min(Math.max(cap, sheet.inventory?.length || 0), MAX_SLOTS)
  for (let i = 1; i <= MAX_SLOTS; i++) {
    if (i <= slots) {
      const item = sheet.inventory?.[i - 1] || { name: '', weight: 0 }
      blob[`saved_item_name_${i}`] = String(item.name ?? '')
      blob[`saved_item_weight_${i}`] = String(intOf(item.weight, 0))
    } else {
      delete blob[`saved_item_name_${i}`]
      delete blob[`saved_item_weight_${i}`]
    }
  }

  // 8) calendar — mirror the four keys the Time & Rest card manages (co-owned
  //    with Calendar; cruciblesData / manualTransitionDuration are preserved by
  //    the merge — we never write them). Hour is new → vesselV2.
  blob.currentAge = String(sheet.cal?.age ?? CAL_DEFAULTS.age)
  blob.currentCrucible = intOf(sheet.cal?.crucible, CAL_DEFAULTS.crucible)
  blob.calendarCurrentMonth = intOf(sheet.cal?.month, CAL_DEFAULTS.month)
  blob.calendarCurrentDay = intOf(sheet.cal?.day, CAL_DEFAULTS.day)

  // 9) vesselV2 — the one namespaced JSON key for all genuinely-new data.
  blob.vesselV2 = {
    profs: (sheet.profs || []).map((p) => ({
      title: p.combat ? 'Combat' : String(p.title ?? ''),
      cur: intOf(p.cur, 0),
      max: intOf(p.max, 0),
      combat: !!p.combat,
      ...(p.combat ? { style: p.style || 'Precision Strike' } : {}),
      wounded: !!p.wounded,
      woundRank: intOf(p.woundRank, 0),
      crit: Math.max(0, intOf(p.crit, 0)),
    })),
    skillAsc: Object.fromEntries(SKILLS.map((s) => [s, Math.max(0, intOf(sheet.skillAsc?.[s], 0))])),
    weapons: (sheet.weapons || []).map((w) => ({
      name: String(w.name ?? ''), rarity: w.rarity || 'common', mod: intOf(w.mod, 0),
      combatType: w.combatType || 'Precision Strike', broken: !!w.broken,
      named: !!w.named, namedTitle: String(w.namedTitle ?? ''), unique: Math.max(0, intOf(w.unique, 0)),
      equipped: !!w.equipped,
    })),
    manifestations: (sheet.manifestations || []).map((m) => {
      const o = { name: String(m.name ?? ''), disc: String(m.disc ?? 'bow'), desc: String(m.desc ?? ''), successes: Math.max(0, intOf(m.successes, 0)) }
      if (m.bow != null) o.bow = intOf(m.bow, 40)
      if (m.glyph != null) o.glyph = Math.max(0, intOf(m.glyph, 0))
      if (m.ash != null) o.ash = Math.max(0, intOf(m.ash, 0))
      return o
    }),
    disciplines: (sheet.disciplines || []).map((d) => ({
      id: String(d.id), name: String(d.name ?? ''), color: String(d.color ?? '#9ca3af'), model: d.model || 'custom',
    })),
    archonAsh: Math.max(0, intOf(sheet.archonAsh, 0)),
    pharmakia: { reagents: !!(sheet.pharmakia?.reagents), doses: Math.max(0, intOf(sheet.pharmakia?.doses, 0)) },
    sigils: (sheet.sigilState || []).map((s) => ({ used: Math.max(0, intOf(s.used, 0)), broken: Math.max(0, intOf(s.broken, 0)) })),
    backpack: (sheet.inventory || []).map((it) => ({ broken: !!it.broken, prof: String(it.prof ?? '—') })),
    calendarHour: clampInt(sheet.cal?.hour, 0, 23, CAL_DEFAULTS.hour),
  }

  return blob
}

// ── load / save (re-fetch + merge, identical guards to the live loader) ──────
export async function loadSheet(id) {
  if (!isSupabaseConfigured || !supabase) {
    if (isDemoId(id)) { const raw = demoBlob(); return { ok: true, sheet: fromBlob(raw), raw } } // DEMO-PREVIEW
    return { ok: true, sheet: blankSheet(), raw: {} }
  }
  if (!id) return { error: 'No vessel selected.' }
  const { data, error } = await supabase
    .from('character_vessels')
    .select('character_name, sheet_data')
    .eq('id', id)
    .single()
  if (error) return { error: error.message }
  if (data?.character_name === GLOBAL_NAME)
    return { error: 'That entry is the Global Triumphs record — pick a character vessel.' }
  const raw = data?.sheet_data || {}
  return { ok: true, sheet: fromBlob(raw), raw }
}

export async function saveSheet(id, sheet) {
  if (!isSupabaseConfigured || !supabase) return { ok: true } // offline/demo: no-op
  if (!id) return { error: 'No vessel selected.' }
  const { data: current, error: readErr } = await supabase
    .from('character_vessels')
    .select('sheet_data')
    .eq('id', id)
    .single()
  if (readErr) return { error: readErr.message }
  const blob = toBlob(sheet, current?.sheet_data || {})
  const characterName = (sheet.characterName || '').trim() || 'Unnamed Vessel'
  const { error } = await supabase
    .from('character_vessels')
    .update({ character_name: characterName, sheet_data: blob, updated_at: new Date().toISOString() })
    .eq('id', id)
  return error ? { error: error.message } : { ok: true }
}

// Exposed for components: the fixed sigil definitions and combat styles.
export { SIGIL_DEFS, SKILLS, SKILL_CRIT, SKILL_CHK, COMBAT_TITLES, COMBAT_STYLES }
