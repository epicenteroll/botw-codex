<script>
  // LoreField.svelte — a lore <textarea> wrapped with the linking toolbar (E1)
  // and a collapsed live preview (E2).
  //
  // - Selecting text shows a 🔗 button; it opens LinkPicker and replaces the
  //   selection with [[selected text|entity-id]] via setRangeText().
  // - Typing `[[` triggers the same picker inline (autocomplete on name).
  // - The preview renders through renderLore() so the admin sees exactly what
  //   players will see, including which links will appear gated.
  import { createEventDispatcher } from 'svelte'
  import { entities, discoveries } from '../../lib/dataLayer.js'
  import { renderLore } from '../../lib/domain.js'
  import LinkPicker from './LinkPicker.svelte'

  export let label = ''
  export let value = ''
  export let rows = 3
  export let variant = '' // '' | 'gm' | 'admin'

  const dispatch = createEventDispatcher()

  let ta
  let showToolbar = false
  let toolbarX = 0
  let toolbarY = 0
  let picker = null // { mode:'selection'|'inline', start, end, query, x, y }
  let showPreview = false

  function emit() {
    dispatch('input', value)
  }

  function onSelect() {
    if (!ta) return
    const { selectionStart: s, selectionEnd: e } = ta
    if (e > s) {
      const rect = ta.getBoundingClientRect()
      toolbarX = rect.left + 8
      toolbarY = rect.top - 4
      showToolbar = true
    } else showToolbar = false
  }
  function openSelectionPicker() {
    const { selectionStart: s, selectionEnd: e } = ta
    if (e <= s) return
    const rect = ta.getBoundingClientRect()
    picker = { mode: 'selection', start: s, end: e, query: value.slice(s, e), x: rect.left + 10, y: rect.top + 26 }
    showToolbar = false
  }
  function onInput(e) {
    value = e.target.value
    emit()
    // `[[` inline trigger
    const pos = ta.selectionStart
    if (pos >= 2 && value.slice(pos - 2, pos) === '[[') {
      const rect = ta.getBoundingClientRect()
      picker = { mode: 'inline', start: pos - 2, end: pos, query: '', x: rect.left + 10, y: rect.top + 26 }
    }
  }
  function onPick(ev) {
    const ent = ev.detail
    if (!picker) return
    const label_ = picker.mode === 'selection' && picker.query.trim() ? picker.query : ent.name
    const insert = `[[${label_}|${ent.id}]]`
    ta.focus()
    ta.setSelectionRange(picker.start, picker.end)
    ta.setRangeText(insert, picker.start, picker.end, 'end')
    value = ta.value
    emit()
    picker = null
  }
  function onKey(e) {
    if (e.key === 'Escape') {
      showToolbar = false
      picker = null
    }
  }
</script>

<div class="lf">
  <div class="lf-head">
    <span class="lf-label {variant}">{label}</span>
    <button class="lf-prev" type="button" on:click={() => (showPreview = !showPreview)} aria-expanded={showPreview}>
      {showPreview ? '▾ preview' : '▸ preview'}
    </button>
  </div>
  <textarea
    bind:this={ta}
    {rows}
    value={value}
    class={variant}
    on:input={onInput}
    on:select={onSelect}
    on:keyup={onSelect}
    on:mouseup={onSelect}
    on:keydown={onKey}
    on:blur={() => setTimeout(() => (showToolbar = false), 200)}
  ></textarea>
  {#if showPreview}
    <div class="lf-preview">
      {#if (value || '').trim()}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        <p>{@html renderLore(value, $entities, $discoveries, true)}</p>
      {:else}
        <p class="lf-empty">— empty —</p>
      {/if}
    </div>
  {/if}
</div>

{#if showToolbar}
  <div class="lf-toolbar" style="left:{toolbarX}px;top:{toolbarY}px">
    <button type="button" title="Link the selection to an entry" on:mousedown|preventDefault={openSelectionPicker}>🔗 Link</button>
  </div>
{/if}

{#if picker}
  <LinkPicker initialQuery={picker.query} anchorX={picker.x} anchorY={picker.y} on:pick={onPick} on:cancel={() => (picker = null)} />
{/if}

<style>
  .lf { display: block; width: 100%; margin-bottom: 10px; }
  .lf-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 4px; }
  .lf-label { font-size: 12px; color: var(--text-muted); letter-spacing: .04em; }
  .lf-label.gm { color: #6fae8b; }
  .lf-label.admin { color: #c98b5a; }
  .lf-prev { background: none; border: none; color: #6e6e7a; font-size: 11.5px; padding: 2px 4px; letter-spacing: .05em; }
  .lf-prev:hover { color: var(--gold-bright); }
  textarea {
    width: 100%; background: #0d0d13; border: 1px solid var(--border-color); color: var(--text-main);
    border-radius: 7px; padding: 8px; font-family: inherit; font-size: 14px; resize: vertical; line-height: 1.5;
  }
  textarea.gm { border-color: #294a38; }
  textarea.admin { border-color: #4a3a29; }
  .lf-preview {
    border: 1px dashed #2a2a36; border-radius: 7px; background: #0e0e15;
    padding: 9px 11px; margin-top: 5px;
  }
  .lf-preview p { margin: 0; font-size: 14.5px; line-height: 1.55; color: #d7dbe2; }
  .lf-empty { color: #4f4f59; font-style: italic; }
  .lf-toolbar {
    position: fixed; z-index: 55; background: #1d1d28; border: 1px solid #3a3a48; border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, .5); transform: translateY(-100%);
  }
  .lf-toolbar button { background: none; border: none; color: var(--gold-bright); padding: 7px 11px; font-size: 13px; }
</style>
