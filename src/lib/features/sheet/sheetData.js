// sheetData.js — the Sheet's data layer (§5 rule 2). The ONLY file in the
// feature that imports the Supabase client; the component calls these functions
// and never talks to the database itself.
//
// The live site stores a character in `character_vessels.sheet_data` as a FLAT
// dictionary keyed by HTML element id (it literally scraped the page). We keep
// writing that EXACT same shape (§8 data-model note) so the live site and this
// rebuild read each other's saves with zero database migration. The difference
// is internal: here a real `sheet` object is the source of truth, and we map
// it to/from the flat blob only at the load/save boundary.
//
// One safety upgrade over the live `persistState`: the live sheet save rebuilt
// the blob from scratch and carried only six calendar keys forward, which drops
// any deeds/notes/calendar data also living in the same blob. We instead MERGE
// the sheet's fields over the existing blob, so every other key (calendar,
// deeds, notes, and anything we don't recognise) is preserved untouched. That
// is strictly safer and still a valid blob for the live loader.

import { supabase, isSupabaseConfigured } from '$lib/core/supabase.js'
import { combatProficiencyCurrent, inventoryMax, critMarkers } from './rules.js'

export const GLOBAL_NAME = '__GLOBAL_CAMPAIGN__'
const MAX_SLOTS = 24 // the live persisted-inventory range (saved_item_*_1..24)

// Field groups, named exactly as the live blob keys.
const VALUE_FIELDS = [
  'characterName', 'characterBackground', 'archonDomain', 'rmcBalance', 'advancementPoints',
  'val_str', 'val_dex', 'val_wil',
  'alloc_endurance', 'alloc_grip', 'alloc_reaction', 'alloc_grace', 'alloc_focus', 'alloc_resolve',
  'rmCur', 'rmMax', 'taintCur', 'veilCur',
  'weapName_1', 'weapName_2', 'weapMod_1', 'weapMod_2',
  'abilitiesLogBox', 'diceQty', 'diceSides',
]
const PROF_TITLES = ['profTitle_1', 'profTitle_2', 'profTitle_3', 'profTitle_4', 'profTitle_5', 'profTitle_6', 'profTitle_7', 'profTitle_8']
const PROF_CUR = ['profC_1', 'profC_2', 'profC_3', 'profC_4', 'profC_5', 'profC_6', 'profC_7', 'profC_8']
const PROF_MAX = ['profM_1', 'profM_2', 'profM_3', 'profM_4', 'profM_5', 'profM_6', 'profM_7', 'profM_8']

const COUNTER_FIELDS = [
  'favorTokens', 'favorGlyphs', 'globalSuccessCount', 'critMarkersDisplay',
  'crit_attr_str', 'crit_attr_dex', 'crit_attr_wil',
  'crit_sk_end', 'crit_sk_grp', 'crit_sk_rea', 'crit_sk_gra', 'crit_sk_foc', 'crit_sk_res',
  'crit_prof_1', 'crit_prof_2', 'crit_prof_3', 'crit_prof_4', 'crit_prof_5', 'crit_prof_6', 'crit_prof_7', 'crit_prof_8',
  'cleanseDays', 'sigilParry', 'sigilEvasion', 'sigilBarrier', 'abilitySuccessTracker',
]
const CHECK_FIELDS = [
  'gritStatus', 'chk_endurance', 'chk_grip', 'chk_reaction', 'chk_grace', 'chk_focus', 'chk_resolve',
  'weapEquip_1', 'weapEquip_2',
]

// Initial values, taken from the live HTML's default field values so a brand
// new vessel looks identical to a fresh live sheet.
const NUMBER_DEFAULTS = {
  rmcBalance: 0, advancementPoints: 3,
  val_str: 7, val_dex: 7, val_wil: 7,
  alloc_endurance: 0, alloc_grip: 0, alloc_reaction: 0, alloc_grace: 0, alloc_focus: 0, alloc_resolve: 0,
  rmCur: 120, rmMax: 120, taintCur: 0, veilCur: 0,
  weapMod_1: 0, weapMod_2: 0, diceQty: 1, diceSides: 100,
  profC_1: 19, profC_2: 14, profC_3: 14, profC_4: 14, profC_5: 14, profC_6: 14, profC_7: 14, profC_8: 14,
  profM_1: 19, profM_2: 14, profM_3: 14, profM_4: 14, profM_5: 14, profM_6: 14, profM_7: 14, profM_8: 14,
}
const COUNTER_DEFAULTS = { sigilParry: 2, sigilEvasion: 2, sigilBarrier: 0 } // everything else defaults to 0
const TITLE_DEFAULTS = {
  profTitle_1: 'Signature Proficiency (Main)', profTitle_2: 'Secondary Field',
  profTitle_3: 'Tertiary Field', profTitle_4: 'Quaternary Field',
  profTitle_5: 'Precision Strike',
  profTitle_6: 'Auxiliary Field 6', profTitle_7: 'Auxiliary Field 7', profTitle_8: 'Auxiliary Field 8',
}

const num = (v, def = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : def
}

// A blank sheet object — the in-memory source of truth for a new vessel.
export function blankSheet(name = 'Unnamed Vessel') {
  const sheet = {}
  for (const k of VALUE_FIELDS) sheet[k] = k in NUMBER_DEFAULTS ? NUMBER_DEFAULTS[k] : ''
  sheet.characterName = name
  for (let i = 0; i < PROF_TITLES.length; i++) {
    sheet[PROF_TITLES[i]] = TITLE_DEFAULTS[PROF_TITLES[i]]
    sheet[PROF_CUR[i]] = NUMBER_DEFAULTS[PROF_CUR[i]]
    sheet[PROF_MAX[i]] = NUMBER_DEFAULTS[PROF_MAX[i]]
  }
  for (const k of COUNTER_FIELDS) sheet[k] = COUNTER_DEFAULTS[k] ?? 0
  for (const k of CHECK_FIELDS) sheet[k] = false
  sheet.corruptionVal = 0
  sheet.inventory = Array.from({ length: MAX_SLOTS }, () => ({ name: '', weight: 0 }))
  return sheet
}

// Flat blob (from Supabase) → structured sheet object.
export function fromBlob(blob) {
  const b = blob || {}
  const sheet = blankSheet(b.characterName ?? 'Unnamed Vessel')

  for (const k of VALUE_FIELDS) {
    if (b[k] === undefined || b[k] === null || b[k] === '') continue
    sheet[k] = k in NUMBER_DEFAULTS ? num(b[k], NUMBER_DEFAULTS[k]) : String(b[k])
  }
  for (let i = 0; i < PROF_TITLES.length; i++) {
    if (b[PROF_TITLES[i]] !== undefined && b[PROF_TITLES[i]] !== null && b[PROF_TITLES[i]] !== '')
      sheet[PROF_TITLES[i]] = String(b[PROF_TITLES[i]])
    sheet[PROF_CUR[i]] = num(b[PROF_CUR[i]], NUMBER_DEFAULTS[PROF_CUR[i]])
    sheet[PROF_MAX[i]] = num(b[PROF_MAX[i]], NUMBER_DEFAULTS[PROF_MAX[i]])
  }
  for (const k of COUNTER_FIELDS) sheet[k] = num(b[k], COUNTER_DEFAULTS[k] ?? 0)
  for (const k of CHECK_FIELDS) sheet[k] = b[k] === true || b[k] === 'true'
  sheet.corruptionVal = num(b.corruptionVal, 0)

  // Inventory: live stores saved_item_name_N / saved_item_weight_N (1-based).
  sheet.inventory = Array.from({ length: MAX_SLOTS }, (_, i) => {
    const idx = i + 1
    return {
      name: b[`saved_item_name_${idx}`] != null ? String(b[`saved_item_name_${idx}`]) : '',
      weight: num(b[`saved_item_weight_${idx}`], 0),
    }
  })
  return sheet
}

// Structured sheet → flat blob, MERGED over the existing blob so non-sheet keys
// (calendar / deeds / notes / unknown) survive. Mirrors the live key shape:
// value/title fields as strings, counters as strings, checks as booleans,
// corruptionVal as an integer, inventory as saved_item_*_N.
export function toBlob(sheet, existing = {}) {
  const blob = { ...existing }

  for (const k of VALUE_FIELDS) blob[k] = String(sheet[k] ?? '')
  for (let i = 0; i < PROF_TITLES.length; i++) {
    blob[PROF_TITLES[i]] = String(sheet[PROF_TITLES[i]] ?? '')
    blob[PROF_MAX[i]] = String(sheet[PROF_MAX[i]] ?? '')
    blob[PROF_CUR[i]] = String(sheet[PROF_CUR[i]] ?? '')
  }
  // Combat slot-5 current is derived from its max + equipped weapon mods.
  blob.profC_5 = String(
    combatProficiencyCurrent(sheet.profM_5, sheet.weapEquip_1, sheet.weapMod_1, sheet.weapEquip_2, sheet.weapMod_2),
  )
  for (const k of COUNTER_FIELDS) blob[k] = String(sheet[k] ?? 0)
  // critMarkersDisplay is always 1 per 8 successes (live: adjustGlobalSuccess).
  blob.critMarkersDisplay = String(critMarkers(sheet.globalSuccessCount))
  for (const k of CHECK_FIELDS) blob[k] = !!sheet[k]
  blob.corruptionVal = parseInt(sheet.corruptionVal, 10) || 0

  // Inventory — write only the live slots (1..STR+DEX, capped at 24) and clear
  // any higher stale slots, so the stored shape matches what the live site
  // produces for the same attributes.
  const slots = Math.min(inventoryMax(sheet.val_str, sheet.val_dex), MAX_SLOTS)
  for (let i = 1; i <= MAX_SLOTS; i++) {
    if (i <= slots) {
      const item = sheet.inventory[i - 1] || { name: '', weight: 0 }
      blob[`saved_item_name_${i}`] = String(item.name ?? '')
      blob[`saved_item_weight_${i}`] = String(parseInt(item.weight, 10) || 0)
    } else {
      delete blob[`saved_item_name_${i}`]
      delete blob[`saved_item_weight_${i}`]
    }
  }
  return blob
}

// loadSheet — read one vessel's blob and return it as a sheet object.
export async function loadSheet(id) {
  if (!isSupabaseConfigured || !supabase) return { ok: true, sheet: blankSheet(), raw: {} }
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

// saveSheet — re-fetch the latest blob (so a concurrent calendar/deeds/notes
// write isn't lost), merge the sheet's fields over it, and write it back.
// Returns { ok } or { error }.
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
