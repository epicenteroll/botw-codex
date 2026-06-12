<script>
  // PanelSheet.svelte — the ≤880px replacement for the desktop <aside> (A2).
  //
  // The LocationPanel used to be DELETED on mobile (`aside{display:none}` was
  // the only responsive rule). It is now a draggable bottom sheet with three
  // states: collapsed 64px "peek" bar, half (~55%), full (~92%). Tapping a
  // marker slides the peek bar up (Encyclopedia bumps `state` on selection).
  // Inside, .panel-scroll keeps its own overflow with overscroll-behavior:
  // contain so sheet-drag and content-scroll don't fight.
  //
  // F2: a left-edge swipe on the sheet dispatches 'back'.
  import { createEventDispatcher, onMount } from 'svelte'

  export let state = 'collapsed' // 'collapsed' | 'half' | 'full'
  export let title = ''
  export let tier = '' // tier css class
  export let tierText = ''

  const dispatch = createEventDispatcher()

  const PEEK = 64
  let vh = typeof window !== 'undefined' ? window.innerHeight : 700
  let dragging = false
  let dragStartY = 0
  let dragStartH = 0
  let liveH = null // px while dragging

  $: targetH = state === 'full' ? vh * 0.92 : state === 'half' ? vh * 0.55 : PEEK
  $: height = dragging && liveH != null ? liveH : targetH

  function onResize() {
    vh = window.innerHeight
  }
  onMount(() => {
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  })

  function down(e) {
    dragging = true
    dragStartY = e.clientY
    dragStartH = height
    liveH = height
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function move(e) {
    if (!dragging) return
    liveH = Math.min(vh * 0.95, Math.max(PEEK, dragStartH + (dragStartY - e.clientY)))
  }
  function up() {
    if (!dragging) return
    dragging = false
    const h = liveH
    liveH = null
    // snap to the nearest state
    const stops = [
      ['collapsed', PEEK],
      ['half', vh * 0.55],
      ['full', vh * 0.92],
    ]
    let best = stops[0]
    for (const s of stops) if (Math.abs(s[1] - h) < Math.abs(best[1] - h)) best = s
    state = best[0]
  }
  function cycle() {
    state = state === 'collapsed' ? 'half' : state === 'half' ? 'full' : 'collapsed'
  }
  function keyHandle(e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      cycle()
    }
    if (e.key === 'ArrowUp') state = state === 'collapsed' ? 'half' : 'full'
    if (e.key === 'ArrowDown') state = state === 'full' ? 'half' : 'collapsed'
    if (e.key === 'Escape') state = 'collapsed'
  }

  // F2 — left-edge swipe-back on the sheet body
  let edgeStart = null
  function bodyTouchStart(e) {
    const t = e.touches && e.touches[0]
    if (t && t.clientX < 26) edgeStart = { x: t.clientX, y: t.clientY }
    else edgeStart = null
  }
  function bodyTouchEnd(e) {
    if (!edgeStart) return
    const t = e.changedTouches && e.changedTouches[0]
    if (t && t.clientX - edgeStart.x > 70 && Math.abs(t.clientY - edgeStart.y) < 60) dispatch('back')
    edgeStart = null
  }
</script>

<div
  class="sheet"
  class:dragging
  style="height:{height}px; padding-bottom: env(safe-area-inset-bottom, 0px)"
  role="dialog"
  aria-label="Entry details"
>
  <div
    class="sheet-handle"
    role="button"
    tabindex="0"
    aria-label="Expand or collapse the details panel"
    on:pointerdown={down}
    on:pointermove={move}
    on:pointerup={up}
    on:pointercancel={up}
    on:click={cycle}
    on:keydown={keyHandle}
  >
    <div class="sheet-grip"></div>
    <div class="sheet-head">
      {#if title}
        <span class="sh-name">{title}</span>
        {#if tierText}<span class="tier {tier}">{tierText}</span>{/if}
      {:else}
        <span class="sh-empty">Tap a marker to read what is known of it</span>
      {/if}
      {#if state !== 'collapsed'}
        <button class="sheet-close" aria-label="Collapse panel" on:click|stopPropagation={() => (state = 'collapsed')}>✕</button>
      {/if}
    </div>
  </div>
  {#if state !== 'collapsed'}
    <div class="sheet-body" on:touchstart={bodyTouchStart} on:touchend={bodyTouchEnd}>
      <slot />
    </div>
  {/if}
</div>
