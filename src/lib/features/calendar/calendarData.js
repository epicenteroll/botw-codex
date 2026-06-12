// calendarData.js — the Calendar's data layer (§5 rule 2). The ONLY file in the
// feature that imports the Supabase client; the component calls these functions
// and never talks to the database itself.
//
// The calendar lives in the SAME `character_vessels.sheet_data` blob the sheet
// uses (§8 data-model note — no new tables, no migration risk). The live site
// stores six calendar keys at the top level of that blob:
//   currentAge, currentCrucible, calendarCurrentMonth, calendarCurrentDay,
//   manualTransitionDuration, cruciblesData
// We keep writing that EXACT shape so the live site and this rebuild read each
// other's saves. Internally a real `calendar` object is the source of truth and
// we map it to/from the blob only at the load/save boundary.
//
// As with sheetData, every save MERGES the calendar keys over the freshly
// re-fetched blob, so the sheet's / deeds' / notes' keys (and anything we don't
// recognise) survive untouched — strictly safer than the live persistState,
// which rebuilt the packet from the page and only carried a fixed list forward.
//
// One faithfulness note on `manualTransitionDuration`: the live site reads the
// transition text from the *per-crucible* registry (cruciblesData[c].manual...)
// when rendering, while its manual text-edit handler wrote a *top-level* key
// that the renderer never read back — a latent live quirk. We treat the
// per-crucible value as the source of truth (it is the one that renders) and on
// save mirror the active crucible's value into the top-level key too, so the
// field round-trips correctly and the blob still carries the top-level key the
// live save expects.

import { supabase, isSupabaseConfigured } from '$lib/core/supabase.js'
import { isDemoId, demoBlob } from '$lib/core/demoVessel.js' // DEMO-PREVIEW (offline only)
import { DEFAULTS, TRANSITION_DEFAULT, ensureCrucible } from './rules.js'

export const GLOBAL_NAME = '__GLOBAL_CAMPAIGN__'

const toInt = (v, def = 0) => {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : def
}

// A blank calendar object — the in-memory source of truth for a vessel with no
// calendar data yet. Mirrors the defaults the live loader fills in, and seeds
// the current crucible's registry so the first render has a year to show.
export function blankCalendar() {
  const cal = {
    currentAge: DEFAULTS.currentAge,
    currentCrucible: DEFAULTS.currentCrucible,
    calendarCurrentMonth: DEFAULTS.calendarCurrentMonth,
    calendarCurrentDay: DEFAULTS.calendarCurrentDay,
    cruciblesData: {},
  }
  cal.cruciblesData = ensureCrucible(cal.cruciblesData, cal.currentCrucible)
  return cal
}

// Flat blob (from Supabase) → structured calendar object. Fills the same
// defaults the live `loadAndRenderVesselCalendar` applies, then guarantees the
// active crucible's registry exists (live: initializeCrucibleRegistry on load).
export function fromBlob(blob) {
  const b = blob || {}
  const cal = {
    currentAge: b.currentAge || DEFAULTS.currentAge,
    currentCrucible: toInt(b.currentCrucible, DEFAULTS.currentCrucible) || DEFAULTS.currentCrucible,
    calendarCurrentMonth: toInt(b.calendarCurrentMonth, DEFAULTS.calendarCurrentMonth) || DEFAULTS.calendarCurrentMonth,
    calendarCurrentDay: toInt(b.calendarCurrentDay, DEFAULTS.calendarCurrentDay) || DEFAULTS.calendarCurrentDay,
    // cruciblesData is already JSON-shaped; carry it through verbatim.
    cruciblesData: b.cruciblesData && typeof b.cruciblesData === 'object' ? b.cruciblesData : {},
  }
  cal.cruciblesData = ensureCrucible(cal.cruciblesData, cal.currentCrucible)
  return cal
}

// Structured calendar → flat blob, MERGED over the existing blob so non-calendar
// keys (sheet / deeds / notes / unknown) survive. Writes exactly the six keys
// the live site uses, in the live types: currentCrucible / month / day as
// numbers, currentAge & manualTransitionDuration as strings, cruciblesData as
// the registry object.
export function toBlob(calendar, existing = {}) {
  const blob = { ...existing }
  const active = calendar.cruciblesData?.[calendar.currentCrucible]

  blob.currentAge = String(calendar.currentAge ?? DEFAULTS.currentAge)
  blob.currentCrucible = toInt(calendar.currentCrucible, DEFAULTS.currentCrucible)
  blob.calendarCurrentMonth = toInt(calendar.calendarCurrentMonth, DEFAULTS.calendarCurrentMonth)
  blob.calendarCurrentDay = toInt(calendar.calendarCurrentDay, DEFAULTS.calendarCurrentDay)
  blob.cruciblesData = calendar.cruciblesData || {}
  // Mirror the active crucible's transition text into the top-level key the live
  // save carries through (see the file header note).
  blob.manualTransitionDuration = String(active?.manualTransitionDuration ?? TRANSITION_DEFAULT)

  return blob
}

// loadCalendar — read one vessel's blob and return it as a calendar object.
// Same shape and guards as the sheet's loadSheet.
export async function loadCalendar(id) {
  if (!isSupabaseConfigured || !supabase) {
    // DEMO-PREVIEW (offline only) — task B; delete this block to remove.
    if (isDemoId(id)) { const raw = demoBlob(); return { ok: true, calendar: fromBlob(raw), raw } }
    return { ok: true, calendar: blankCalendar(), raw: {} }
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
  return { ok: true, calendar: fromBlob(raw), raw }
}

// saveCalendar — re-fetch the latest blob (so a concurrent sheet/deeds/notes
// write isn't lost), merge the calendar's keys over it, and write it back.
// Mirrors the sheet's saveSheet. Returns { ok } or { error }.
export async function saveCalendar(id, calendar) {
  if (!isSupabaseConfigured || !supabase) return { ok: true } // offline/demo: no-op
  if (!id) return { error: 'No vessel selected.' }
  const { data: current, error: readErr } = await supabase
    .from('character_vessels')
    .select('sheet_data')
    .eq('id', id)
    .single()
  if (readErr) return { error: readErr.message }
  const blob = toBlob(calendar, current?.sheet_data || {})
  const { error } = await supabase
    .from('character_vessels')
    .update({ sheet_data: blob, updated_at: new Date().toISOString() })
    .eq('id', id)
  return error ? { error: error.message } : { ok: true }
}
