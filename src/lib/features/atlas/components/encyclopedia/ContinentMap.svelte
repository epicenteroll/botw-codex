<script>
  // ContinentMap — the six quadrants of the Impure Fracta.
  // Stage 1.5: layered region markup (B1/B2), a11y activation (G4),
  // admin "+ Add here" placement (C2), drag-to-move + scale handle (D2),
  // soft overlap warning (D2), draft rendering (C3).
  import { createEventDispatcher } from 'svelte'
  import { isAdmin } from '$lib/core/session.js'
  import { entities, discoveries, patchGeometry } from '../../lib/dataLayer.js'
  import {
    byId, childrenOf, allChildrenOf, displayLevel, tierClass, tierLabel,
  } from '../../lib/domain.js'
  import { blobPath } from '../../lib/utils.js'
  import { mapEditMode, drag, svgPoint, pushEdit, findOverlaps } from '../../lib/mapEdit.js'

  export let selectedId = null
  const dispatch = createEventDispatcher()

  let svgEl
  let placing = false
  let overlapIds = new Set()
  let overlapTimer

  $: editing = $mapEditMode && $isAdmin
  $: quads = ($isAdmin ? allChildrenOf($entities, 'impure-fracta') : childrenOf($entities, 'impure-fracta'))
    .filter((e) => e.entity_type === 'quadrant' && Array.isArray(e.blob_center))
  $: ahr = byId($entities, 'ancient-holy-road')
  $: ahrLv = ahr ? tierClass(displayLevel($entities, $discoveries, 'ancient-holy-road', $isAdmin)) : 'unknown'

  const AHR_D = 'M500,60 C 505,160 470,250 560,330 C 650,410 660,500 615,560 C 595,620 600,650 612,668'
  const lvOf = (id) => tierClass(displayLevel($entities, $discoveries, id, $isAdmin))
  const seedOf = (e) => e.blob_seed || e.id

  function enterQuad(q) {
    if (editing || placing) return
    dispatch('select', { id: q.id })
    if (childrenOf($entities, q.id).length || $isAdmin)
      dispatch('enter', { view: 'quadrant', id: q.id })
  }
  function keyActivate(evt, fn) {
    if (evt.key === 'Enter' || evt.key === ' ') {
      evt.preventDefault()
      fn()
    }
  }
  function enterAHR() {
    if (editing || placing) return
    dispatch('select', { id: 'ancient-holy-road' })
    dispatch('enter', { view: 'corridor', id: 'ancient-holy-road' })
  }

  // ----- C2: click-to-place a new quadrant -----
  function stageClick(evt) {
    if (!placing) return
    const pt = svgPoint(svgEl, evt)
    placing = false
    dispatch('quickadd', {
      entityType: 'quadrant',
      parentId: 'impure-fracta',
      level: 'continent',
      blobCenter: [Math.round(pt.x), Math.round(pt.y)],
      clientX: evt.clientX,
      clientY: evt.clientY,
    })
  }

  // ----- D2: drag + overlap pulse -----
  function flagOverlaps(q) {
    const sibs = quads.filter((s) => s.id !== q.id)
    const hits = findOverlaps(q, sibs)
    if (!hits.length) return
    overlapIds = new Set([q.id, ...hits.map((h) => h.id)])
    clearTimeout(overlapTimer)
    overlapTimer = setTimeout(() => (overlapIds = new Set()), 3100)
    dispatch('toast', {
      msg: `${q.name.split(' — ')[0]} overlaps ${hits[0].name.split(' — ')[0]} — allowed, but check the layout.`,
      kind: 'warn',
    })
  }
  function dragParamsFor(q) {
    return {
      svg: () => svgEl,
      enabled: () => editing,
      getPos: () => {
        const cur = byId($entities, q.id)
        return cur && cur.blob_center ? cur.blob_center : [0, 0]
      },
      onStart: () => dispatch('select', { id: q.id }),
      onMove: (x, y) => {
        entities.update((list) =>
          list.map((e) => (e.id === q.id ? { ...e, blob_center: [x, y] } : e)))
      },
      onEnd: async (x, y, moved) => {
        if (!moved) return
        const before = { blob_center: q.blob_center }
        const after = { blob_center: [Math.round(x), Math.round(y)] }
        pushEdit({ id: q.id, before, after })
        const res = await patchGeometry(q.id, after, before)
        if (res.error) dispatch('toast', { msg: res.error, kind: 'error' })
        else {
          dispatch('toast', { msg: `Moved “${q.name.split(' — ')[0]}”` })
          flagOverlaps(byId($entities, q.id))
        }
      },
    }
  }
  // corner handle scales blob_r (selected entity only)
  function scaleParamsFor(q) {
    return {
      svg: () => svgEl,
      enabled: () => editing,
      getPos: () => {
        const cur = byId($entities, q.id)
        const r = (cur && cur.blob_r) || 100
        const [cx, cy] = (cur && cur.blob_center) || [0, 0]
        return [cx + r * 0.71, cy + r * 0.71]
      },
      onMove: (x, y) => {
        const cur = byId($entities, q.id)
        if (!cur) return
        const [cx, cy] = cur.blob_center
        const nr = Math.max(30, Math.min(300, Math.hypot(x - cx, y - cy)))
        entities.update((list) => list.map((e) => (e.id === q.id ? { ...e, blob_r: nr } : e)))
      },
      onEnd: async (x, y, moved) => {
        if (!moved) return
        const cur = byId($entities, q.id)
        const before = { blob_r: q.blob_r }
        const after = { blob_r: Math.round(cur.blob_r) }
        pushEdit({ id: q.id, before, after })
        const res = await patchGeometry(q.id, after, before)
        if (res.error) dispatch('toast', { msg: res.error, kind: 'error' })
        else flagOverlaps(byId($entities, q.id))
      },
    }
  }
</script>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions a11y-click-events-have-key-events -->
<svg class="map" class:placing-cursor={placing} bind:this={svgEl}
  viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid meet"
  on:click={stageClick} role="img" aria-label="Map of the Impure Fracta">
  <defs>
    <pattern id="botw-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="8" stroke="#e8e3d6" stroke-width="1" opacity=".35" />
    </pattern>
  </defs>

  <!-- water bodies -->
  <rect x="0" y="0" width="1000" height="70" class="water" />
  <rect x="0" y="0" width="60" height="700" class="water deep" />
  <rect x="940" y="0" width="60" height="700" class="water deep" />
  <text x="430" y="40" class="water-label">The Salt Sea</text>
  <text x="8" y="360" class="water-label" transform="rotate(-90 8 360)">The Western Sea</text>
  <text x="992" y="360" class="water-label" transform="rotate(90 992 360)">The Eastern Strait</text>
  <path class="landbridge" d="M70,150 C 110,120 150,140 190,170" />

  <!-- quadrants -->
  {#each quads as q (q.id)}
    {@const lv = lvOf(q.id)}
    {@const d = blobPath(q.blob_center[0], q.blob_center[1], q.blob_r, seedOf(q))}
    {@const canEnter = childrenOf($entities, q.id).length > 0 || $isAdmin}
    <g
      class="map-region {lv}"
      class:selected={selectedId === q.id}
      class:can-enter={canEnter && !editing}
      class:editing
      class:draft={$isAdmin && !q.is_published}
      class:overlap-warn={overlapIds.has(q.id)}
      role="button" tabindex="0"
      aria-label="{q.name.split(' — ')[0]}, {tierLabel(q, displayLevel($entities, $discoveries, q.id, $isAdmin))}"
      on:click|stopPropagation={() => enterQuad(q)}
      on:keydown={(e) => keyActivate(e, () => enterQuad(q))}
      use:drag={dragParamsFor(q)}
    >
      <path class="region-glow" d={d} />
      <path class="region-fill" d={d} />
      <path class="region-inner" d={d} />
      <path class="region-edge" d={d} />
      <path class="region-hatch" d={d} />
      <text x={q.blob_center[0]} y={q.blob_center[1] - 4} class="region-label">{q.name.split(' — ')[0]}</text>
      <text x={q.blob_center[0]} y={q.blob_center[1] + 16} class="region-sub">{q.sector_count} sectors</text>
    </g>
    {#if editing && selectedId === q.id}
      <circle class="edit-handle" r="9"
        cx={q.blob_center[0] + q.blob_r * 0.71} cy={q.blob_center[1] + q.blob_r * 0.71}
        use:drag={scaleParamsFor(q)} role="slider" tabindex="0"
        aria-label="Resize {q.name.split(' — ')[0]}" aria-valuenow={Math.round(q.blob_r)} />
    {/if}
  {/each}

  <!-- Wall of the SoA -->
  <path class="wall" d="M120,672 L300,668 M340,670 L520,666 M560,668 L760,664 M800,666 L900,668" />
  <text x="392" y="692" class="wall-label">THE WALL OF THE SoA</text>

  <!-- Ancient Holy Road ribbon (drawn last) -->
  {#if ahrLv !== 'unknown'}
    <path class="ahr-path {ahrLv === 'known' ? 'glow' : ''}" d={AHR_D} />
    <path class="ahr-hit" d={AHR_D} on:click|stopPropagation={enterAHR}
      on:keydown={(e) => keyActivate(e, enterAHR)}
      role="button" tabindex="0" aria-label="The Ancient Holy Road" />
    {#each [[500, 60], [560, 330], [612, 665]] as p}
      <circle class="ahr-node {ahrLv}" cx={p[0]} cy={p[1]} r="5" />
    {/each}
    <text x="520" y="120" class="wall-label" transform="rotate(8 520 120)" style="opacity:.8">ANCIENT HOLY ROAD</text>
  {/if}
</svg>

{#if $isAdmin}
  <button class="addhere" class:on={placing} title="New quadrant here"
    on:click={() => (placing = !placing)} aria-pressed={placing}>+</button>
{/if}

<div class="placard">
  <div class="pt">The Impure Fracta</div>
  <div class="pd">Six quadrants · the Ancient Holy Road · the Wall of the SoA</div>
</div>
<div class="hint">
  {#if placing}
    Click the map where the new quadrant should sit.
  {:else if editing}
    Edit mode — drag a quadrant to move it; drag the gold handle to resize. Positions save on release.
  {:else}
    {$isAdmin
      ? 'Admin view — all regions lit. Click a quadrant to enter, or the gold Road to walk it.'
      : 'Muted regions are only Heard Of. Click a region you have Visited to enter.'}
  {/if}
</div>
