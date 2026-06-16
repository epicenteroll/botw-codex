// context.js — the wiring shared by the Sheet shell and its card children.
//
// The shell (Sheet.svelte) creates ONE writable `sheet` store (the single source
// of truth, §3), a `terminal` store (the System Terminal's last result), a
// `locked` store (the proficiency lock), and the bound action set, then provides
// them under CTX. Cards read them with getSheetCtx(); they NEVER touch Supabase
// (§5 rule: only sheetData.js does) — they mutate the store and the shell saves.

import { getContext } from 'svelte'

export const CTX = 'botw-sheet'
export function getSheetCtx() {
  return getContext(CTX)
}

// Note categories for quick-capture — aligned with the Notes-tab books and the
// encyclopedia entity types (people/faction/location/sector/item/lore_entry), so
// a captured note shows in the matching Notes book and can later be submitted to
// the codex. The <option>/chip shows NOTE_LABEL[key]; the value STORED in
// dynamicVesselNotes.category is the key.
export const NOTE_CATS = ['person', 'faction', 'place', 'region', 'item', 'lore']
export const NOTE_LABEL = {
  person: 'Person', faction: 'Faction', place: 'Place', region: 'Region', item: 'Item', lore: 'Lore / Event',
}
export const NOTE_COLOR = {
  person: '#7dd3fc', faction: '#fda4af', place: '#86efac', region: '#fcd34d', item: '#a3e635', lore: '#c4b5fd',
}
export const SKILL_LABEL = {
  endurance: 'Endurance', grip: 'Grip', reaction: 'Reaction',
  grace: 'Grace', focus: 'Focus', resolve: 'Resolve',
}
export const RARITIES = ['common', 'uncommon', 'rare', 'epic']
