<script>
  // /notes — the World Chronicles (§4 routes, §8 Phase 2 step 4).
  //
  // The shared shell (routes/+layout.svelte) provides auth, the vessel selector,
  // the top nav and toasts. This page just mounts the feature component, which
  // reads the logged-in vessel from $lib/core and persists through its own data
  // layer (notesData.js — the only notes file that touches Supabase). Notes are
  // single-blob like the calendar: they live in this vessel's sheet_data under
  // `dynamicVesselNotes`, with no shared/global row.
  import Notes from '$features/notes/Notes.svelte'
</script>

<Notes />
