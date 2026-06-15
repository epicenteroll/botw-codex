<script>
  // System Terminal — free dice tray + Fate Oracle + the live roll output, plus
  // the Challenge Die tool (mark last combat damage, issue a morale challenge).
  import { getSheetCtx } from './context.js'
  const { sheet, actions, terminal, transient } = getSheetCtx()
  let cdDie = 12
  let cdWounds = 0
  let cdOut = 'No challenge issued.'
  $: pips = Array.from({ length: cdDie }, (_, n) => n + 1)
  function mark() { actions.markLastDamage((dmg) => { cdWounds = Math.min(cdDie, (parseInt(cdWounds, 10) || 0) + dmg) }) }
  function issue() { cdOut = actions.issueChallenge(cdDie, cdWounds) }
</script>

<div class="card">
  <div class="card-title">System Terminal</div>
  <div class="dice">
    <input class="qty" type="number" min="1" max="10" bind:value={$sheet.diceQty} />
    <select bind:value={$sheet.diceSides}>
      <option value={100}>d100</option><option value={20}>d20</option><option value={12}>d12</option>
      <option value={10}>d10</option><option value={8}>d8</option><option value={6}>d6</option><option value={4}>d4</option>
    </select>
    <button class="act" on:click={actions.doDice}>Roll</button>
  </div>
  <button class="oracle" on:click={actions.doOracle}>Consult Fate Oracle</button>
  <!-- Roll output is engine-generated HTML (no user input is interpolated raw). -->
  <div class="terminal" role="log" aria-live="polite">{@html $terminal}</div>
  {#if $transient.pendingLuck}
    <button class="luck-btn" on:click={actions.useLuck}>✦ Spend 1 AP — Luck (flip {$transient.pendingLuck.label})</button>
  {/if}

  <div class="challenge-tool">
    <div class="card-title sub" style="font-size:13px">Challenge Die</div>
    <div class="cd-grid">
      <label><span class="lab">Foe die</span>
        <select bind:value={cdDie}>{#each [4, 6, 8, 10, 12, 20] as d}<option value={d}>d{d}</option>{/each}</select></label>
      <label><span class="lab">Wounds marked</span><input type="number" min="0" bind:value={cdWounds} /></label>
      <button class="act" on:click={mark} title="Mark last combat hit">+ Last hit</button>
    </div>
    <div class="cd-wounds">
      {#each pips as n}<div class="pip" class:hit={n <= cdWounds} class:max={n === cdDie && cdWounds >= cdDie}>{n}</div>{/each}
    </div>
    <button class="oracle" style="background:var(--blood); color:#fff" on:click={issue}>Issue Challenge (roll foe die &lt; wounds)</button>
    <div class="terminal" style="min-height:34px">{@html cdOut}</div>
  </div>
</div>
