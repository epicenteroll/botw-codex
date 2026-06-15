<script>
  // Tier Ladder & Odds — the static feat-scope ladder plus a live odds grid:
  // for a given proficiency value, the chance d20+value reaches each tier (1→+10)
  // and the flat crit chance. Pure reference; reads nothing it writes back.
  import { getSheetCtx } from './context.js'
  import { tierReachOdds } from '../rules.js'
  getSheetCtx() // ensures the card mounts inside the sheet context
  let oddsVal = 14
  $: odds = tierReachOdds(oddsVal)

  const LADDER = [
    { t: 1, range: '3–13', grow: '+1 step', enter: 'a minor feat' },
    { t: 2, range: '14–24', grow: '+1 step', enter: 'a solid feat' },
    { t: 3, range: '25–35', grow: '+1 step', enter: 'a strong feat' },
    { t: 4, range: '36–46', grow: '+1 step', enter: 'a heroic feat' },
    { t: 5, range: '47+', grow: 'capped', enter: 'a legendary feat' },
  ]
</script>

<div class="card wide">
  <div class="card-title">Tier Ladder &amp; Odds <small>feat scope &amp; combat damage by result</small></div>
  <table class="ladder">
    <thead><tr><th>Tier</th><th>Value reached</th><th>Growth</th><th>Scope on success</th></tr></thead>
    <tbody>
      {#each LADDER as r}
        <tr><td><span class="tier-badge tier-{r.t}">T{r.t}</span></td><td class="num">{r.range}</td><td>{r.grow}</td><td>{r.enter}</td></tr>
      {/each}
    </tbody>
  </table>

  <div class="odds-head">
    <span class="lab">Odds for a proficiency value of</span>
    <input type="number" min="0" max="60" bind:value={oddsVal} style="width:64px" />
    <span class="hint">d20 + value, natural 1 → +10, natural 20 → crit</span>
  </div>
  <div class="odds-grid">
    {#each odds.tiers as pct, k}
      <div class="odds-cell tier-{k + 1}"><div class="ot">T{k + 1}</div><div class="op">{pct}%</div></div>
    {/each}
    <div class="odds-cell crit"><div class="ot">Crit</div><div class="op">{odds.crit}%</div></div>
  </div>
</div>
