<script>
  // Encyclopedia.svelte — the container & navigation brain.
  // Stage 1.5: all state changes route through applyState() driven by navHistory
  // (F1); ‹Back/Forward› + Alt+←/→ + long-press trail + Android hardware back
  // (F2/F3); map toolbar with hi-contrast toggle (B3), admin View|Edit + Undo +
  // Reroll + snap (D1/D2); PanelSheet bottom-sheet on narrow screens (A2);
  // contextual QuickAdd from maps (C2); breadcrumb collapse (A3); crossfade (G5).
  import { createEventDispatcher, onMount, onDestroy } from 'svelte'
  import { fade } from 'svelte/transition'
  import { isAdmin } from '$lib/core/session.js'
  import { entities, patchGeometry } from '../../lib/dataLayer.js'
  import { byId } from '../../lib/domain.js'
  import { isNarrow, isPhone } from '../../lib/viewport.js'
  import {
    mapEditMode, snapToGrid, canUndo, popEdit, clearEdits,
  } from '../../lib/mapEdit.js'
  import * as nav from '../../lib/navHistory.js'

  import WorldMap from './WorldMap.svelte'
  import ContinentMap from './ContinentMap.svelte'
  import QuadrantMap from './QuadrantMap.svelte'
  import SectorMap from './SectorMap.svelte'
  import CorridorMap from './CorridorMap.svelte'
  import LocationPanel from './LocationPanel.svelte'
  import PanelSheet from './PanelSheet.svelte'
  import EncyclopediaIndex from './EncyclopediaIndex.svelte'
  import AdminEncyclopedia from './AdminEncyclopedia.svelte'
  import AdminQuickAdd from './AdminQuickAdd.svelte'

  const dispatch = createEventDispatcher()

  // ----- navigation state (driven by navHistory) -----
  let tab = 'atlas' // 'atlas' | 'index' | 'admin'
  let view = 'world' // world|continent|quadrant|sector|corridor
  let focusId = null
  let selectedId = null

  let adminEditId = null // tells AdminEncyclopedia which entry to open
  let sheetState = 'collapsed'
  let hiContrast = false
  let quickAdd = null // {context, clientX, clientY} when placing
  let showTrail = false
  let trailTimer

  const { canBack, canForward, trail } = nav

  function snapshot() {
    return { tab, view, focusId, selectedId }
  }
  // apply a history state to the component (the ONE place state mutates)
  function applyState(s) {
    if (!s) return
    tab = s.tab
    view = s.view
    focusId = s.focusId
    selectedId = s.selectedId
  }
  function go(partial, { record = true } = {}) {
    const next = { ...snapshot(), ...partial }
    applyState(next)
    if (record) nav.push(next)
  }

  function navTo(v, id) {
    go({ view: v, focusId: v === 'world' ? null : id })
  }
  function select(id) {
    go({ selectedId: id })
    if ($isNarrow && id && sheetState === 'collapsed') sheetState = 'half'
  }
  function onEnter(e) {
    go({ selectedId: e.detail.id, view: e.detail.view, focusId: e.detail.id })
  }
  function onSelect(e) {
    select(e.detail.id)
  }
  function setTab(t) {
    if (t === tab) return
    flushEdit()
    go({ tab: t })
  }

  // jump to any entity from a link or the index
  function goToEntity(id) {
    const e = byId($entities, id)
    if (!e) return
    let v = view, f = focusId
    if (e.entity_type === 'location') { v = 'sector'; f = e.parent_id }
    else if (e.entity_type === 'waypoint') { v = 'corridor'; f = e.parent_id }
    else if (e.entity_type === 'sector') { v = 'quadrant'; f = e.parent_id }
    else if (e.entity_type === 'quadrant') { v = 'continent'; f = e.parent_id }
    else if (e.entity_type === 'corridor') { v = 'continent'; f = e.parent_id }
    else if (e.entity_type === 'continent') { v = 'world'; f = null }
    // people/faction/role/item: no map — keep current view, just open the panel
    go({ tab: 'atlas', view: v, focusId: f, selectedId: id })
    if ($isNarrow && sheetState === 'collapsed') sheetState = 'half'
  }

  // ----- back / forward -----
  function doBack() { applyState(nav.back()) }
  function doForward() { applyState(nav.forward()) }
  function jumpTrail(s) { showTrail = false; applyState(nav.jumpTo(s)) }

  function onKey(e) {
    if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); doBack() }
    else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); doForward() }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && $mapEditMode) {
      e.preventDefault(); undo()
    } else if ($mapEditMode && $isAdmin && selectedId && e.key.startsWith('Arrow')) {
      nudge(e)
    }
  }
  // long-press Back → trail
  function backPointerDown() {
    trailTimer = setTimeout(() => (showTrail = true), 480)
  }
  function backPointerUp() { clearTimeout(trailTimer) }

  // ----- edit-mode helpers -----
  function flushEdit() {
    if ($mapEditMode) { mapEditMode.set(false); clearEdits() }
  }
  async function undo() {
    const ed = popEdit()
    if (!ed) return
    await patchGeometry(ed.id, ed.before)
    dispatch('toast', { msg: 'Undid last move' })
  }
  async function nudge(e) {
    const sel = byId($entities, selectedId)
    if (!sel) return
    const step = e.shiftKey ? 10 : 2
    let dx = 0, dy = 0
    if (e.key === 'ArrowLeft') dx = -step
    else if (e.key === 'ArrowRight') dx = step
    else if (e.key === 'ArrowUp') dy = -step
    else if (e.key === 'ArrowDown') dy = step
    else return
    e.preventDefault()
    if (Array.isArray(sel.blob_center)) {
      const before = { blob_center: sel.blob_center }
      const after = { blob_center: [sel.blob_center[0] + dx, sel.blob_center[1] + dy] }
      await patchGeometry(sel.id, after, before)
    } else if (sel.coord_x != null) {
      const before = { coord_x: sel.coord_x, coord_y: sel.coord_y }
      const after = { coord_x: (sel.coord_x || 0) + dx, coord_y: (sel.coord_y || 0) + dy }
      await patchGeometry(sel.id, after, before)
    }
  }
  function reroll() {
    const sel = byId($entities, selectedId)
    if (!sel || !Array.isArray(sel.blob_center)) {
      dispatch('toast', { msg: 'Select a region blob to reroll its shape.', kind: 'warn' })
      return
    }
    const seed = 'seed-' + Math.random().toString(36).slice(2, 9)
    patchGeometry(sel.id, { blob_seed: seed }, { blob_seed: sel.blob_seed })
    dispatch('toast', { msg: `Rerolled “${sel.name.split(' — ')[0]}”` })
  }
  function toggleContrast() {
    hiContrast = !hiContrast
    try { localStorage.setItem('botw-hi-contrast', hiContrast ? '1' : '0') } catch {}
  }

  // ----- QuickAdd (C2) -----
  function onQuickAdd(e) {
    quickAdd = { context: e.detail, clientX: e.detail.clientX, clientY: e.detail.clientY }
  }
  function onCreated(e) {
    quickAdd = null
    const { entity, openEditor } = e.detail
    if (openEditor) {
      adminEditId = entity.id
      go({ tab: 'admin', selectedId: entity.id })
    } else {
      select(entity.id)
    }
  }

  // ----- breadcrumb -----
  $: crumb = (() => {
    const path = [{ label: 'The World', view: 'world', id: null }]
    const continent = $entities.find((e) => e.entity_type === 'continent')
    if (['continent', 'quadrant', 'sector', 'corridor'].includes(view))
      path.push({
        label: continent ? continent.name : 'The Impure Fracta',
        view: 'continent',
        id: continent ? continent.id : null,
      })
    if (view === 'quadrant' || view === 'sector') {
      const q = view === 'quadrant'
        ? byId($entities, focusId)
        : byId($entities, byId($entities, focusId)?.parent_id)
      if (q) path.push({ label: q.name.split(' — ')[0], view: 'quadrant', id: q.id })
    }
    if (view === 'sector') {
      const sec = byId($entities, focusId)
      if (sec) path.push({ label: sec.name, view: 'sector', id: sec.id })
    }
    if (view === 'corridor') {
      const cor = byId($entities, focusId)
      if (cor) path.push({ label: cor.name, view: 'corridor', id: cor.id })
    }
    return path
  })()
  // A3: collapse to "… › Parent › Current" on phones with >3 crumbs
  $: shownCrumb =
    $isPhone && crumb.length > 3
      ? [{ label: '…', view: crumb[0].view, id: crumb[0].id, ellipsis: true }, ...crumb.slice(-2)]
      : crumb

  $: selected = byId($entities, selectedId)

  $: if (!$isAdmin && tab === 'admin') tab = 'atlas'
  $: if (!$isAdmin && $mapEditMode) mapEditMode.set(false)

  let popHandler
  onMount(() => {
    nav.init(snapshot())
    try { hiContrast = localStorage.getItem('botw-hi-contrast') === '1' } catch {}
    popHandler = (e) => {
      const s = e.state && e.state.botw
      if (s) applyState(nav.syncFromBrowser(s) || s)
    }
    window.addEventListener('popstate', popHandler)
    window.addEventListener('keydown', onKey)
  })
  onDestroy(() => {
    if (popHandler) window.removeEventListener('popstate', popHandler)
    window.removeEventListener('keydown', onKey)
  })
</script>

<div class="tabs">
  <button class:on={tab === 'atlas'} on:click={() => setTab('atlas')}>The Atlas</button>
  <button class:on={tab === 'index'} on:click={() => setTab('index')}>Encyclopedia Index</button>
  {#if $isAdmin}
    <button class:on={tab === 'admin'} on:click={() => setTab('admin')}>Admin</button>
  {/if}
</div>

<main class:narrow={$isNarrow}>
  <section class="stage">
    {#if tab === 'atlas'}
      <div class="crumb">
        <div class="navbtns">
          <button disabled={!$canBack} title="Back (Alt+←)"
            on:click={doBack}
            on:pointerdown={backPointerDown} on:pointerup={backPointerUp}
            on:pointerleave={backPointerUp}>‹</button>
          <button disabled={!$canForward} title="Forward (Alt+→)" on:click={doForward}>›</button>
          {#if showTrail && $trail.length}
            <div class="trail-pop">
              {#each $trail as t}
                <button on:click={() => jumpTrail(t)}>
                  {(byId($entities, t.selectedId) || {}).name || t.view}
                </button>
              {/each}
            </div>
          {/if}
        </div>
        {#each shownCrumb as p, i}
          {#if i === shownCrumb.length - 1}
            <span class="here">{p.label}</span>
          {:else}
            <button class="crumb-link" on:click={() => navTo(p.view, p.id)}>{p.label}</button><span class="sep">›</span>
          {/if}
        {/each}
      </div>

      <div class="mapwrap" class:hi-contrast={hiContrast} class:placing={quickAdd}>
        <!-- toolbar -->
        <div class="map-toolbar">
          <div class="seg btns">
            <button title="Bright environment" class:on={hiContrast} on:click={toggleContrast}>
              {hiContrast ? '☀' : '☾'}
            </button>
          </div>
          {#if $isAdmin}
            <div class="seg btns">
              <button class:on={!$mapEditMode} on:click={() => { mapEditMode.set(false); clearEdits() }}>View</button>
              <button class:on={$mapEditMode} on:click={() => mapEditMode.set(true)}>Edit</button>
            </div>
            {#if $mapEditMode}
              <div class="seg btns">
                <button disabled={!$canUndo} on:click={undo} title="Undo (Ctrl+Z)">↩ Undo</button>
                <button on:click={reroll} title="Reroll selected shape">⟳ Shape</button>
                {#if view === 'quadrant'}
                  <button class:on={$snapToGrid} on:click={() => snapToGrid.update((v) => !v)} title="Snap to grid">⊞ Snap</button>
                {/if}
              </div>
            {/if}
          {/if}
        </div>

        {#if $mapEditMode && $isAdmin}
          <div class="edit-banner">Editing map — positions save on release. Arrow keys nudge · Ctrl+Z undo</div>
        {/if}

        {#key view}
          <div class="map-layer" in:fade={{ duration: 150 }}>
            {#if view === 'world'}
              <WorldMap {selectedId} on:enter={onEnter} on:select={onSelect} />
            {:else if view === 'continent'}
              <ContinentMap {selectedId} on:enter={onEnter} on:select={onSelect}
                on:quickadd={onQuickAdd} on:toast={(e) => dispatch('toast', e.detail)} />
            {:else if view === 'quadrant'}
              <QuadrantMap {focusId} {selectedId} on:enter={onEnter} on:select={onSelect}
                on:quickadd={onQuickAdd} on:toast={(e) => dispatch('toast', e.detail)} />
            {:else if view === 'sector'}
              <SectorMap {focusId} {selectedId} on:enter={onEnter} on:select={onSelect}
                on:quickadd={onQuickAdd} on:toast={(e) => dispatch('toast', e.detail)} />
            {:else if view === 'corridor'}
              <CorridorMap {focusId} {selectedId} on:enter={onEnter} on:select={onSelect}
                on:quickadd={onQuickAdd} on:toast={(e) => dispatch('toast', e.detail)} />
            {/if}
          </div>
        {/key}
      </div>
    {:else if tab === 'index'}
      <EncyclopediaIndex on:go={(e) => goToEntity(e.detail)} />
    {:else if tab === 'admin'}
      <AdminEncyclopedia
        bind:openId={adminEditId}
        on:go={(e) => goToEntity(e.detail)}
        on:toast={(e) => dispatch('toast', e.detail)} />
    {/if}
  </section>

  {#if $isNarrow}
    <PanelSheet
      bind:state={sheetState}
      title={selected ? selected.name : 'Nothing selected'}
      on:back={doBack}>
      <LocationPanel
        {selectedId}
        on:go={(e) => goToEntity(e.detail)}
        on:enter={onEnter}
        on:toast={(e) => dispatch('toast', e.detail)} />
    </PanelSheet>
  {:else}
    <aside>
      <LocationPanel
        {selectedId}
        on:go={(e) => goToEntity(e.detail)}
        on:enter={onEnter}
        on:toast={(e) => dispatch('toast', e.detail)} />
    </aside>
  {/if}
</main>

{#if quickAdd}
  <AdminQuickAdd
    context={quickAdd.context}
    clientX={quickAdd.clientX}
    clientY={quickAdd.clientY}
    on:created={onCreated}
    on:cancel={() => (quickAdd = null)}
    on:toast={(e) => dispatch('toast', e.detail)} />
{/if}

<style>
  .crumb-link{background:none;border:none;cursor:pointer;color:var(--text-muted);
    font-family:inherit;font-size:inherit;padding:0;letter-spacing:.04em}
  .crumb-link:hover{color:var(--gold-bright)}
  .map-layer{position:absolute;inset:0;display:flex;flex-direction:column}
  .map-toolbar .btns{display:flex;border:1px solid var(--border-color);border-radius:8px;overflow:hidden}
  .map-toolbar .btns button{background:#0d0d13ee;border:none;border-right:1px solid var(--border-color);
    color:var(--text-muted);min-height:36px;padding:0 10px;cursor:pointer;font-size:13px;font-family:inherit}
  .map-toolbar .btns button:last-child{border-right:none}
  .map-toolbar .btns button.on{background:var(--accent-gold);color:#1a1206}
  .map-toolbar .btns button:disabled{opacity:.35;cursor:default}
</style>
