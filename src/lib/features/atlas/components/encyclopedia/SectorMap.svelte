<script>
  // SectorMap — inside one sector. The POI layer.
  // Stage 1.5: B2 parchment field + masked outside + heavy boundary;
  // H4 markerVisibility gating (macro/micro, label modes, drafts);
  // A4 22px hit targets + white casing; D2 drag with point-in-fill constraint
  // and shift multi-select; C2 location placement.
  import { createEventDispatcher } from 'svelte'
  import { isAdmin } from '$lib/core/session.js'
  import { entities, discoveries, patchGeometry } from '../../lib/dataLayer.js'
  import {
    byId, childrenOf, allChildrenOf, displayLevel, explorationPct,
    effectiveLevel, tierClass, markerVisibility,
  } from '../../lib/domain.js'
  import { blobPath } from '../../lib/utils.js'
  import { iconFor, colourFor } from '../../lib/locationTypes.js'
  import { mapEditMode, drag, svgPoint, pushEdit } from '../../lib/mapEdit.js'

  export let focusId
  export let selectedId = null
  const dispatch = createEventDispatcher()

  let svgEl
  let fieldPath // the sector silhouette <path> element, for isPointInFill
  let placing = false
  let multi = new Set() // shift-selected ids for group drag

  const CX = 500, CY = 350, FR = 285 // sector field centre + radial fallback

  $: editing = $mapEditMode && $isAdmin
  $: sec = byId($entities, focusId)
  $: locs = sec ? ($isAdmin ? allChildrenOf($entities, sec.id) : childrenOf($entities, sec.id)) : []
  $: locs = locs.filter((e) => e.entity_type === 'location')
  $: pct = sec ? explorationPct($entities, $discoveries, sec.id) : null
  $: fieldD = blobPath(CX, CY, FR, sec ? (sec.blob_seed || sec.id) : 'x')

  const lvRaw = (id) => effectiveLevel($entities, $discoveries, id)
  const lvOf = (id) => tierClass(displayLevel($entities, $discoveries, id, $isAdmin))

  function vis(loc) {
    return markerVisibility(loc, 'micro', lvRaw(loc.id), $isAdmin)
  }

  function select(id, evt) {
    if (editing && evt && evt.shiftKey) {
      const n = new Set(multi)
      n.has(id) ? n.delete(id) : n.add(id)
      multi = n
      return
    }
    if (!editing) multi = new Set()
    dispatch('select', { id })
  }
  function keyActivate(evt, fn) {
    if (evt.key === 'Enter' || evt.key === ' ') {
      evt.preventDefault()
      fn()
    }
  }

  // constrain a point to inside the sector field (point-in-fill, radial fallback)
  function clampInside(x, y) {
    if (fieldPath && fieldPath.isPointInFill) {
      const pt = svgEl.createSVGPoint()
      pt.x = x; pt.y = y
      try {
        if (fieldPath.isPointInFill(pt)) return [x, y]
      } catch (_) { /* fall through to radial */ }
    }
    const dx = x - CX, dy = y - CY
    const dist = Math.hypot(dx, dy)
    if (dist <= FR) return [x, y]
    const k = FR / dist
    return [CX + dx * k, CY + dy * k]
  }

  // ----- C2: place a new location -----
  function stageClick(evt) {
    if (!placing || !sec) return
    const pt = svgPoint(svgEl, evt)
    const [x, y] = clampInside(pt.x, pt.y)
    placing = false
    dispatch('quickadd', {
      entityType: 'location',
      parentId: sec.id,
      level: 'sector',
      coord: { x: Math.round(x), y: Math.round(y) },
      clientX: evt.clientX,
      clientY: evt.clientY,
    })
  }

  // ----- D2: drag markers (group if multi-selected) -----
  function dragParamsFor(loc) {
    return {
      svg: () => svgEl,
      enabled: () => editing,
      getPos: () => {
        const cur = byId($entities, loc.id)
        return [cur.coord_x || CX, cur.coord_y || CY]
      },
      onStart: (e) => {
        if (!(e && e.shiftKey)) {
          if (!multi.has(loc.id)) multi = new Set()
          dispatch('select', { id: loc.id })
        }
      },
      onMove: (x, y, dx, dy) => {
        const group = multi.has(loc.id) && multi.size > 1 ? [...multi] : [loc.id]
        entities.update((list) =>
          list.map((e) => {
            if (!group.includes(e.id)) return e
            if (e.id === loc.id) {
              const [nx, ny] = clampInside(x, y)
              return { ...e, coord_x: nx, coord_y: ny }
            }
            // other group members move by the same delta, then clamp
            const [nx, ny] = clampInside((e.coord_x || CX) + dx, (e.coord_y || CY) + dy)
            return { ...e, coord_x: nx, coord_y: ny }
          }))
      },
      onEnd: async (x, y, moved) => {
        if (!moved) return
        const group = multi.has(loc.id) && multi.size > 1 ? [...multi] : [loc.id]
        for (const id of group) {
          const cur = byId($entities, id)
          const after = { coord_x: Math.round(cur.coord_x), coord_y: Math.round(cur.coord_y) }
          pushEdit({ id, before: {}, after })
          const res = await patchGeometry(id, after)
          if (res.error) { dispatch('toast', { msg: res.error, kind: 'error' }); break }
        }
        dispatch('toast', { msg: group.length > 1 ? `Moved ${group.length} markers` : `Moved “${loc.name}”` })
      },
    }
  }
</script>

<!-- svelte-ignore a11y-no-noninteractive-element-interactions a11y-click-events-have-key-events -->
<svg class="map" class:placing-cursor={placing} bind:this={svgEl}
  viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid meet"
  on:click={stageClick} role="img" aria-label={sec ? sec.name : 'Sector'}>
  {#if sec}
    <defs>
      <mask id="sector-cut">
        <rect x="0" y="0" width="1000" height="700" fill="white" />
        <path d={fieldD} fill="black" />
      </mask>
    </defs>
    <!-- darkened outside (everything except the field) -->
    <rect class="sector-outside" x="0" y="0" width="1000" height="700" mask="url(#sector-cut)" />
    <!-- parchment field + heavy boundary -->
    <path class="sector-field" d={fieldD} />
    <path class="sector-bound" d={fieldD} bind:this={fieldPath} />

    {#each locs as loc (loc.id)}
      {@const v = vis(loc)}
      {#if v}
        {@const lv = lvOf(loc.id)}
        {@const col = colourFor(loc.location_subtype)}
        <g
          class="poi {lv} label-{v.labelMode}"
          class:draft={v.draft}
          class:selected={selectedId === loc.id}
          class:multi={multi.has(loc.id)}
          class:editing
          transform="translate({loc.coord_x},{loc.coord_y})"
          style="color:{col}"
          role="button" tabindex="0"
          aria-label="{v.labelText}{loc.location_scale ? ', ' + loc.location_scale : ''}"
          on:click|stopPropagation={(e) => select(loc.id, e)}
          on:keydown={(e) => keyActivate(e, () => select(loc.id))}
          use:drag={dragParamsFor(loc)}
        >
          <circle class="poi-hit" r="22" />
          <circle class="poi-casing" r="13" />
          <circle class="poi-ring" r="13" />
          <g class="poi-glyph" fill={col} stroke="#0a0a0f" stroke-width="1">{@html iconFor(loc.location_subtype)}</g>
          <text class="poi-label" x="17" y="4">{v.labelText}</text>
          {#if $isAdmin && loc.location_scale}
            <text class="scale-tag" x="17" y="18" style="opacity:.7">{loc.location_scale}</text>
          {/if}
        </g>
      {/if}
    {/each}
  {/if}
</svg>

{#if $isAdmin}
  <button class="addhere" class:on={placing} title="New location here"
    on:click={() => (placing = !placing)} aria-pressed={placing}>+</button>
{/if}

{#if sec}
  <div class="placard">
    <div class="pt">{sec.name}</div>
    <div class="pd">{childrenOf($entities, sec.id).length} locations{pct !== null ? ` · ${pct}%` : ''}</div>
  </div>
  <div class="hint">
    {#if placing}
      Click inside the field to drop a new location.
    {:else if editing}
      Edit mode — drag markers (shift-click to group). Markers stay inside the boundary.
    {:else}
      {$isAdmin
        ? 'Sector map. Markers shown for every location. Use the panel to grant discovery.'
        : 'Each marker is a place you have at least heard of. Unknown places stay hidden.'}
    {/if}
  </div>
{/if}
