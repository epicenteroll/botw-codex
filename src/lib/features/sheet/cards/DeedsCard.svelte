<script>
  // Deeds (quick access). Reads/writes the vessel's personal deeds slice
  // (dynamicAchievementsList) and the shared advancementPoints, using the Deeds
  // feature's own shape — not the prototype's simplified stub — so there is no
  // silent reconciliation of the claim ledger. The shell persists via deedsData.
  import { getSheetCtx } from './context.js'
  const { sheet, actions } = getSheetCtx()
  let newDeed = ''
  let newDeedAP = 1
  function add() { const t = newDeed.trim(); if (!t) return; actions.addDeed(t, newDeedAP); newDeed = '' }
</script>

<div class="card">
  <div class="card-title">Deeds <small><span class="tip asm" data-tip="Inline quick-access to the Deeds feature. Reads/writes the same dynamicAchievementsList + shared advancementPoints, so no tab switching.">QUICK ACCESS</span></small></div>
  <div>
    {#each ($sheet.deeds || []) as d, i}
      <div class="deed" class:claimed={d.claimed}>
        <button class="chk" class:on={d.claimed} on:click={() => actions.toggleDeed(i)} title="Claim" aria-label="Claim deed"></button>
        <span>{d.title}</span>
        <span class="ap-pill">+{d.apValue} AP</span>
        <button class="send-mini" on:click={() => actions.sendDeedToNotes(i)} title="Send to Notes">→</button>
        <button class="del" on:click={() => actions.delDeed(i)}>✕</button>
      </div>
    {/each}
  </div>
  <div class="addrow">
    <input type="text" bind:value={newDeed} placeholder="New deed…" on:keydown={(e) => e.key === 'Enter' && add()} />
    <input type="number" bind:value={newDeedAP} style="width:54px" title="AP reward" />
    <button class="act" on:click={add}>Add</button>
  </div>
</div>
