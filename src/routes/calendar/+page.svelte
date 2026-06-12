<script>
  // /calendar — the Temporal Horizon (§4 routes, §8 Phase 2 step 2).
  //
  // The shared shell (routes/+layout.svelte) provides auth, the vessel selector,
  // the top nav and toasts. This page just mounts the feature component, which
  // reads the logged-in vessel from $lib/core and persists through its own data
  // layer (calendarData.js — the only calendar file that touches Supabase).
  import Calendar from '$features/calendar/Calendar.svelte'
</script>

<Calendar />
