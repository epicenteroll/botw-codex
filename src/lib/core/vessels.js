// vessels.js — the vessel library (§4 lib/core, §8 Phase 1).
//
// Ported from the live app's fetchVesselLibrary / createNewVesselInCloud /
// deleteActiveCloudVessel / switchActiveVesselToId, with the DOM scraping and
// the giant "rehydrate every input from the blob" loop removed — that sheet
// rehydration belongs to Phase 2's reactive sheet, not to the core. Here we only
// manage the LIST of vessels and which one is selected.
//
// The selected id lives in session.js's `vesselId` store (so the atlas and every
// future feature share one source of truth). Components call these actions; only
// this file (and session.js) touch the database for the core.

import { writable, get } from 'svelte/store'
import { supabase, isSupabaseConfigured } from './supabase.js'
import { vesselId } from './session.js'

export const vessels = writable([]) // [{ id, character_name }]
export const vesselsLoading = writable(false)

// The shared campaign data lives in a magic row of this name; it is never a
// selectable character vessel (the live app filters it out the same way).
const GLOBAL_NAME = '__GLOBAL_CAMPAIGN__'

// loadVessels — RLS returns the rows this user may see (their own, anything
// shared with them, everything if admin). We drop the global campaign row.
export async function loadVessels() {
  if (!isSupabaseConfigured || !supabase) {
    vessels.set([])
    return { ok: true }
  }
  vesselsLoading.set(true)
  const { data, error } = await supabase
    .from('character_vessels')
    .select('id, character_name')
    .order('updated_at', { ascending: false })
  vesselsLoading.set(false)

  if (error) {
    console.error('Vessel library load failed:', error.message)
    return { error: error.message }
  }

  vessels.set((data || []).filter((v) => v.character_name !== GLOBAL_NAME))

  // If the previously selected vessel is no longer visible, clear the selection.
  const cur = get(vesselId)
  if (cur && !get(vessels).some((v) => v.id === cur)) vesselId.set(null)
  return { ok: true }
}

// createVessel — same blank blueprint the live app seeds, written to a row owned
// by the current user. Selects the new vessel on success.
export async function createVessel(name) {
  if (!supabase) return { error: 'Supabase is not configured.' }
  const clean = (name || '').trim() || 'Unnamed Vessel'

  const { data: u } = await supabase.auth.getUser()
  const uid = u?.user?.id
  if (!uid) return { error: 'You must be signed in to create a vessel.' }

  const blankBlueprint = {
    characterName: clean,
    val_str: 7,
    val_dex: 7,
    val_wil: 7,
    favorTokens: '0',
    favorGlyphs: '0',
  }

  const { data, error } = await supabase
    .from('character_vessels')
    .insert([{ character_name: clean, sheet_data: blankBlueprint, user_id: uid }])
    .select()

  if (error) return { error: error.message }
  await loadVessels()
  const created = data?.[0]
  if (created) vesselId.set(created.id)
  return { ok: true, id: created?.id }
}

// deleteVessel — "sacrifice". The caller confirms first.
export async function deleteVessel(id) {
  if (!supabase) return { error: 'Supabase is not configured.' }
  if (!id) return { error: 'No vessel selected.' }
  const { error } = await supabase.from('character_vessels').delete().eq('id', id)
  if (error) return { error: error.message }
  if (get(vesselId) === id) vesselId.set(null)
  await loadVessels()
  return { ok: true }
}

// selectVessel — set the active vessel. Guards against loading the global
// campaign row as a character (the live app's safety check).
export async function selectVessel(id) {
  if (!id) {
    vesselId.set(null)
    return { ok: true }
  }
  if (isSupabaseConfigured && supabase) {
    const { data } = await supabase
      .from('character_vessels')
      .select('character_name')
      .eq('id', id)
      .single()
    if (data?.character_name === GLOBAL_NAME) {
      return { error: 'That entry is the Global Triumphs record — pick a character vessel.' }
    }
  }
  vesselId.set(id)
  return { ok: true }
}
