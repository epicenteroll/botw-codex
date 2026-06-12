<script>
  // App.svelte — the atlas mount inside the unified Codex (Phase 1).
  //
  // The throwaway prototype header + mock Admin/Player toggle are GONE: the real
  // auth bar, vessel selector and top nav now live in routes/+layout.svelte, and
  // `isAdmin` / `vesselId` come from the real lib/core/session.js. This file just
  // boots the atlas's data layer for the logged-in vessel and renders it.
  //
  // Toasts raised inside the atlas are forwarded to the app-wide toast system
  // (lib/core/toast.js) so every feature shares one notification stack.
  import { onMount } from 'svelte'
  import { vesselId } from '$lib/core/session.js'
  import { pushToast } from '$lib/core/toast.js'
  import { init, ready, bindVesselId } from './lib/dataLayer.js'
  import Encyclopedia from './components/encyclopedia/Encyclopedia.svelte'

  // Admin discovery grants/clears in the data layer must write for whichever
  // vessel is currently selected — bind the real store once.
  bindVesselId(vesselId)

  let mounted = false
  let lastVessel

  onMount(async () => {
    lastVessel = $vesselId
    await init($vesselId)
    mounted = true
  })

  // Phase 1 checkpoint: when the player switches vessel, reload so the atlas
  // reflects THAT vessel's discoveries. onMount handles the first load; this
  // only fires on later changes.
  $: if (mounted) reload($vesselId)
  async function reload(v) {
    if (v === lastVessel) return
    lastVessel = v
    await init(v)
  }
</script>

<div class="atlas-host">
  {#if $ready}
    <Encyclopedia on:toast={(e) => pushToast(e.detail)} />
  {:else}
    <div class="loading">
      <div class="skel" style="width:40%;height:22px"></div>
      <div class="skel" style="width:70%;height:14px"></div>
      <div class="skel" style="width:60%;height:14px"></div>
      <div style="margin-top:18px;color:#5b5b66;font-family:'Cinzel';letter-spacing:.1em">Charting the world…</div>
    </div>
  {/if}
</div>

<style>
  /* Fill the layout's content area instead of forcing full-viewport height, so
     the atlas sits correctly below the shared auth bar + nav. */
  .atlas-host { height: 100%; display: flex; flex-direction: column; min-height: 0; }
  .loading { margin: auto; display: flex; flex-direction: column; gap: 12px; align-items: center; max-width: 320px; width: 100%; padding: 40px 16px; }
</style>
