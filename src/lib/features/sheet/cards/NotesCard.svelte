<script>
  // Notes (quick capture → the vessel's Notes tab, dynamicVesselNotes). The
  // prototype's {cat,text,detail} maps to {category,title,content}; the shell
  // persists through notesData so the full Notes feature reads the same data.
  import { getSheetCtx, NOTE_CATS, NOTE_COLOR, NOTE_LABEL } from './context.js'
  const { sheet, actions } = getSheetCtx()
  let qnCat = NOTE_CATS[0]
  let qnText = ''
  function capture() { const t = qnText.trim(); if (!t) return; actions.addNote(qnCat, t, ''); qnText = '' }
</script>

<div class="card">
  <div class="card-title">Notes <small><span class="tip asm" data-tip="Quick-capture to the vessel's Notes tab. Jot a name/sentence with a category now; flesh it out later in the full Notes feature.">QUICK CAPTURE</span></small></div>
  <p class="hint" style="margin:0 0 4px">Met an NPC, found a place, a monster, a reagent, a scrap of knowledge? Capture it in a line now; flesh it out later.</p>
  <div class="qn-row">
    <select bind:value={qnCat}>{#each NOTE_CATS as c}<option value={c}>{NOTE_LABEL[c] || c}</option>{/each}</select>
    <input type="text" bind:value={qnText} placeholder="A name or one sentence…" on:keydown={(e) => e.key === 'Enter' && capture()} />
    <button class="act" on:click={capture}>Capture</button>
  </div>
  <div style="margin-top:8px">
    {#if !($sheet.notes && $sheet.notes.length)}
      <div class="hint">No captures yet.</div>
    {:else}
      {#each $sheet.notes as n, i}
        <div class="note">
          <span class="note-cat" style="background:{(NOTE_COLOR[n.cat] || '#444')}22; color:{NOTE_COLOR[n.cat] || '#aaa'}; border:1px solid {(NOTE_COLOR[n.cat] || '#444')}55">{NOTE_LABEL[n.cat] || n.cat}</span>
          <div class="body"><span class="ttl">{n.text}</span>
            <textarea placeholder="Add detail later…" value={n.detail || ''} on:input={(e) => actions.setNote(i, 'detail', e.target.value)}></textarea></div>
          <button class="del" on:click={() => actions.removeNote(i)} title="Remove">✕</button>
        </div>
      {/each}
    {/if}
  </div>
</div>
