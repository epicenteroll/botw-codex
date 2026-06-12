// demoVessel.js — TEMPORARY offline preview (task B).
// ===========================================================================
// PURPOSE
//   Lets you view and click through Sheet / Calendar / Deeds / Notes locally
//   WITHOUT a backend. In offline mode there is no login and no vessel selector,
//   so every feature page would otherwise show "No vessel summoned" and you
//   could only see the Atlas. This module hands those pages a SAMPLE vessel to
//   render, purely in memory.
//
// SAFETY (honours §5 of the migration plan)
//   • It only does anything when Supabase is NOT configured (offline/demo mode).
//     `demoAvailable` is a build-time constant: with real keys in .env.local it
//     is false and every function here is inert.
//   • It never writes anywhere. The feature data layers already no-op on save
//     when offline; this only affects what LOAD returns, and only for the one
//     sentinel id below.
//   • It does not appear or interfere once real keys are set: the shell only
//     renders the "Preview sample vessel" button in the offline branch, and the
//     loaders only divert on `isDemoId(id)`, which is false online.
//
// HOW TO REMOVE (clean, ~5 spots — all tagged "DEMO-PREVIEW")
//   1. delete this file (src/lib/core/demoVessel.js)
//   2. remove the DEMO-PREVIEW block in each feature data layer's load function:
//        src/lib/features/sheet/sheetData.js     (loadSheet)
//        src/lib/features/calendar/calendarData.js(loadCalendar)
//        src/lib/features/deeds/deedsData.js      (loadDeeds)
//        src/lib/features/notes/notesData.js      (loadNotes)
//   3. remove the import + the "Preview sample vessel" button in
//        src/routes/+layout.svelte  (also tagged DEMO-PREVIEW)
// ===========================================================================

import { writable, get } from 'svelte/store'
import { isSupabaseConfigured } from './supabase.js'
import { vesselId } from './session.js'

// A sentinel id that is obviously not a real character_vessels UUID.
export const DEMO_VESSEL_ID = '__DEMO_OFFLINE_PREVIEW__'

// True only when running with no backend keys. Build-time constant.
export const demoAvailable = !isSupabaseConfigured

// Whether the preview is currently switched on (drives the shell button label).
export const demoActive = writable(false)

// Is this load request for the demo vessel? (Always false online.)
export function isDemoId(id) {
  return demoAvailable && id === DEMO_VESSEL_ID
}

// ---------------------------------------------------------------------------
// The sample data. ONE flat `sheet_data`-shaped blob holding sheet + calendar
// + deeds + notes keys together — exactly how the live monolith stores a
// character. Each feature's loader picks out only the keys it understands, so
// this single object feeds all four pages. Returned by value (fresh copy each
// call) so edits in the preview can never accumulate into shared state.
// ---------------------------------------------------------------------------
export function demoBlob() {
  return {
    // —— identity / sheet ——
    characterName: 'Maeve of the Ashen Vow',
    characterBackground: 'A covenant-sworn warden, walking the charted world to mend what the blood-tide unmade.',
    archonDomain: 'The Veil Between',
    advancementPoints: 12,
    rmcBalance: 3,
    val_str: 11,
    val_dex: 9,
    val_wil: 13,
    alloc_endurance: 3,
    alloc_grip: 1,
    alloc_reaction: 2,
    alloc_grace: 2,
    alloc_focus: 4,
    alloc_resolve: 3,
    rmCur: 96,
    rmMax: 120,
    taintCur: 22,
    veilCur: 40,
    favorTokens: '5',
    favorGlyphs: '2',
    globalSuccessCount: 17,
    // a couple of equipped weapons + proficiency titles, so combat isn't empty
    weapName_1: 'Vowblade',
    weapMod_1: 4,
    weapEquip_1: true,
    weapName_2: 'Ash Censer',
    weapMod_2: 2,
    weapEquip_2: false,
    profTitle_1: 'Vowblade Mastery',
    profC_1: 22, profM_1: 22,
    profTitle_2: 'Veilcraft',
    profC_2: 18, profM_2: 18,
    abilitiesLogBox: 'Oathkeeper: once per crucible, convert a failed Resolve check into a graze.',
    // a few inventory slots filled (the rest default blank)
    saved_item_name_1: 'Pilgrim\u2019s rations', saved_item_weight_1: '2',
    saved_item_name_2: 'Veil-lantern', saved_item_weight_2: '1',
    saved_item_name_3: 'Covenant seal', saved_item_weight_3: '1',

    // —— calendar (Temporal Horizon) ——
    currentAge: 'The Third Mending',
    currentCrucible: 2,
    calendarCurrentMonth: 4,
    calendarCurrentDay: 11,

    // —— deeds (personal slice lives in the vessel blob) ——
    unlockedAchievements: { p_0: true, p_2: true },
    dynamicAchievementsList: [
      { title: 'Charted the Dust Gullets', desc: 'First to map the southern reach.', apValue: 3, isGlobal: false },
      { title: 'Held the Ashen Vow', desc: 'Refused the taint at the Veil.', apValue: 5, isGlobal: false },
      { title: 'Mended a Severed Sector', desc: 'Restored a corridor to the canon.', apValue: 4, isGlobal: false },
    ],

    // —— notes (World Chronicles) ——
    dynamicVesselNotes: [
      { title: 'On the Blood-Tide', category: 'knowledge', content: 'The tide does not rise from the sea but from memory. Where the world forgets, the blood remembers.' },
      { title: 'Quest: The Severed Corridor', category: 'quest', content: 'Find the broken waypoint east of the Dust Gullets and restore its charting state before the next crucible.' },
      { title: 'Private', category: 'personal', content: 'I have not slept since the Veil. The lantern keeps the worst of it out.' },
    ],
  }
}

// A tiny sample of campaign-wide triumphs. Offline there is no __GLOBAL_CAMPAIGN__
// row, so Deeds' shared column would be empty; this gives it something to show.
export function demoGlobalBlob() {
  return {
    dynamicAchievementsList: [
      { title: 'The First Charting', desc: 'The covenant mapped the known world.', apValue: 0, isGlobal: true, achievedBy: 'The Wardens' },
      { title: 'The Veil Held', desc: 'No vessel fell to the tide this age.', apValue: 0, isGlobal: true, achievedBy: 'All hands' },
    ],
  }
}

// ---- toggle actions (used by the shell button) ----
export function enableDemo() {
  if (!demoAvailable) return
  demoActive.set(true)
  vesselId.set(DEMO_VESSEL_ID)
}

export function disableDemo() {
  demoActive.set(false)
  if (get(vesselId) === DEMO_VESSEL_ID) vesselId.set(null)
}

export function toggleDemo() {
  if (get(demoActive)) disableDemo()
  else enableDemo()
}
