// deedsData.js — the Registry of Deeds' data layer (§5 rule 2). The ONLY file
// in the feature that imports the Supabase client; the component calls these
// functions and never talks to the database itself.
//
// Deeds are unusual among the features in that they live in TWO blobs (§8):
//   • PERSONAL deeds, the claim ledger, and the AP total live in the active
//     vessel's `character_vessels.sheet_data`:
//         dynamicAchievementsList  — [{ title, desc, apValue, isGlobal:false }]
//         unlockedAchievements     — ['p_0', 'g_3', …] composite claim keys
//         advancementPoints        — the vessel's AP total (also a Sheet field)
//   • CAMPAIGN-WIDE triumphs live in the shared `__GLOBAL_CAMPAIGN__` magic row's
//     `sheet_data`:
//         dynamicAchievementsList  — [{ title, desc, apValue, achievedBy,
//                                       achievedWhen }]
// (Both rows happen to use the key `dynamicAchievementsList`, but they are
// different rows — the vessel's holds personal deeds, the global row's holds
// triumphs — so there is no collision.)
//
// We keep writing those EXACT shapes (§8 data-model note — no new tables, no
// migration risk) so the live site and this rebuild read each other's saves.
// As with sheetData/calendarData, every save first RE-FETCHES the latest blob
// and MERGES only this feature's keys over it, so the sheet's / calendar's /
// notes' keys (and, for the global row, anything else stored there) survive
// untouched — strictly safer than the live persistState, which rebuilt the
// packet from the page.
//
// On the shared `advancementPoints` key: the Sheet also reads/writes it. The
// live deeds code wrote AP as a NUMBER (the claim toggle and override both set
// payload['advancementPoints'] = an int); the Sheet writes it as a String and
// reads either. We preserve the live deeds behaviour and write a number — the
// Sheet's loader (num()) tolerates both, so the two coexist. AP is genuinely
// co-owned by Sheet and Deeds; like every feature, Deeds trusts its in-memory
// value for the keys it owns and merges them over the re-fetched blob.

import { supabase, isSupabaseConfigured } from '$lib/core/supabase.js'
import { AP_DEFAULT } from './rules.js'

export const GLOBAL_NAME = '__GLOBAL_CAMPAIGN__'

const toInt = (v, def = 0) => {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : def
}

// Normalise a raw deeds array out of a blob into a plain array of plain objects.
function asList(arr) {
  return Array.isArray(arr) ? arr.map((a) => ({ ...a })) : []
}

// A blank personal-deeds slice — the in-memory source of truth for a vessel
// with no deeds data yet (matches the keys the live loader fills in on demand).
export function blankPersonal() {
  return {
    dynamicAchievementsList: [],
    unlockedAchievements: [],
    advancementPoints: AP_DEFAULT,
  }
}

// A blank global-triumphs slice.
export function blankGlobal() {
  return { dynamicAchievementsList: [] }
}

// Vessel blob → structured personal-deeds slice. Mirrors the live loader, which
// defaults dynamicAchievementsList / unlockedAchievements to [] when absent.
export function personalFromBlob(blob) {
  const b = blob || {}
  return {
    dynamicAchievementsList: asList(b.dynamicAchievementsList),
    unlockedAchievements: Array.isArray(b.unlockedAchievements) ? [...b.unlockedAchievements] : [],
    advancementPoints: toInt(b.advancementPoints, AP_DEFAULT),
  }
}

// Global-row blob → structured triumphs slice (live: globalRow.sheet_data
// .dynamicAchievementsList || []).
export function globalFromBlob(blob) {
  const b = blob || {}
  return { dynamicAchievementsList: asList(b.dynamicAchievementsList) }
}

// Structured personal slice → flat blob, MERGED over the existing blob so
// non-deeds keys (sheet / calendar / notes / unknown) survive. Writes the three
// live keys: lists/claims as arrays, advancementPoints as an integer.
export function personalToBlob(personal, existing = {}) {
  const blob = { ...existing }
  blob.dynamicAchievementsList = asList(personal?.dynamicAchievementsList)
  blob.unlockedAchievements = Array.isArray(personal?.unlockedAchievements)
    ? [...personal.unlockedAchievements]
    : []
  blob.advancementPoints = toInt(personal?.advancementPoints, AP_DEFAULT)
  return blob
}

// Structured global slice → flat blob, MERGED over the existing global-row blob
// so any other keys it carries survive.
export function globalToBlob(global, existing = {}) {
  const blob = { ...existing }
  blob.dynamicAchievementsList = asList(global?.dynamicAchievementsList)
  return blob
}

// loadDeeds — read the active vessel's blob (personal deeds + claims + AP) AND
// the shared global triumphs row in one go. The global row is visible to every
// logged-in account (the all_read_global_triumphs RLS policy); it may legitimately
// not exist yet, in which case globalExists is false and the component guides an
// admin to create it (live: createNewDynamicAchievement's SQL hint).
//
// Returns { ok, personal, global, globalExists } or { error }.
export async function loadDeeds(id) {
  // Offline / demo: everything blank, and pretend the global row exists so the
  // demo's add-triumph button works without a backend.
  if (!isSupabaseConfigured || !supabase) {
    return { ok: true, personal: blankPersonal(), global: blankGlobal(), globalExists: true }
  }

  // ── Personal slice (only when a vessel is selected) ──────────────────────
  let personal = blankPersonal()
  if (id) {
    const { data, error } = await supabase
      .from('character_vessels')
      .select('character_name, sheet_data')
      .eq('id', id)
      .single()
    if (error) return { error: error.message }
    if (data?.character_name === GLOBAL_NAME)
      return { error: 'That entry is the Global Triumphs record — pick a character vessel.' }
    personal = personalFromBlob(data?.sheet_data || {})
  }

  // ── Global triumphs slice (visible to all logged-in accounts) ────────────
  const { data: globalRow, error: gErr } = await supabase
    .from('character_vessels')
    .select('sheet_data')
    .eq('character_name', GLOBAL_NAME)
    .maybeSingle()
  if (gErr) return { error: gErr.message }

  return {
    ok: true,
    personal,
    global: globalFromBlob(globalRow?.sheet_data || {}),
    globalExists: Boolean(globalRow),
  }
}

// savePersonalDeeds — re-fetch the vessel's latest blob (so a concurrent
// sheet/calendar/notes write isn't lost), merge the three personal-deeds keys
// over it, and write it back. Mirrors saveSheet/saveCalendar. Returns { ok } or
// { error }.
export async function savePersonalDeeds(id, personal) {
  if (!isSupabaseConfigured || !supabase) return { ok: true } // offline/demo: no-op
  if (!id) return { error: 'No vessel selected.' }
  const { data: current, error: readErr } = await supabase
    .from('character_vessels')
    .select('sheet_data')
    .eq('id', id)
    .single()
  if (readErr) return { error: readErr.message }
  const blob = personalToBlob(personal, current?.sheet_data || {})
  const { error } = await supabase
    .from('character_vessels')
    .update({ sheet_data: blob, updated_at: new Date().toISOString() })
    .eq('id', id)
  return error ? { error: error.message } : { ok: true }
}

// saveGlobalTriumphs — locate the shared global row, re-fetch its latest blob,
// merge the triumphs list over it, and write it back to that row's id. Only
// admins can succeed here (the global row is owned by an admin and the
// vessel_update_policy gate allows owner/admin/full_edit); the component already
// gates the editing UI on isAdmin, and RLS is the backstop. Returns { ok },
// { error }, or { missing: true } when the global row hasn't been created yet.
export async function saveGlobalTriumphs(global) {
  if (!isSupabaseConfigured || !supabase) return { ok: true } // offline/demo: no-op
  const { data: globalRow, error: readErr } = await supabase
    .from('character_vessels')
    .select('id, sheet_data')
    .eq('character_name', GLOBAL_NAME)
    .maybeSingle()
  if (readErr) return { error: readErr.message }
  if (!globalRow) return { missing: true }
  const blob = globalToBlob(global, globalRow.sheet_data || {})
  const { error } = await supabase
    .from('character_vessels')
    .update({ sheet_data: blob, updated_at: new Date().toISOString() })
    .eq('id', globalRow.id)
  return error ? { error: error.message } : { ok: true }
}
