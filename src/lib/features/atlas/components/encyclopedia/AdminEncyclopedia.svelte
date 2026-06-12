<script>
  // AdminEncyclopedia.svelte — the admin write panel (Section 16 + Stage 1.5).
  // C1 parent picker (valid-parents, inline path) · C3 type presets, Duplicate,
  // child list, save validation · E1 LoreField linking · E2 backlinks readout ·
  // H2 chart_status field · sticky action bar · narrow (mobile) layout.
  import { createEventDispatcher } from 'svelte'
  import { isNarrow } from '../../lib/viewport.js'
  import {
    entities, deepLore, upsertEntity, deleteEntity, upsertDeep, deleteDeep,
  } from '../../lib/dataLayer.js'
  import {
    deepFor, ENTITY_TYPE_NAMES, validParentsFor, pathFor, validateEntity,
    allChildrenOf, backlinksFor, slugify, chartStatus,
  } from '../../lib/domain.js'
  import { TYPES_BY_CATEGORY, TYPE_MAP } from '../../lib/locationTypes.js'
  import LoreField from './LoreField.svelte'

  export let openId = null // set by QuickAdd's "Open full editor"
  const dispatch = createEventDispatcher()

  let filterType = ''
  let editingId = null
  let draft = null

  const ENTITY_TYPES = Object.keys(ENTITY_TYPE_NAMES)

  // react to an externally-requested edit target (from QuickAdd)
  $: if (openId && openId !== editingId) {
    const e = $entities.find((x) => x.id === openId)
    if (e) edit(e)
    openId = null
  }

  $: list = $entities
    .filter((e) => !filterType || e.entity_type === filterType)
    .slice()
    .sort((a, b) => a.entity_type.localeCompare(b.entity_type) || a.name.localeCompare(b.name))

  // C1 — valid parents for the draft's current type
  $: parentOptions = draft ? validParentsFor($entities, draft.entity_type) : []
  $: parentPath = draft && draft.parent_id ? pathFor($entities, draft.parent_id) : ''
  // C3 — child list when editing a region
  $: childList = draft ? allChildrenOf($entities, draft.id) : []
  // E2 — backlinks
  $: backlinks = draft ? backlinksFor($entities, $deepLore, draft.id) : []

  // C3 — type presets
  function presetFor(type) {
    const base = { location_subtype: '', location_scale: 'micro', map_layer: null, blob_center: null, blob_r: null, sector_count: null, chart_status: null }
    if (type === 'location') return { ...base, map_layer: 'sector', coord_x: 500, coord_y: 350 }
    if (type === 'sector') return { ...base, blob_center: [500, 350], blob_r: 120, chart_status: 'uncharted' }
    if (type === 'quadrant') return { ...base, blob_center: [500, 350], blob_r: 100, sector_count: 0 }
    if (type === 'waypoint') return { ...base, sequence_index: 1 }
    return base
  }
  function onTypeChange() {
    if (!draft) return
    draft = { ...draft, ...presetFor(draft.entity_type) }
    // drop a now-invalid parent
    const valid = validParentsFor($entities, draft.entity_type).map((p) => p.id)
    if (draft.parent_id && !valid.includes(draft.parent_id)) draft.parent_id = null
  }

  function edit(e) {
    editingId = e.id
    draft = { ...e, tags: (e.tags || []).join(', ') }
  }
  function newEntry() {
    const id = 'new-' + Math.random().toString(36).slice(2, 8)
    draft = {
      id, entity_type: 'location', name: 'New Entry', parent_id: null,
      rumour: '', common_knowledge: '', uncommon_knowledge: '', rare_knowledge: '',
      gm_lore: '', admin_notes: '',
      location_subtype: '', location_scale: 'micro', map_layer: 'sector',
      coord_x: 500, coord_y: 350, tags: '', is_published: true,
    }
    editingId = id
  }
  // C3 — Duplicate: copy lore, blank name/coords, fresh id
  function duplicate() {
    if (!draft) return
    const id = 'new-' + Math.random().toString(36).slice(2, 8)
    draft = {
      ...draft, id, name: '', coord_x: 500, coord_y: 350,
      blob_center: draft.blob_center ? [500, 350] : draft.blob_center,
      is_published: false,
    }
    editingId = id
    dispatch('toast', 'Duplicated — give it a name and place it.')
  }

  function save() {
    const norm = {
      ...draft,
      name: (draft.name || '').trim(),
      tags: draft.tags ? draft.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    }
    // give brand-new entries a real slug id from the name
    if (norm.id.startsWith('new-') && norm.name) norm.id = slugify(norm.name, $entities)

    const { errors, warnings } = validateEntity(norm, $entities)
    if (errors.length) {
      dispatch('toast', { msg: errors[0], kind: 'error' })
      return
    }
    upsertEntity(norm)
    warnings.forEach((w) => dispatch('toast', { msg: w, kind: 'warn' }))
    editingId = norm.id
    draft = { ...norm, tags: norm.tags.join(', ') }
    dispatch('toast', 'Saved “' + norm.name + '”')
  }
  function remove() {
    if (!draft) return
    deleteEntity(draft.id)
    dispatch('toast', 'Deleted “' + draft.name + '”')
    draft = null
    editingId = null
  }

  $: dls = draft ? deepFor($deepLore, draft.id) : []
  function addDeep() {
    upsertDeep({
      id: 'dl-' + Math.random().toString(36).slice(2, 8),
      entity_id: draft.id, origin_faction: 'New Faction', origin_entity_id: null,
      lore_text: '', access_note: '', sort_order: dls.length + 1, is_published: true,
    })
  }
  const isRegion = (t) => t === 'sector' || t === 'quadrant' || t === 'continent'
</script>

<div class="admin-wrap" class:narrow={$isNarrow}>
  <div class="admin-list">
    <div class="al-head">
      <button class="btn" on:click={newEntry}>+ New entry</button>
      <select bind:value={filterType}>
        <option value="">All types</option>
        {#each ENTITY_TYPES as ty}<option value={ty}>{ENTITY_TYPE_NAMES[ty]}</option>{/each}
      </select>
    </div>
    {#if $isNarrow}
      <select class="al-picker" bind:value={editingId} on:change={() => { const e = $entities.find((x) => x.id === editingId); if (e) edit(e) }}>
        <option value={null} disabled>— pick an entry —</option>
        {#each list as e (e.id)}
          <option value={e.id}>{e.name} · {ENTITY_TYPE_NAMES[e.entity_type]}{e.is_published ? '' : ' (draft)'}</option>
        {/each}
      </select>
    {:else}
      <div class="al-scroll">
        {#each list as e (e.id)}
          <button class="al-item" class:on={editingId === e.id} on:click={() => edit(e)}>
            <span class="al-name">{e.name}</span>
            <span class="al-type">{ENTITY_TYPE_NAMES[e.entity_type]}{e.is_published ? '' : ' · draft'}</span>
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="admin-edit">
    {#if !draft}
      <div class="ae-empty">Select an entry to edit, or create a new one.</div>
    {:else}
      <div class="ae-row">
        <label>Name<input bind:value={draft.name} /></label>
        <label>Type
          <select bind:value={draft.entity_type} on:change={onTypeChange}>
            {#each ENTITY_TYPES as ty}<option value={ty}>{ENTITY_TYPE_NAMES[ty]}</option>{/each}
          </select>
        </label>
      </div>

      <!-- C1: parent picker -->
      <div class="ae-row">
        <label>Parent
          {#if parentOptions.length}
            <select bind:value={draft.parent_id}>
              <option value={null}>— none —</option>
              {#each parentOptions as p (p.id)}
                <option value={p.id}>{p.name} ({ENTITY_TYPE_NAMES[p.entity_type]})</option>
              {/each}
            </select>
          {:else}
            <input value="— this type has no parent —" disabled />
          {/if}
        </label>
        <label class="pub"><input type="checkbox" bind:checked={draft.is_published} /> Published</label>
      </div>
      {#if parentPath}<div class="ae-path">{parentPath}</div>{/if}

      {#if draft.entity_type === 'sector'}
        <div class="ae-row">
          <label>Chart status (world canon)
            <select bind:value={draft.chart_status}>
              <option value="uncharted">uncharted</option>
              <option value="charted">charted</option>
            </select>
          </label>
          <label>Default radius<input type="number" bind:value={draft.blob_r} /></label>
        </div>
      {/if}
      {#if draft.entity_type === 'quadrant'}
        <div class="ae-row">
          <label>Sector count<input type="number" bind:value={draft.sector_count} /></label>
          <label>Default radius<input type="number" bind:value={draft.blob_r} /></label>
        </div>
      {/if}

      {#if draft.entity_type === 'location' || draft.entity_type === 'waypoint'}
        <div class="ae-row">
          <label>Location type
            <select bind:value={draft.location_subtype}>
              <option value="">— none —</option>
              {#each Object.entries(TYPES_BY_CATEGORY) as [cat, types]}
                <optgroup label={cat}>
                  {#each types as t}<option value={t.id}>{t.display_name}</option>{/each}
                </optgroup>
              {/each}
            </select>
          </label>
          {#if draft.entity_type === 'location'}
            <label>Scale
              <select bind:value={draft.location_scale}>
                <option value="macro">macro</option>
                <option value="micro">micro</option>
              </select>
            </label>
          {/if}
          {#if draft.location_subtype && TYPE_MAP[draft.location_subtype]}
            <span class="swatch-lg" style="background:{TYPE_MAP[draft.location_subtype].marker_colour}" title={TYPE_MAP[draft.location_subtype].display_name}></span>
          {/if}
        </div>
        <div class="ae-row">
          {#if draft.entity_type === 'location'}
            <label>coord_x<input type="number" bind:value={draft.coord_x} /></label>
            <label>coord_y<input type="number" bind:value={draft.coord_y} /></label>
          {:else}
            <label>Sequence index<input type="number" bind:value={draft.sequence_index} /></label>
          {/if}
        </div>
      {/if}

      <!-- E1: lore fields with linking + preview -->
      <LoreField label="Rumour" rows={2} bind:value={draft.rumour} />
      <LoreField label="Common Knowledge" rows={3} bind:value={draft.common_knowledge} />
      <LoreField label="Uncommon Knowledge" rows={3} bind:value={draft.uncommon_knowledge} />
      <LoreField label="Rare Knowledge" rows={3} bind:value={draft.rare_knowledge} />
      <LoreField label="GM Lore" rows={2} variant="gm" bind:value={draft.gm_lore} />
      <LoreField label="Admin Notes" rows={2} variant="admin" bind:value={draft.admin_notes} />
      <label class="ae-area">Tags (comma-separated)<input bind:value={draft.tags} placeholder="location:dust-gullets, faction:karrath" /></label>

      <!-- C3: child list -->
      {#if isRegion(draft.entity_type) && childList.length}
        <div class="child-list">
          <div class="cl-head">Inside this {ENTITY_TYPE_NAMES[draft.entity_type]}</div>
          {#each childList as c (c.id)}
            <button class="cl-item" on:click={() => edit(c)}>
              <span>{c.name}</span>
              <span class="cl-type">{ENTITY_TYPE_NAMES[c.entity_type]}{c.is_published ? '' : ' · draft'}</span>
            </button>
          {/each}
        </div>
      {/if}

      <!-- deep lore editor -->
      <div class="deep-editor">
        <div class="de-head">Deep Lore <button class="btn" on:click={addDeep}>+ Add entry</button></div>
        {#each dls as d (d.id)}
          <div class="de-block">
            <div class="ae-row">
              <label>Origin faction<input value={d.origin_faction} on:input={(ev) => upsertDeep({ ...d, origin_faction: ev.target.value })} /></label>
              <label class="pub"><input type="checkbox" checked={d.is_published} on:change={(ev) => upsertDeep({ ...d, is_published: ev.target.checked })} /> Pub</label>
              <button class="btn btn-danger" on:click={() => deleteDeep(d.id)}>✕</button>
            </div>
            <label class="ae-area">Lore text<textarea rows="3" value={d.lore_text} on:input={(ev) => upsertDeep({ ...d, lore_text: ev.target.value })}></textarea></label>
            <label class="ae-area">Access note<input value={d.access_note} on:input={(ev) => upsertDeep({ ...d, access_note: ev.target.value })} /></label>
          </div>
        {/each}
      </div>

      {#if backlinks.length}
        <div class="backlinks">
          <div class="bh">Referenced by</div>
          {#each backlinks as b}
            <button class="bl" on:click={() => edit(b)}>{b.name}</button>{#if b !== backlinks[backlinks.length - 1]}, {/if}
          {/each}
        </div>
      {/if}

      <div class="ae-actions">
        <button class="btn btn-primary" on:click={save}>Save entry</button>
        <button class="btn" on:click={duplicate}>Duplicate</button>
        <button class="btn" on:click={() => dispatch('go', draft.id)}>Open in Atlas →</button>
        <button class="btn btn-danger" on:click={remove}>Delete</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .admin-wrap { display: flex; gap: 16px; flex: 1; min-height: 0; }
  .admin-wrap.narrow { flex-direction: column; }
  .admin-list { flex: 0 0 240px; display: flex; flex-direction: column; min-height: 0; border: 1px solid var(--border-color); border-radius: 12px; background: #0d0d13; }
  .admin-wrap.narrow .admin-list { flex: 0 0 auto; }
  .al-head { display: flex; gap: 6px; padding: 10px; border-bottom: 1px solid var(--border-color); }
  .al-head select, .al-picker { flex: 1; background: #0d0d13; border: 1px solid var(--border-color); color: var(--text-main); border-radius: 7px; padding: 5px; font-family: inherit; }
  .al-picker { margin: 8px; }
  .al-scroll { overflow-y: auto; padding: 6px; }
  .al-item { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; width: 100%; text-align: left; background: transparent; border: 1px solid transparent; border-radius: 8px; padding: 7px 9px; color: var(--text-main); }
  .al-item:hover { background: #14141b; }
  .al-item.on { background: #1a1422; border-color: #3d2d4a; }
  .al-name { font-family: 'Cinzel'; font-size: 14px; }
  .al-type { font-size: 11px; color: var(--text-muted); letter-spacing: .08em; text-transform: uppercase; }
  .admin-edit { flex: 1; overflow-y: auto; padding-right: 6px; display: flex; flex-direction: column; }
  .ae-empty { color: #55555f; font-style: italic; padding: 30px; }
  .ae-row { display: flex; gap: 10px; align-items: flex-end; margin-bottom: 10px; flex-wrap: wrap; }
  .admin-edit :global(label) { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-muted); letter-spacing: .04em; flex: 1; min-width: 120px; }
  .admin-edit :global(input), .admin-edit :global(textarea), .admin-edit :global(select) { background: #0d0d13; border: 1px solid var(--border-color); color: var(--text-main); border-radius: 7px; padding: 8px; font-family: inherit; font-size: 14px; }
  .admin-edit :global(textarea) { resize: vertical; line-height: 1.5; }
  .ae-area { display: block; width: 100%; margin-bottom: 10px; }
  .ae-path { font-size: 12px; color: #8d8d99; margin: -4px 0 12px; letter-spacing: .03em; }
  .pub { flex: 0 0 auto !important; flex-direction: row !important; align-items: center; gap: 7px; }
  .swatch-lg { width: 22px; height: 22px; border-radius: 5px; border: 1px solid #000; align-self: center; }
  .child-list { border: 1px solid #1f2a24; border-radius: 10px; padding: 10px; margin-bottom: 14px; background: #0c1310; }
  .cl-head { font-family: 'Cinzel'; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; color: #6e9e84; margin-bottom: 8px; }
  .cl-item { display: flex; justify-content: space-between; width: 100%; background: transparent; border: none; color: var(--text-main); padding: 5px 6px; border-radius: 6px; text-align: left; font-size: 13px; }
  .cl-item:hover { background: #14201a; }
  .cl-type { font-size: 11px; color: var(--text-muted); }
  .deep-editor { border: 1px solid #2a2230; border-radius: 10px; padding: 12px; margin-bottom: 16px; background: #100c16; }
  .de-head { display: flex; justify-content: space-between; align-items: center; font-family: 'Cinzel'; color: #b79bd6; letter-spacing: .1em; text-transform: uppercase; font-size: 12px; margin-bottom: 10px; }
  .de-block { border-top: 1px dashed #2a2230; padding-top: 10px; margin-top: 8px; }
  .bl { background: none; border: none; color: #cdb46a; cursor: pointer; font-family: inherit; font-size: 13px; padding: 0; text-decoration: underline dotted; }
  .ae-actions { display: flex; gap: 10px; flex-wrap: wrap; position: sticky; bottom: 0; padding: 12px 0 calc(14px + var(--safe-bottom)); margin-top: auto; background: linear-gradient(transparent, var(--bg-main) 30%); }
</style>
