<script>
  // AdminImport.svelte — the GM's "upload a session" panel (Phase C). Admin-only.
  //
  // Flow: pick the world-patch JSON Claude produced from your raw notes → it's
  // parsed and diffed against the world already loaded (buildPlan) → you see a
  // per-entity preview (create / merge / unchanged, with the fields touched) →
  // Apply upserts via the existing dataLayer (idempotent deterministic ids,
  // drafts only) → an Undo restores the exact prior state of this batch.
  //
  // Nothing here writes outside world_encyclopedia / deep_lore_entries, nothing
  // is published (is_published stays false), and writes are admin-gated by RLS.
  import { get } from 'svelte/store'
  import { entities, deepLore, upsertEntity, upsertDeep, deleteEntity, deleteDeep } from '../../lib/dataLayer.js'
  import { parseWorldPatch, buildPlan, PATCH_FORMAT } from '../../lib/importWorld.js'
  import { pushToast } from '$lib/core/toast.js'

  let fileName = ''
  let parseError = ''
  let plan = null // result of buildPlan
  let applying = false
  let applied = null // { created, merged, deep }
  let lastBatch = null // { beforeEnt:Map, createdEntIds:Set, beforeDeep:Map, createdDeepIds:Set }

  async function onFile(ev) {
    reset()
    const f = ev.target.files && ev.target.files[0]
    if (!f) return
    fileName = f.name
    let text
    try { text = await f.text() } catch (e) { parseError = 'Could not read the file.'; return }
    const parsed = parseWorldPatch(text)
    if (parsed.error) { parseError = parsed.error; return }
    plan = buildPlan(parsed.patch, get(entities))
  }

  function reset() {
    parseError = ''
    plan = null
    applied = null
    // keep lastBatch so Undo survives loading a new file? no — clear on new file
    lastBatch = null
  }

  function changeSummary(changes) {
    if (!changes.length) return '—'
    return changes
      .map((c) => (c.field === 'type' || c.field === 'parent'
        ? `${c.field}: ${c.to}`
        : c.kind === 'append' ? `+${c.field}` : c.kind === 'change' ? `${c.field} ✎` : c.field))
      .join(', ')
  }

  async function apply() {
    if (!plan || applying) return
    applying = true
    const cur = get(entities)
    const curById = new Map(cur.map((e) => [e.id, e]))
    const curDeep = new Map(get(deepLore).map((d) => [d.id, d]))

    const beforeEnt = new Map()
    const createdEntIds = new Set()
    const beforeDeep = new Map()
    const createdDeepIds = new Set()
    let okEnt = 0, okDeep = 0, failed = 0

    for (const e of plan.entities) {
      if (curById.has(e.id)) beforeEnt.set(e.id, { ...curById.get(e.id) })
      else createdEntIds.add(e.id)
      const res = await upsertEntity(e)
      if (res && res.error) { failed++; pushToast({ msg: `“${e.name}”: ${res.error}`, kind: 'error' }) }
      else okEnt++
    }
    for (const d of plan.deep) {
      if (curDeep.has(d.id)) beforeDeep.set(d.id, { ...curDeep.get(d.id) })
      else createdDeepIds.add(d.id)
      await upsertDeep(d)
      okDeep++
    }

    lastBatch = { beforeEnt, createdEntIds, beforeDeep, createdDeepIds }
    applied = { created: createdEntIds.size, merged: okEnt - createdEntIds.size, deep: okDeep, failed }
    applying = false
    pushToast({
      msg: `Imported ${okEnt} entr${okEnt === 1 ? 'y' : 'ies'} as drafts${okDeep ? ` + ${okDeep} deep-lore` : ''}.${failed ? ` ${failed} failed.` : ''}`,
      kind: failed ? 'warn' : 'info',
    })
  }

  async function undo() {
    if (!lastBatch || applying) return
    applying = true
    for (const id of lastBatch.createdDeepIds) await deleteDeep(id)
    for (const [, row] of lastBatch.beforeDeep) await upsertDeep(row)
    for (const id of lastBatch.createdEntIds) await deleteEntity(id)
    for (const [, row] of lastBatch.beforeEnt) await upsertEntity(row)
    applying = false
    pushToast({ msg: 'Import reverted to its prior state.', kind: 'info' })
    lastBatch = null
    applied = null
  }
</script>

<section class="imp">
  <div class="head">
    <span class="title">Import a session <span class="hint">(GM · drafts only)</span></span>
    <label class="file">
      <input type="file" accept=".json,application/json" on:change={onFile} />
      Choose world-patch file…
    </label>
  </div>

  <p class="blurb">
    Upload the <code>.json</code> Claude builds from your raw notes (format
    <code>{PATCH_FORMAT}</code>). Entries arrive as unpublished drafts, merge with
    what already exists (no duplicates), and link up automatically. You publish and
    place them on the map afterwards.
  </p>

  {#if fileName}<div class="fname">📄 {fileName}</div>{/if}
  {#if parseError}<div class="err">{parseError}</div>{/if}

  {#if plan}
    {#if plan.errors.length}
      <div class="err"><b>{plan.errors.length} problem(s) — these entries are skipped:</b>
        <ul>{#each plan.errors as e}<li>{e}</li>{/each}</ul>
      </div>
    {/if}
    {#if plan.warnings.length}
      <div class="warn"><ul>{#each plan.warnings as w}<li>{w}</li>{/each}</ul></div>
    {/if}

    <div class="counts">
      <span class="c-new">{plan.counts.create} new</span>
      <span class="c-merge">{plan.counts.merge} merge</span>
      <span class="c-same">{plan.counts.unchanged} unchanged</span>
      {#if plan.deep.length}<span class="c-deep">{plan.deep.length} deep-lore</span>{/if}
    </div>

    <div class="rows">
      {#each plan.plan as r (r.slug)}
        <div class="row a-{r.action}">
          <span class="badge">{r.action}</span>
          <span class="nm">{r.name}</span>
          <span class="ty">{r.type}</span>
          <span class="ch">{changeSummary(r.changes)}</span>
        </div>
      {/each}
    </div>

    {#if !applied}
      <div class="actions">
        <button class="apply" disabled={applying || (plan.counts.create + plan.counts.merge === 0)} on:click={apply}>
          {applying ? 'Applying…' : `Apply ${plan.counts.create + plan.counts.merge} change(s)`}
        </button>
      </div>
    {:else}
      <div class="done">
        Applied: {applied.created} created, {applied.merged} merged{applied.deep ? `, ${applied.deep} deep-lore` : ''}{applied.failed ? `, ${applied.failed} failed` : ''}.
        <button class="undo" disabled={applying || !lastBatch} on:click={undo}>Undo this import</button>
      </div>
    {/if}
  {/if}
</section>

<style>
  .imp { background: var(--panel, #14141a); border: 1px solid var(--border, #2a2a32);
    border-left: 5px solid var(--gold, #d4af37); border-radius: 6px; padding: 14px; margin-bottom: 16px;
    font-family: var(--font-ui, system-ui); color: var(--text, #e8e3d6); }
  .head { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; }
  .title { font-family: var(--font-display, serif); font-size: 16px; }
  .title .hint { font-size: 11px; color: var(--text-muted, #8d8d99); font-family: var(--font-ui, system-ui); }
  .file { position: relative; overflow: hidden; background: var(--gold, #d4af37); color: #1a1407; font-weight: 700;
    font-size: 12px; padding: 7px 12px; border-radius: 4px; cursor: pointer; }
  .file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }
  .blurb { font-size: 12px; color: var(--text-muted, #8d8d99); line-height: 1.5; margin: 10px 0; }
  .blurb code { background: rgba(255,255,255,.07); padding: 1px 5px; border-radius: 3px; font-size: 11px; }
  .fname { font-size: 12px; color: var(--text, #e8e3d6); margin-bottom: 8px; }
  .err { background: rgba(192,31,47,.12); color: #ff9a9a; border: 1px solid #5b1620; border-radius: 4px;
    padding: 8px 10px; font-size: 12px; margin: 8px 0; }
  .err ul, .warn ul { margin: 6px 0 0; padding-left: 18px; }
  .warn { background: rgba(212,175,55,.1); color: #e6c34d; border: 1px solid #5a4a16; border-radius: 4px;
    padding: 8px 10px; font-size: 12px; margin: 8px 0; }

  .counts { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0; font-size: 11px; font-weight: 700; }
  .counts span { padding: 3px 9px; border-radius: 10px; }
  .c-new { background: rgba(134,239,172,.13); color: #86efac; }
  .c-merge { background: rgba(56,189,248,.13); color: #38bdf8; }
  .c-same { background: rgba(255,255,255,.05); color: #8d8d99; }
  .c-deep { background: rgba(212,175,55,.13); color: #e6c34d; }

  .rows { display: flex; flex-direction: column; max-height: 320px; overflow: auto;
    border: 1px solid var(--border, #2a2a32); border-radius: 5px; }
  .row { display: grid; grid-template-columns: 78px 1fr 92px 1.4fr; gap: 8px; align-items: center;
    padding: 7px 10px; font-size: 12px; border-bottom: 1px solid rgba(255,255,255,.04); }
  .row:last-child { border-bottom: 0; }
  .badge { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px;
    text-align: center; padding: 2px 0; border-radius: 4px; }
  .a-create .badge { background: rgba(134,239,172,.16); color: #86efac; }
  .a-merge .badge { background: rgba(56,189,248,.16); color: #38bdf8; }
  .a-unchanged .badge { background: rgba(255,255,255,.05); color: #8d8d99; }
  .a-unchanged { opacity: .6; }
  .nm { font-weight: 700; }
  .ty { color: var(--text-muted, #8d8d99); font-family: var(--font-data, monospace); font-size: 11px; }
  .ch { color: var(--text-muted, #8d8d99); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .actions, .done { margin-top: 12px; display: flex; gap: 10px; align-items: center; font-size: 12px; }
  .apply { background: #14532d; color: #86efac; border: 0; border-radius: 4px; padding: 8px 16px;
    font-weight: 700; font-size: 13px; cursor: pointer; }
  .apply:disabled { opacity: .5; cursor: default; }
  .apply:not(:disabled):hover { filter: brightness(1.15); }
  .done { color: #86efac; }
  .undo { background: #4a1212; color: #ff8888; border: 0; border-radius: 4px; padding: 6px 12px;
    font-weight: 700; cursor: pointer; font-size: 12px; }
  .undo:disabled { opacity: .5; }
</style>
