<script>
  // Resonance & Environmental Flux — Taint → Corruption, the Corruption Index,
  // and the Global Veil vector. Meter widths are derived (never written back).
  import { getSheetCtx } from './context.js'
  import { taintMeterWidth, corruptionMeterWidth, veilMeterWidth, clampCorruption } from '../rules.js'
  const { sheet, actions } = getSheetCtx()
  $: taintW = taintMeterWidth($sheet.taintCur)
  $: corrW = corruptionMeterWidth($sheet.corruptionVal)
  $: veilW = veilMeterWidth($sheet.veilCur)
  $: corr = clampCorruption($sheet.corruptionVal)
</script>

<div class="card">
  <div class="card-title">Resonance &amp; Environmental Flux</div>

  <div class="tracker">
    <div class="row spread"><span style="color:var(--taint); font-weight:700">Taint Allocation Matrix</span><span class="num">{$sheet.taintCur} Accrued</span></div>
    <div class="meter"><div class="fill taint" style="width:{taintW}%"></div></div>
    <div class="row">
      <input type="number" min="0" bind:value={$sheet.taintCur} style="width:70px" />
      <div class="counter small" style="margin-left:auto"><span class="cap">Cleanse Days</span>
        <button on:click={() => actions.adj('cleanseDays', -1)}>−</button>
        <span class="num">{$sheet.cleanseDays}</span>
        <button on:click={() => actions.adj('cleanseDays', 1)}>+</button></div>
    </div>
    <button class="block taint-btn" on:click={actions.purgeTaint}>Purge Taint → Corruption</button>
    <button class="block blood-btn" on:click={actions.drainOne}>Drain One from Corruption</button>
  </div>

  <div class="tracker">
    <div class="row spread"><span style="color:#f43f5e; font-weight:700">Corruption Index</span><span class="num" style="color:#f43f5e; font-weight:700">{corr}%</span></div>
    <div class="meter"><div class="fill corr" style="width:{corrW}%"></div></div>
    <div class="hint">100 Taint → +35% Corruption (max 800)</div>
  </div>

  <div class="tracker">
    <div class="row spread"><span class="muted">Global Veil Vector
        <span class="tip asm" data-tip="Each Archonic Intervention raises Veil by 10 regardless of result, and the intervention rolls d100 > Veil to land.">RULE</span></span>
      <span class="num">{$sheet.veilCur} / 100</span></div>
    <div class="meter"><div class="fill veil" style="width:{veilW}%"></div></div>
    <input type="number" step="5" bind:value={$sheet.veilCur} style="width:70px" />
  </div>
</div>
