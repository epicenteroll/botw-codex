<script>
  // Header — identity fields + favor resources + the RM / Blood-of-the-World pool.
  import { getSheetCtx } from './context.js'
  import { rmMeterWidth } from '../rules.js'
  const { sheet, actions } = getSheetCtx()
  $: rmW = rmMeterWidth($sheet.rmCur, $sheet.rmMax)
  $: synthAvailable = (parseInt($sheet.favorGlyphs, 10) || 0) >= 3
</script>

<header class="hdr">
  <div class="hdr-left">
    <label class="field"><span>Character Name</span>
      <input type="text" bind:value={$sheet.characterName} /></label>
    <label class="field"><span>Background</span>
      <input type="text" bind:value={$sheet.characterBackground} /></label>
    <label class="field"><span>Archon <button class="mini" on:click={actions.rollArchonDomain}>Roll</button></span>
      <input type="text" bind:value={$sheet.archonDomain} placeholder="Click roll or write…" /></label>
    <label class="field"><span>RMC Balance</span>
      <input type="number" bind:value={$sheet.rmcBalance} /></label>
    <label class="field"><span class="gold">Advancement (AP) — spent on Luck &amp; upgrades</span>
      <input type="number" min="0" bind:value={$sheet.advancementPoints} /></label>
    <label class="field"><span>RM / Blood of the World pool
        <span class="tip asm" data-tip="Pharmakia & Abilities spend BoW (20/40/60/80/100/120). Confirm whether BoW is this same RM pool or a separate resource — flagged, no ruleset doc attached.">ASM</span></span>
      <div class="row"><input type="number" bind:value={$sheet.rmCur} style="width:70px" /><span>/</span><input type="number" bind:value={$sheet.rmMax} style="width:70px" /></div>
      <div class="meter"><div class="fill rm" style="width:{rmW}%"></div></div></label>
  </div>
  <div class="hdr-right">
    <div class="res"><span class="cap gold">Favor Tokens</span>
      <div class="counter"><button on:click={() => actions.adj('favorTokens', -1)}>−</button>
        <span class="num big gold">{$sheet.favorTokens}</span>
        <button on:click={() => actions.adj('favorTokens', 1)}>+</button></div>
      <span class="cap">Intervention</span></div>
    <div class="res"><span class="cap">Favor Glyphs</span>
      <div class="counter"><button on:click={() => actions.adj('favorGlyphs', -1)}>−</button>
        <span class="num big">{$sheet.favorGlyphs}</span>
        <button on:click={() => actions.adj('favorGlyphs', 1)}>+</button></div>
      <span class="cap">Archono Magia</span></div>
    <div class="res"><span class="cap" style="color:var(--taint)">Archon Ash
        <span class="tip asm" data-tip="Provisional name for the archonic powder. Alternatives: Glyphdust, Reliquary Dust, Censer-ash, Archonic Cinder, Sacrament — flagged.">ASM</span></span>
      <div class="counter"><button on:click={() => actions.adj('archonAsh', -1)}>−</button>
        <span class="num big" style="color:var(--taint)">{$sheet.archonAsh}</span>
        <button on:click={() => actions.adj('archonAsh', 1)}>+</button></div>
      <span class="cap">Archono Magia</span></div>
    {#if synthAvailable}
      <button class="synth" on:click={actions.synthesize}>Synthesize (Spends 3 Glyphs)</button>
    {/if}
  </div>
</header>
