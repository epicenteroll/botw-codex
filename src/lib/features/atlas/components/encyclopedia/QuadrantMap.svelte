<script>
  // QuadrantMap — the sectors inside one quadrant.
  // Stage 1.5: H1 state-driven display radius with animated scale wrapper,
  // snap-to-grid, drag/scale editing, micro-density readout, admin/player
  // empty states, layered region markup.
  import { createEventDispatcher } from 'svelte'
  import { isAdmin } from '$lib/core/session.js'
  import { entities, discoveries, patchGeometry } from '../../lib/dataLayer.js'
  import {
    byId, childrenOf, allChildrenOf, displayLevel, effectiveLevel,
    explorationPct, tierClass, tierLabel, displayRadius, chartStatus,
  } from '../../lib/domain.js'
  import { blobPath } from '../../lib/utils.js'
  import {
    mapEditMode, snapToGrid, drag, svgPoint, snap, pushEdit, findOverlaps,
  } from '../../lib/mapEdit.js'

  export let focusId
  export let selectedId = null
  const dispatch = createEventDispatcher()

  let svgEl
  let placing = false
  let overlapIds = new Set()
  let overlapTimer

  $: editing = $mapEditMode && $isAdmin
  $: q = byId($entities, focusId)
  $: kids = (q
    ? ($isAdmin ? allChildrenOf($entities, q.id) : childrenOf($entities, q.id))
    : []
  ).filter((e) => e.entity_type === 'sector' && Array.isArray(e.blob_center))

  const seedOf = (e) => e.blob_seed || e.id
  // published micro children count, for the admin density readout
  const microCount = (sec) =>
    allChildrenOf($entities, sec.id).filter(
      (c) => c.entity_type === 'location' && (c.location_scale || 'micro') === 'micro'
    ).length

  function dispRadius(sec) {
    const eff = effectiveLevel($entities, $discoveries, sec.id)
    const populated = childrenOf($entities, sec.id).length > 0
    return displayRadius(sec, eff, populated, $isAdmin)
  }

  function enterSector(sec) {
    if (editing || placing) return
    dispatch('select', { id: sec.id })
    if (childrenOf($entities, sec.id).length || $isAdmin)
      dispatch('enter', { view: 'sector', id: sec.id })
  }
  function keyActivate(evt, fn) {
    if (evt.key === 'Enter' || evt.key === ' ') {
      evt.preventDefault()
      fn()
    }
  }

  // ----- C2: place a new sector -----
  function stageClick(evt) {
    if (!placing || !q) return
    const pt = svgPoint(svgEl, evt)
    placing = false
    dispatch('quickadd', {
      entityType: 'sector',
      parentId: q.id,
      level: 'quadrant',
      blobCenter: [Math.round(pt.x), Math.round(pt.y)],
      clientX: evt.clientX,
      clientY: evt.clientY,
    })
  }

  // ----- D2: drag + overlap -----
  function flagOverlaps(sec) {
    const sibs = kids.filter((s) => s.id !== sec.id)
    const hits = findOverlaps(sec, sibs)
    if (!hits.length) return
    overlapIds = new Set([sec.id, ...hits.map((h) => h.id)])
    clearTimeout(overlapTimer)
    overlapTimer = setTimeout(() => (overlapIds = new Set()), 3100)
    dispatch('toast', {
      msg: `${sec.name} overlaps ${hits[0].name} — allowed, but check the layout.`,
      kind: 'warn',
    })
  }
  function dragParamsFor(sec) {
    return {
      svg: () => svgEl,
      enabled: () => editing,
      getPos: () => {
        const cur = byId($entities, sec.id)
        return cur && cur.blob_center ? cur.blob_center : [0, 0]
      },
      onStart: () => dispatch('select', { id: sec.id }),
      onMove: (x, y) => {
        const on = $snapToGrid
        const nx = snap(x, on), ny = snap(y, on)
        entities.update((list) =>
          list.map((e) => (e.id === sec.id ? { ...e, blob_center: [nx, ny] } : e)))
      },
      onEnd: async (x, y, moved) => {
        if (!moved) return
        const on = $snapToGrid
        const before = { blob_center: sec.blob_center }
        const after = { blob_center: [snap(Math.round(x), on), snap(Math.round(y), on)] }
        pushEdit({ id: sec.id, before, after })
        const res = await patchGeometry(sec.id, after, before)
        if (res.error) dispatch('toast', { msg: res.error, kind: 'error' })
        else {
          dispatch('toast', { msg: `Moved “${sec.name}”` })
          flagOverlaps(byId($entities, sec.id))
        }
      },
    }
  }
  function scaleParamsFor(sec) {
    return {
      svg: () => svgEl,
      enabled: () => editing,
      getPos: () => {
        const cur = byId($entities, sec.id)
        const r = (cur && cur.blob_r) || 100
        const [cx, cy] = (cur && cur.blob_center) || [0, 0]
        return [cx + r * 0.71, cy + r * 0.71]
      },
      onMove: (x, y) => {
        const cur = byId($entities, sec.id)
        if (!cur) return
        const [cx, cy] = cur.blob_center
        const nr = Math.max(30, Math.min(300, Math.hypot(x - cx, y - cy)))
        entities.update((list) => list.map((e) => (e.id === sec.id ? { ...e, blob_r: nr } : e)))
      },
      onEnd: async (x, y, moved) => {
        if (!moved) return
        const cur = byId($entities, sec.id)
        const before = { blob_r: sec.blob_r }
        const after = { blob_r: Math.round(cur.blob_r) }
        pushEdit({ id: sec.id, before, after })
        const res = await patchGeometry(sec.id, after, before)
        if (res.error) dispatch('toast', { msg: res.error, kind: 'error' })
        else flagOverlaps(byId($entities, sec.id))
      },
    }
  }
</script>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions a11y-click-events-have-key-events -->
<svg class="map" class:placing-cursor={placing} bind:this={svgEl}
  viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid meet"
  on:click={stageClick} role="img" aria-label={q ? q.name : 'Quadrant'}>
  <defs>
    <pattern id="botw-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="8" stroke="#e8e3d6" stroke-width="1" opacity=".35" />
    </pattern>
  </defs>

  {#if kids.length === 0}
    <text x="500" y="338" class="region-label" text-anchor="middle" style="font-size:18px">
      {$isAdmin ? 'Uncharted' : 'None have mapped this land'}
    </text>
    <text x="500" y="366" class="region-sub" text-anchor="middle" style="font-size:14px;opacity:.85">
      {$isAdmin ? 'Click + to add the first sector.' : 'This quadrant has not yet been charted.'}
    </text>
  {:else}
    {#each kids as sec (sec.id)}
      {@const lv = tierClass(displayLevel($entities, $discoveries, sec.id, $isAdmin))}
      {@const eff = effectiveLevel($entities, $discoveries, sec.id)}
      {@const pct = explorationPct($entities, $discoveries, sec.id)}
      {@const r = dispRadius(sec)}
      {@const factor = r / (sec.blob_r || 100)}
      {@const cx = sec.blob_center[0]}
      {@const cy = sec.blob_center[1]}
      {@const d = blobPath(cx, cy, sec.blob_r, seedOf(sec))}
      {@const mc = $isAdmin ? microCount(sec) : 0}
      <g class="scale-wrap" style="transform:scale({factor});transform-origin:{cx}px {cy}px;transition:transform .45s cubic-bezier(.22,1,.36,1)">
        <g
          class="map-region {lv}"
          class:minor={factor < 1}
          class:selected={selectedId === sec.id}
          class:can-enter={(childrenOf($entities, sec.id).length > 0 || $isAdmin) && !editing}
          class:editing
          class:draft={$isAdmin && !sec.is_published}
          class:overlap-warn={overlapIds.has(sec.id)}
          role="button" tabindex="0"
          aria-label="{sec.name}, {tierLabel(sec, displayLevel($entities, $discoveries, sec.id, $isAdmin))}"
          on:click|stopPropagation={() => enterSector(sec)}
          on:keydown={(e) => keyActivate(e, () => enterSector(sec))}
          use:drag={dragParamsFor(sec)}
        >
          <path class="region-glow" d={d} />
          <path class="region-fill" d={d} />
          <path class="region-inner" d={d} />
          <path class="region-edge" d={d} />
          <path class="region-hatch" d={d} />
          <text x={cx} y={cy} class="region-label">{sec.name}</text>
          {#if factor >= 1}
            {#if pct !== null && (lv === 'visited' || lv === 'known')}
              <text x={cx} y={cy + 18} class="region-sub">
                {tierLabel(sec, eff)} {pct}%{#if mc} · {mc} micro{/if}
              </text>
            {:else if $isAdmin}
              <text x={cx} y={cy + 18} class="region-sub">
                {chartStatus(sec)}{#if mc} · {mc} micro{/if}
              </text>
            {/if}
          {/if}
        </g>
      </g>
      {#if editing && selectedId === sec.id}
        <circle class="edit-handle" r="9"
          cx={cx + sec.blob_r * 0.71 * factor} cy={cy + sec.blob_r * 0.71 * factor}
          use:drag={scaleParamsFor(sec)} role="slider" tabindex="0"
          aria-label="Resize {sec.name}" aria-valuenow={Math.round(sec.blob_r)} />
      {/if}
    {/each}
  {/if}
</svg>

{#if $isAdmin}
  <button class="addhere" class:on={placing} title="New sector here"
    on:click={() => (placing = !placing)} aria-pressed={placing}>+</button>
{/if}

{#if q}
  <div class="placard">
    <div class="pt">{q.name.split(' — ')[0]}</div>
    <div class="pd">{childrenOf($entities, q.id).length} sectors charted{q.id !== 'q2' ? ' · open country' : ''}</div>
  </div>
  <div class="hint">
    {#if placing}
      Click the map where the new sector should sit.
    {:else if editing}
      Edit mode — drag sectors; gold handle resizes. {$snapToGrid ? 'Snapping to grid.' : ''}
    {:else}
      {kids.length ? 'Sectors of ' + q.name + '. Click a charted sector to enter.' : ''}
    {/if}
  </div>
{/if}
