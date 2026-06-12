<script>
  // /atlas — the world atlas (the encyclopedia), under $lib/features/atlas/.
  //
  // Phase 1: the mock stores.js is gone and the atlas reads the real
  // lib/core/session.js (isAdmin, vesselId). App.svelte no longer carries its
  // prototype header/toggle — the shared auth bar + vessel selector + nav now
  // live in routes/+layout.svelte — so this page renders the atlas WITHOUT its
  // old shell header, booting the data layer for the logged-in vessel.
  import '$features/atlas/app.css'
  import AtlasApp from '$features/atlas/App.svelte'
</script>

<svelte:head>
  <title>Blood of the World — Atlas</title>
</svelte:head>

<AtlasApp />
