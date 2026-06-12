<script>
  // LinkPicker.svelte — searchable popover of entities for [[Label|id]]
  // authoring (E1). Shows name, type pill, and parent path; Enter inserts the
  // highlighted result; Escape cancels.
  import { createEventDispatcher, onMount } from 'svelte'
  import { entities } from '../../lib/dataLayer.js'
  import { ENTITY_TYPE_NAMES, pathFor } from '../../lib/domain.js'

  export let initialQuery = ''
  export let anchorX = 0
  export let anchorY = 0

  const dispatch = createEventDispatcher()
  let q = initialQuery
  let hi = 0
  let inputEl
  let popEl
  let left = 0
  let top = 0

  $: results = $entities
    .filter((e) => e.is_published)
    .filter((e) => !q.trim() || e.name.toLowerCase().includes(q.trim().toLowerCase()) || e.id.includes(q.trim().toLowerCase()))
    .slice(0, 8)
  $: if (hi >= results.length) hi = Math.max(0, results.length - 1)

  onMount(() => {
    const w = popEl ? popEl.offsetWidth : 300
    const h = popEl ? popEl.offsetHeight : 280
    left = Math.min(Math.max(8, anchorX), window.innerWidth - w - 8)
    top = Math.min(Math.max(8, anchorY), window.innerHeight - h - 8)
    inputEl && inputEl.focus()
  })

  function pick(e) {
    dispatch('pick', e)
  }
  function key(e) {
    if (e.key === 'Escape') dispatch('cancel')
    else if (e.key === 'ArrowDown') {
      hi = Math.min(hi + 1, results.length - 1)
      e.preventDefault()
    } else if (e.key === 'ArrowUp') {
      hi = Math.max(hi - 1, 0)
      e.preventDefault()
    } else if (e.key === 'Enter') {
      if (results[hi]) pick(results[hi])
      e.preventDefault()
    }
  }
</script>

<div class="lp-pop" bind:this={popEl} style="left:{left}px;top:{top}px" role="dialog" aria-label="Link an entry">
  <input
    bind:this={inputEl}
    bind:value={q}
    on:keydown={key}
    placeholder="Search entries to link…"
    aria-label="Search entries"
  />
  <div class="lp-list" role="listbox">
    {#if !results.length}
      <div class="lp-none">No published entry matches.</div>
    {/if}
    {#each results as e, i (e.id)}
      <button class="lp-item" class:hi={i === hi} role="option" aria-selected={i === hi} on:mouseenter={() => (hi = i)} on:click={() => pick(e)}>
        <span class="lp-name">{e.name}</span>
        <span class="lp-meta">
          <span class="lp-type">{ENTITY_TYPE_NAMES[e.entity_type]}</span>
          {#if e.parent_id}<span class="lp-path">{pathFor($entities, e.parent_id)}</span>{/if}
        </span>
      </button>
    {/each}
  </div>
</div>

<style>
  .lp-pop {
    position: fixed; z-index: 60; width: min(320px, 92vw);
    background: #14141d; border: 1px solid #3a3a48; border-radius: 12px; padding: 9px;
    box-shadow: 0 14px 40px rgba(0, 0, 0, .6);
  }
  .lp-pop input {
    width: 100%; background: #0d0d13; border: 1px solid var(--border-color); color: var(--text-main);
    border-radius: 7px; padding: 9px; font-family: inherit; font-size: 14px;
  }
  .lp-list { margin-top: 7px; max-height: 240px; overflow-y: auto; }
  .lp-none { color: #6e6e7a; font-style: italic; font-size: 13px; padding: 9px; }
  .lp-item {
    display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left;
    background: none; border: none; border-radius: 7px; padding: 7px 9px; color: var(--text-main);
  }
  .lp-item.hi { background: #1d1d28; }
  .lp-name { font-family: 'Cinzel'; font-size: 13.5px; }
  .lp-meta { display: flex; gap: 8px; align-items: baseline; }
  .lp-type { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #b79bd6; }
  .lp-path { font-size: 11px; color: #6e6e7a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
