<script>
  // AdminQuickAdd.svelte — the compact create popover behind "+ Add here" (C2).
  //
  // The flow: + → click the spot → this popover (name, type, scale, Create) →
  // entity created with correct parent_id, map_layer, and coordinates
  // pre-filled → toast with "Open full editor →". The full editor remains for
  // lore; QuickAdd is for POPULATING FAST.
  //
  // H3: micro locations are offered only when the parent sector is charted —
  // an uncharted sector offers only macro, with a hint line.
  import { createEventDispatcher, onMount } from 'svelte'
  import { entities, upsertEntity } from '../../lib/dataLayer.js'
  import { byId, chartStatus, slugify, ENTITY_TYPE_NAMES } from '../../lib/domain.js'
  import { TYPES_BY_CATEGORY } from '../../lib/locationTypes.js'

  /** context = { entityType, parentId, level, coord:{x,y} | blobCenter:[x,y], sequenceIndex } */
  export let context
  export let clientX = 0
  export let clientY = 0

  const dispatch = createEventDispatcher()

  let name = ''
  let subtype = ''
  let scale = 'macro'
  let sectorCount = 7
  let nameEl
  let popEl

  $: parent = byId($entities, context.parentId)
  $: isLocation = context.entityType === 'location'
  $: parentCharted = parent && parent.entity_type === 'sector' && chartStatus(parent) === 'charted'
  $: microAllowed = isLocation && parentCharted
  $: if (isLocation && !microAllowed && scale === 'micro') scale = 'macro'

  // keep the popover on-screen
  let left = 0
  let top = 0
  onMount(() => {
    const w = popEl ? popEl.offsetWidth : 320
    const h = popEl ? popEl.offsetHeight : 280
    left = Math.min(Math.max(8, clientX - 20), window.innerWidth - w - 8)
    top = Math.min(Math.max(8, clientY - 10), window.innerHeight - h - 8)
    if (nameEl) nameEl.focus()
  })

  function buildEntity() {
    const id = slugify(name, $entities)
    const base = {
      id,
      entity_type: context.entityType,
      name: name.trim(),
      parent_id: context.parentId || null,
      rumour: '', common_knowledge: '', uncommon_knowledge: '', rare_knowledge: '',
      gm_lore: '', admin_notes: '',
      tags: [], is_published: true,
    }
    if (context.entityType === 'quadrant') {
      return { ...base, map_layer: 'continent', blob_center: [...context.blobCenter], blob_r: 100, blob_seed: id, sector_count: Number(sectorCount) || 7 }
    }
    if (context.entityType === 'sector') {
      // C3 preset: sectors get a default blob_r of 120; new sectors start uncharted (H2)
      return { ...base, map_layer: 'quadrant', blob_center: [...context.blobCenter], blob_r: 120, blob_seed: id, chart_status: 'uncharted' }
    }
    if (context.entityType === 'waypoint') {
      return { ...base, map_layer: 'corridor', location_subtype: subtype || 'waypoint', sequence_index: context.sequenceIndex }
    }
    // location
    return {
      ...base,
      map_layer: 'sector',
      location_subtype: subtype || '',
      location_scale: scale,
      coord_x: Math.round(context.coord.x),
      coord_y: Math.round(context.coord.y),
    }
  }

  async function create(openEditor) {
    if (!name.trim()) {
      nameEl && nameEl.focus()
      return
    }
    const e = buildEntity()
    const res = await upsertEntity(e)
    if (res && res.error) {
      dispatch('toast', { msg: res.error, kind: 'error' })
      return
    }
    dispatch('created', { entity: e, openEditor })
  }
  function key(e) {
    if (e.key === 'Escape') dispatch('cancel')
    if (e.key === 'Enter' && e.target === nameEl) create(false)
  }
</script>

<!-- svelte-ignore a11y-no-static-element-interactions a11y-no-noninteractive-element-interactions -->
<div class="qa-pop" bind:this={popEl} style="left:{left}px;top:{top}px" on:keydown={key} role="dialog" aria-label="Quick add entry">
  <div class="qh">
    New {ENTITY_TYPE_NAMES[context.entityType] || context.entityType}
    {#if parent}<span style="color:#8d8d99;text-transform:none;letter-spacing:0"> · in {parent.name.split(' — ')[0]}</span>{/if}
  </div>

  <label>
    Name
    <input bind:this={nameEl} bind:value={name} placeholder="Name it…" />
  </label>

  {#if isLocation || context.entityType === 'waypoint'}
    <label>
      Type
      <select bind:value={subtype}>
        <option value="">— pick a type —</option>
        {#each Object.entries(TYPES_BY_CATEGORY) as [cat, types]}
          <optgroup label={cat}>
            {#each types as t}<option value={t.id}>{t.display_name}</option>{/each}
          </optgroup>
        {/each}
      </select>
    </label>
  {/if}

  {#if isLocation}
    <label>
      Scale
      <select bind:value={scale}>
        <option value="macro">macro — visible at overview</option>
        {#if microAllowed}<option value="micro">micro — sector detail</option>{/if}
      </select>
    </label>
    {#if !microAllowed}
      <div class="qa-note">Mark this sector charted to place micro locations.</div>
    {/if}
  {/if}

  {#if context.entityType === 'quadrant'}
    <label>Sector count<input type="number" min="5" max="11" bind:value={sectorCount} /></label>
  {/if}
  {#if context.entityType === 'waypoint'}
    <div class="qa-note">Will be inserted as stop #{context.sequenceIndex}.</div>
  {/if}

  <div class="qa-actions">
    <button class="ghost" on:click={() => dispatch('cancel')}>Cancel</button>
    <button class="ghost" on:click={() => create(true)}>Create &amp; edit →</button>
    <button class="btn-primary" on:click={() => create(false)}>Create</button>
  </div>
</div>
