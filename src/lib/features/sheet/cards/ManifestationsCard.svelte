<script>
  // Manifestations & Disciplines. Tabs filter by discipline. Each model rolls
  // differently: Blood-of-the-World / Pharmakia spend a BoW value and accrue
  // Taint by success count; Magia spends Glyphs + Ash; Intervention spends a
  // Favor Token and raises the Veil. Containment d100 ≤ 60 and Will d20 ≤ WIL
  // are the shared gates.
  import { getSheetCtx } from './context.js'
  const { sheet, actions } = getSheetCtx()

  let filter = 'all'
  let newDiscName = ''
  let newDiscModel = 'custom'
  let showNewDisc = false

  const BOW_STEPS = [20, 40, 60, 80, 100, 120]
  $: discById = Object.fromEntries($sheet.disciplines.map((d) => [d.id, d]))
  $: shown = $sheet.manifestations
    .map((m, i) => ({ m, i }))
    .filter((x) => filter === 'all' || x.m.disc === filter)
  function addDisc() {
    const n = newDiscName.trim(); if (!n) return
    actions.addDiscipline(n, newDiscModel); newDiscName = ''; newDiscModel = 'custom'; showNewDisc = false
  }
</script>

<div class="card wide">
  <div class="card-title">Manifestations &amp; Disciplines <small>abilities, spells, rites — grouped by school</small></div>

  <div class="disc-tabs">
    <button class="dtab" class:on={filter === 'all'} on:click={() => (filter = 'all')}>All</button>
    {#each $sheet.disciplines as d}
      <button class="dtab" class:on={filter === d.id} on:click={() => (filter = d.id)} style="--dc:{d.color}">
        <span class="disc-dot" style="background:{d.color}"></span>{d.name}</button>
    {/each}
    <button class="dtab add" on:click={() => (showNewDisc = !showNewDisc)}>+ School</button>
  </div>

  {#if showNewDisc}
    <div class="addrow" style="margin-bottom:8px">
      <input type="text" bind:value={newDiscName} placeholder="New discipline name…" on:keydown={(e) => e.key === 'Enter' && addDisc()} />
      <select bind:value={newDiscModel}>
        <option value="custom">Custom (no engine)</option>
        <option value="bow">Blood of the World (BoW → Taint)</option>
        <option value="pharmakia">Pharmakia (reagents + BoW)</option>
        <option value="magia">Archono Magia (Glyphs + Ash)</option>
        <option value="intervention">Intervention (Token + Veil)</option>
      </select>
      <button class="act" on:click={addDisc}>Add</button>
    </div>
  {/if}

  <div class="manifest-grid">
    {#each shown as { m, i } (i)}
      {@const disc = discById[m.disc] || $sheet.disciplines[0]}
      <div class="manifest" style="--dc:{disc?.color || '#888'}">
        <div class="m-top">
          <span class="disc-dot" style="background:{disc?.color}"></span>
          <input class="m-name" type="text" value={m.name} on:input={(e) => actions.setManifest(i, 'name', e.target.value)} placeholder="Manifestation name" />
          <select class="m-disc" on:change={(e) => actions.setManifest(i, 'disc', e.target.value)}>
            {#each $sheet.disciplines as d}<option value={d.id} selected={m.disc === d.id}>{d.name}</option>{/each}
          </select>
          <button class="del" on:click={() => actions.delManifest(i)}>✕</button>
        </div>
        <textarea class="m-desc" value={m.desc} on:input={(e) => actions.setManifest(i, 'desc', e.target.value)} placeholder="Effect, cost, notes…"></textarea>

        <div class="m-controls">
          {#if disc?.model === 'bow' || disc?.model === 'pharmakia'}
            <label class="ctl"><span class="lab">Blood of the World</span>
              <select on:change={(e) => actions.setManifest(i, 'bow', e.target.value)}>
                {#each BOW_STEPS as v}<option value={v} selected={(m.bow || 40) === v}>{v} BoW</option>{/each}
              </select></label>
            {#if disc?.model === 'pharmakia'}
              <div class="ctl"><span class="lab">Reagents prepared</span>
                <button class="chk" class:on={$sheet.pharmakia.reagents} on:click={actions.togglePrep} aria-pressed={$sheet.pharmakia.reagents} aria-label="Reagents prepared"></button></div>
              <div class="ctl"><span class="lab">Doses</span>
                <div class="counter small"><button on:click={() => actions.adjDose(-1)}>−</button><span class="num">{$sheet.pharmakia.doses}</span><button on:click={() => actions.adjDose(1)}>+</button></div></div>
            {/if}
          {:else if disc?.model === 'magia'}
            <label class="ctl"><span class="lab">Glyphs</span>
              <select on:change={(e) => actions.setManifest(i, 'glyph', e.target.value)}>{#each [0, 1, 2, 3] as g}<option value={g} selected={(m.glyph || 0) === g}>{g}</option>{/each}</select></label>
            <label class="ctl"><span class="lab">Archon Ash</span>
              <select on:change={(e) => actions.setManifest(i, 'ash', e.target.value)}>{#each [0, 1, 2, 3] as g}<option value={g} selected={(m.ash || 0) === g}>{g}</option>{/each}</select></label>
          {:else if disc?.model === 'intervention'}
            <div class="ctl"><span class="lab">Cost</span><span class="hint">1 Favor Token · Veil +10</span></div>
          {:else}
            <div class="ctl"><span class="hint">Custom school — no automated resolution. Use the dice tray.</span></div>
          {/if}
          <div class="ctl"><span class="lab">Successes</span>
            <div class="counter small"><button on:click={() => actions.adjManifest(i, -1)}>−</button><span class="num">{m.successes}</span><button on:click={() => actions.adjManifest(i, 1)}>+</button></div></div>
        </div>

        {#if disc?.model && disc.model !== 'custom'}
          <button class="manifest-btn" on:click={() => actions.manifestRoll(i)}>Manifest ▸</button>
        {/if}
      </div>
    {/each}
  </div>

  <button class="add-btn" on:click={() => actions.addManifest(filter)}>+ New manifestation{filter !== 'all' ? ' in ' + (discById[filter]?.name || '') : ''}</button>
</div>
