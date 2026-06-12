// mockData.js — the offline data source.
//
// Imports the single source of truth (seed.json) so the standalone prototype
// runs with ZERO backend. Vite bundles the JSON at build time. The same seed
// feeds the HTML render-preview, so both stay in lockstep.

import seed from './seed.json'

export const SEED = seed

// Deep clone so in-session edits/grants never mutate the imported module.
export function loadMockWorld() {
  return {
    entities: structuredClone(seed.entities),
    deepLore: structuredClone(seed.deepLore),
    locationTypes: structuredClone(seed.locationTypes),
    initialDiscoveries: structuredClone(seed.initialDiscoveries || {}),
    factionAccess: [...(seed.factionAccess || [])],
  }
}
