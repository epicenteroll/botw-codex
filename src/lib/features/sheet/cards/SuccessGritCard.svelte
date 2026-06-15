<script>
  // Session Success registry + crit markers + GRIT reroll flag.
  import { getSheetCtx } from './context.js'
  import { critMarkers } from '../rules.js'
  const { sheet, actions } = getSheetCtx()
  $: markers = critMarkers($sheet.globalSuccessCount)
</script>

<div class="card" style="background:linear-gradient(180deg,#14141d,var(--panel))">
  <div class="row spread"><span class="cap">Session Success Registry</span>
    <div class="counter"><span class="cap">Successes</span>
      <button on:click={() => actions.adj('globalSuccessCount', -1)}>−</button>
      <span class="num">{$sheet.globalSuccessCount}</span>
      <button on:click={() => actions.adj('globalSuccessCount', 1)}>+</button></div>
  </div>
  <div class="row" style="margin-top:6px; background:rgba(0,0,0,.25); border-radius:4px; padding:8px; gap:8px">
    <span class="cap">Crit Markers:</span><span class="num" style="font-size:15px">{markers}</span>
    <span class="hint" style="margin-left:auto">1 per 8 successes</span></div>
  <div class="row spread" style="margin-top:8px">
    <span class="gold" style="font-weight:700">GRIT (Reroll Available)</span>
    <button class="chk" class:on={$sheet.gritStatus} on:click={() => actions.toggle('gritStatus')} aria-pressed={$sheet.gritStatus} aria-label="Grit reroll available"></button>
  </div>
</div>
