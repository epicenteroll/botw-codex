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

// Note categories + their colours (UI-only; the quick-capture Notes card writes
// the chosen category straight into dynamicVesselNotes.category).
export const NOTE_CATS = ['NPC', 'Location', 'Monster', 'Reagent', 'Material', 'Knowledge', 'Vision', 'Deed', 'Other']
export const NOTE_COLOR = {
  NPC: '#7dd3fc', Location: '#86efac', Monster: '#fda4af', Reagent: '#a3e635',
  Material: '#fcd34d', Knowledge: '#c4b5fd', Vision: '#a78bfa', Deed: '#d4af37', Other: '#9ca3af',
}
export const SKILL_LABEL = {
  endurance: 'Endurance', grip: 'Grip', reaction: 'Reaction',
  grace: 'Grace', focus: 'Focus', resolve: 'Resolve',
}
export const RARITIES = ['common', 'uncommon', 'rare', 'epic']
