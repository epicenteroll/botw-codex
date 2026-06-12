<script>
  // CorridorMap — the Ancient Holy Road, a linear waypoint chain.
  // Stage 1.5: A4 22px hit targets; D2 drag along the rail with automatic
  // sequence_index reordering when waypoints cross; C2 "new waypoint" placement.
  import { createEventDispatcher } from 'svelte'
  import { isAdmin } from '$lib/core/session.js'
  import { entities, discoveries, patchGeometry } from '../../lib/dataLayer.js'
  import { byId, childrenOf, allChildrenOf, displayLevel, tierClass } from '../../lib/domain.js'
  import { iconFor, colourFor } from '../../lib/locationTypes.js'
  import { mapEditMode, drag, svgPoint, pushEdit } from '../../lib/mapEdit.js'

  export let focusId
  export let selectedId = null
  const dispatch = createEventDispatcher()

  const X0 = 160, X1 = 840, Y = 350

  let svgEl
  let placing = false

  $: editing = $mapEditMode && $isAdmin
  $: cor = byId($entities, focusId)
  $: wps = (cor
    ? ($isAdmin ? allChildrenOf($entities, cor.id) : childrenOf($entities, cor.id))
    : []
  ).filter((e) => e.entity_type === 'waypoint')
    .slice()
    .sort((a, b) => a.sequence_index - b.sequence_index)
  $: n = wps.length
  $: lvOf = (id) => tierClass(displayLevel($entities, $discoveries, id, $isAdmin))
  $: lastFound = wps.reduce((acc, w, i) => (lvOf(w.id) !== 'unknown' ? i : acc), -1)
  $: progX = lastFound >= 0 ? X0 + (X1 - X0) * (n > 1 ? lastFound / (n - 1) : 0) : null

  const xAt = (i) => X0 + (X1 - X0) * (n > 1 ? i / (n - 1) : 0.5)
  // map an x coordinate back to a fractional index along the rail
  const idxAtX = (x) => {
    const t = Math.max(0, Math.min(1, (x - X0) / (X1 - X0)))
    return t * (n > 1 ? n - 1 : 0)
  }

  function select(id) {
    if (placing) return
    dispatch('select', { id })
  }
  function keyActivate(evt, fn) {
    if (evt.key === 'Enter' || evt.key === ' ') {
      evt.preventDefault()
      fn()
    }
  }

  // ----- C2: new waypoint after #n -----
  function stageClick(evt) {
    if (!placing || !cor) return
    const pt = svgPoint(svgEl, evt)
    const frac = idxAtX(pt.x)
    const afterSeq = Math.round(frac) // insert near this position
    placing = false
    dispatch('quickadd', {
      entityType: 'waypoint',
      parentId: cor.id,
      level: 'corridor',
      sequenceIndex: afterSeq + 1,
      clientX: evt.clientX,
      clientY: evt.clientY,
    })
  }

  // ----- D2: drag a waypoint along the rail, reorder sequence on crossing -----
  function dragParamsFor(w, i) {
    return {
      svg: () => svgEl,
      enabled: () => editing,
      getPos: () => [xAt(wps.findIndex((x) => x.id === w.id)), Y],
      onStart: () => dispatch('select', { id: w.id }),
      onMove: (x) => {
        // live reorder: recompute order by projected x, rewrite sequence_index
        const order = wps
          .map((p) => ({ id: p.id, x: p.id === w.id ? x : xAt(wps.findIndex((z) => z.id === p.id)) }))
          .sort((a, b) => a.x - b.x)
        entities.update((list) =>
          list.map((e) => {
            const pos = order.findIndex((o) => o.id === e.id)
            return pos >= 0 ? { ...e, sequence_index: pos + 1 } : e
          }))
      },
      onEnd: async (x, y, moved) => {
        if (!moved) return
        // persist any waypoints whose sequence_index changed
        const changed = wps.filter((p) => {
          const cur = byId($entities, p.id)
          return cur && cur.sequence_index !== p.sequence_index
        })
        // include the dragged one regardless
        const ids = new Set([w.id, ...changed.map((c) => c.id)])
        for (const id of ids) {
          const cur = byId($entities, id)
          const after = { sequence_index: cur.sequence_index }
          pushEdit({ id, before: {}, after })
          const res = await patchGeometry(id, after)
          if (res.error) { dispatch('toast', { msg: res.error, kind: 'error' }); return }
        }
        dispatch('toast', { msg: `Reordered “${byId($entities, w.id).name}”` })
      },
    }
  }
</script>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions a11y-click-events-have-key-events -->
<svg class="map" class:placing-cursor={placing} bind:this={svgEl}
  viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid meet"
  on:click={stageClick} role="img" aria-label={cor ? cor.name : 'Corridor'}>
  {#if cor}
    <line x1={X0} y1={Y} x2={X1} y2={Y} class="corridor-rail" />
    {#if progX !== null}
      <line x1={X0} y1={Y} x2={progX} y2={Y} class="corridor-prog" />
    {/if}
    <text x={X0 - 12} y={Y + 5} class="wall-label" text-anchor="end">N</text>
    <text x={X1 + 12} y={Y + 5} class="wall-label">S · the Wall</text>
    {#each wps as w, i (w.id)}
      {@const lv = lvOf(w.id)}
      {@const up = i % 2 === 0}
      {@const col = colourFor(w.location_subtype || 'waypoint')}
      {@const anon = lv === 'unknown' && !$isAdmin}
      <g class="wp {lv}"
        class:selected={selectedId === w.id}
        class:editing
        class:draft={$isAdmin && !w.is_published}
        transform="translate({xAt(i)},{Y})"
        role="button" tabindex="0"
        aria-label="{anon ? 'Unknown waypoint' : w.name}, stop {w.sequence_index}"
        on:click|stopPropagation={() => (anon ? null : select(w.id))}
        on:keydown={(e) => keyActivate(e, () => (anon ? null : select(w.id)))}
        use:drag={dragParamsFor(w, i)}
      >
        <circle class="wp-hit" r="22" />
        <circle class="wp-circ" r="13" />
        <g fill={col} transform="scale(.8)">{@html iconFor(w.location_subtype || 'waypoint')}</g>
        <text class="wp-name" y={up ? -26 : 40}>{anon ? '???' : w.name}</text>
        <text class="wp-seq" y={up ? -44 : 56}>Stop {w.sequence_index}</text>
      </g>
    {/each}
  {/if}
</svg>

{#if $isAdmin}
  <button class="addhere" class:on={placing} title="New waypoint"
    on:click={() => (placing = !placing)} aria-pressed={placing}>+</button>
{/if}

{#if cor}
  <div class="placard">
    <div class="pt">{cor.name}</div>
    <div class="pd">North → South · {n} known stops · a month of wagon travel</div>
  </div>
  <div class="hint">
    {#if placing}
      Click along the road to insert a new waypoint.
    {:else if editing}
      Edit mode — drag a waypoint along the road; stops renumber automatically.
    {:else}
      The Ancient Holy Road — a linear journey, waypoint to waypoint, north to south.
    {/if}
  </div>
{/if}
