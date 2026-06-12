<script>
  // /sheet — the character sheet (§4 routes, §8 Phase 2 step 1).
  //
  // The shared shell (routes/+layout.svelte) provides auth, the vessel selector,
  // the top nav and toasts. This page just mounts the feature component, which
  // reads the logged-in vessel from $lib/core and persists through its own data
  // layer.
  import Sheet from '$features/sheet/Sheet.svelte'
</script>

<Sheet />
