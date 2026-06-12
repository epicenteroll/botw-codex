// notesData.js — the World Chronicles' data layer (§5 rule 2). The ONLY file in
// the feature that imports the Supabase client; the component calls these
// functions and never talks to the database itself.
//
// Notes are SINGLE-BLOB, like the calendar — there is no shared/global row. They
// live in the active vessel's own `character_vessels.sheet_data` under one key:
//   dynamicVesselNotes — an array of { title, category, content }
// (the four `category` values are the book keys: personal / quest / knowledge /
// campaign; see rules.js). We keep writing that EXACT shape (§8 data-model note —
// no new tables, no migration risk) so the live site and this rebuild read each
// other's saves.
//
// As with sheetData / calendarData / deedsData, every save first RE-FETCHES the
// latest blob and MERGES only this feature's one key over it, so the sheet's /
// calendar's / deeds' keys (and anything we don't recognise) survive untouched —
// strictly safer than the live note writers, each of which round-tripped the
// whole `payload` from a single read. Internally the component holds a plain
// `notes` array as the source of truth; we map it to/from the blob only at the
// load/save boundary.

import { supabase, isSupabaseConfigured } from '$lib/core/supabase.js'
import { isDemoId, demoBlob } from '$lib/core/demoVessel.js' // DEMO-PREVIEW (offline only)

export const GLOBAL_NAME = '__GLOBAL_CAMPAIGN__'

// Normalise a raw notes array out of a blob into plain { title, category,
// content } objects, preserving order. Mirrors the live loader, which defaults
// dynamicVesselNotes to [] when absent. Title/content are coerced to strings so
// the component's `bind:value` is always safe; `category` is preserved verbatim
// (including unknown values) so a note never silently changes book — and since
// toBlob writes the WHOLE array back, such notes always survive a save.
function asNotes(arr) {
  return Array.isArray(arr)
    ? arr.map((n) => ({
        title: n?.title ?? '',
        category: n?.category ?? '',
        content: n?.content ?? '',
      }))
    : []
}

// A blank notes slice — the in-memory source of truth for a vessel with no notes
// data yet (live: `if (!payload.dynamicVesselNotes) payload.dynamicVesselNotes
// = []`).
export function blankNotes() {
  return []
}

// Vessel blob → notes array.
export function notesFromBlob(blob) {
  return asNotes((blob || {}).dynamicVesselNotes)
}

// Notes array → flat blob, MERGED over the existing blob so non-notes keys
// (sheet / calendar / deeds / unknown) survive. Writes the single live key.
export function notesToBlob(notes, existing = {}) {
  const blob = { ...existing }
  blob.dynamicVesselNotes = asNotes(notes)
  return blob
}

// loadNotes — read one vessel's blob and return its notes array. Same shape and
// guards as the calendar's loadCalendar. Returns { ok, notes, raw } or { error }.
export async function loadNotes(id) {
  if (!isSupabaseConfigured || !supabase) {
    // DEMO-PREVIEW (offline only) — task B; delete this block to remove.
    if (isDemoId(id)) { const raw = demoBlob(); return { ok: true, notes: notesFromBlob(raw), raw } }
    return { ok: true, notes: blankNotes(), raw: {} }
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
  return { ok: true, notes: notesFromBlob(raw), raw }
}

// saveNotes — re-fetch the latest blob (so a concurrent sheet/calendar/deeds
// write isn't lost), merge the notes key over it, and write it back. Mirrors
// saveCalendar / savePersonalDeeds. Returns { ok } or { error }.
export async function saveNotes(id, notes) {
  if (!isSupabaseConfigured || !supabase) return { ok: true } // offline/demo: no-op
  if (!id) return { error: 'No vessel selected.' }
  const { data: current, error: readErr } = await supabase
    .from('character_vessels')
    .select('sheet_data')
    .eq('id', id)
    .single()
  if (readErr) return { error: readErr.message }
  const blob = notesToBlob(notes, current?.sheet_data || {})
  const { error } = await supabase
    .from('character_vessels')
    .update({ sheet_data: blob, updated_at: new Date().toISOString() })
    .eq('id', id)
  return error ? { error: error.message } : { ok: true }
}
