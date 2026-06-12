<script>
  // /deeds — the Registry of Deeds (§4 routes, §8 Phase 2 step 3).
  //
  // The shared shell (routes/+layout.svelte) provides auth, the vessel selector,
  // the top nav and toasts. This page just mounts the feature component, which
  // reads the logged-in vessel + admin flag from $lib/core and persists through
  // its own data layer (deedsData.js — the only deeds file that touches
  // Supabase). Deeds straddle two blobs: this vessel's sheet_data (personal
  // deeds, claims, AP) and the shared __GLOBAL_CAMPAIGN__ row (campaign triumphs).
  import Deeds from '$features/deeds/Deeds.svelte'
</script>

<Deeds />
