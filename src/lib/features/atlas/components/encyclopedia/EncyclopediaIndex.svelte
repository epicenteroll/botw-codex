<script>
  // EncyclopediaIndex.svelte — searchable/filterable text list (Phase 4 + G3).
  // Adds: sort control (name/type/discovery), result count, admin-only drafts
  // filter, parent path line on cards, cards as <button> for a11y.
  import { createEventDispatcher } from 'svelte'
  import { isAdmin } from '$lib/core/session.js'
  import { entities, discoveries } from '../../lib/dataLayer.js'
  import {
    effectiveLevel, rawLevel, tierClass, tierLabel, pathFor, ENTITY_TYPE_NAMES,
  } from '../../lib/domain.js'
  import { TYPE_MAP } from '../../lib/locationTypes.js'

  const dispatch = createEventDispatcher()
  let q = ''
  let ft = ''
  let fd = ''
  let sort = 'name' // 'name' | 'type' | 'discovery'
  let draftsOnly = false

  const TYPE_GROUPS = [
    { label: 'Place', types: ['continent', 'quadrant', 'sector', 'location', 'corridor', 'waypoint'] },
    { label: 'Figure / Faction', types: ['people', 'faction', 'role'] },
    { label: 'Item', types: ['item'] },
  ]
  const TIER_RANK = { known: 3, visited: 2, heard_of: 1 }

  $: visible = $entities
    .filter((e) => {
      if (draftsOnly && $isAdmin) {
        if (e.is_published) return false
      } else if (!e.is_published) return false
      if (!$isAdmin && !rawLevel($discoveries, e.id)) return false
      if (ft && e.entity_type !== ft) return false
      const lv = effectiveLevel($entities, $discoveries, e.id)
      if (fd === 'undiscovered' && lv) return false
      if (fd && fd !== 'undiscovered' && lv !== fd) return false
      if (q) {
        const hay = (e.name + ' ' + (e.common_knowledge || '') + ' ' + (e.rumour || '') + ' ' + (e.tags || []).join(' ')).toLowerCase()
        if (!hay.includes(q.trim().toLowerCase())) return false
      }
      return true
    })
    .slice()
    .sort((a, b) => {
      if (sort === 'type') return a.entity_type.localeCompare(b.entity_type) || a.name.localeCompare(b.name)
      if (sort === 'discovery') {
        const la = TIER_RANK[effectiveLevel($entities, $discoveries, a.id)] || 0
        const lb = TIER_RANK[effectiveLevel($entities, $discoveries, b.id)] || 0
        return lb - la || a.name.localeCompare(b.name)
      }
      return a.name.localeCompare(b.name)
    })

  const lvFor = (id) => ($isAdmin ? effectiveLevel($entities, $discoveries, id) || 'known' : effectiveLevel($entities, $discoveries, id) || 'unknown')
</script>

<div class="index">
  <div class="index-controls">
    <input placeholder="Search names and lore…" bind:value={q} />
    <select bind:value={ft}>
      <option value="">Any type</option>
      {#each TYPE_GROUPS as g}
        <optgroup label={g.label}>
          {#each g.types as ty}<option value={ty}>{ENTITY_TYPE_NAMES[ty]}</option>{/each}
        </optgroup>
      {/each}
    </select>
    <select bind:value={fd}>
      <option value="">Any discovery</option>
      <option value="known">Known</option>
      <option value="visited">Visited / Met</option>
      <option value="heard_of">Heard Of</option>
      <option value="undiscovered">Undiscovered</option>
    </select>
    <select bind:value={sort} title="Sort by">
      <option value="name">Sort: Name</option>
      <option value="type">Sort: Type</option>
      <option value="discovery">Sort: Discovery</option>
    </select>
    {#if $isAdmin}
      <label class="drafts-toggle"><input type="checkbox" bind:checked={draftsOnly} /> Drafts only</label>
    {/if}
  </div>

  <div class="index-count">{visible.length} {visible.length === 1 ? 'entry' : 'entries'}</div>

  <div class="index-list">
    {#if visible.length === 0}
      <div style="color:#55555f;font-style:italic;padding:20px">Nothing matches — or nothing here has been discovered yet.</div>
    {:else}
      {#each visible as e (e.id)}
        {@const t = e.location_subtype ? TYPE_MAP[e.location_subtype] : null}
        {@const lv = lvFor(e.id)}
        {@const desc = (e.common_knowledge || e.rumour || '').slice(0, 160)}
        {@const path = e.parent_id ? pathFor($entities, e.parent_id) : ''}
        <button class="card" on:click={() => dispatch('go', e.id)}>
          {#if path}<div class="cpath">{path}</div>{/if}
          <div class="ct">
            {#if t}<span class="swatch" style="background:{t.marker_colour}"></span>{/if}
            <span class="cn">{e.name}{e.is_published ? '' : ' · draft'}</span>
          </div>
          <div class="cd">{desc}</div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:9px">
            <span class="ctype">{ENTITY_TYPE_NAMES[e.entity_type]}</span>
            <span class="pill {tierClass(lv)}">{tierLabel(e, lv)}</span>
          </div>
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  .card { display: block; width: 100%; text-align: left; font-family: inherit; cursor: pointer; }
  .drafts-toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); white-space: nowrap; }
  .pill.draft { background: #2a2230; color: #b79bd6; }
</style>
