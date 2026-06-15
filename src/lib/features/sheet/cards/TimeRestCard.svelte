<script>
  // Time & Rest — mini-calendar (reads the Calendar feature's Age/Crucible/Month/
  // Day; the hour is new, stored in vesselV2.calendarHour), inline rest, and the
  // wound list (heal time locked to the order each wound was received).
  import { getSheetCtx } from './context.js'
  import { woundTimeLabel } from '../rules.js'
  const { sheet, actions } = getSheetCtx()
  const hh = (h) => String(h).padStart(2, '0') + ':00'
  $: wounded = $sheet.profs.map((p, i) => ({ p, i })).filter((x) => x.p.wounded).sort((a, b) => (a.p.woundRank || 0) - (b.p.woundRank || 0))
</script>

<div class="card">
  <div class="card-title">Time &amp; Rest <small><span class="tip asm" data-tip="Mini calendar + inline rest. Age/Crucible/Month/Day are co-owned with the Calendar feature (written in its types; cruciblesData untouched). The hour is new.">QUICK ACCESS</span></small></div>
  <div class="cal" style="grid-template-columns:repeat(5,1fr)">
    <div class="box"><div class="v">{$sheet.cal.age}</div><div class="l">Age</div></div>
    <div class="box"><div class="v">{$sheet.cal.crucible}</div><div class="l">Crucible</div></div>
    <div class="box"><div class="v">{$sheet.cal.month}</div><div class="l">Month</div></div>
    <div class="box"><div class="v">{$sheet.cal.day}</div><div class="l">Day</div></div>
    <div class="box"><div class="v">{hh($sheet.cal.hour)}</div><div class="l">Hour</div></div>
  </div>
  <div class="restline">
    <button class="act" on:click={() => actions.advanceDays(1)}>+1 day</button>
    <button class="act" on:click={() => actions.advanceDays(7)}>+7 days</button>
    <button class="oracle" style="margin:0; width:auto; padding:6px 12px" on:click={actions.longRest}>Long rest</button>
  </div>

  <div class="card-title sub" style="font-size:13px">Wounds <small>{wounded.length} carried</small></div>
  <p class="hint" style="margin:0 0 4px">Heal one wound per rest. Time is locked to the order each wound was received: 1st = 1d · 2nd = 3d · 3rd = 7d · 4th = 14d · 5th = 30d.</p>
  <div class="wound-list">
    {#if !wounded.length}
      <div class="hint">No wounds. The vessel is whole.</div>
    {:else}
      {#each wounded as x}
        <div class="wound-item">
          <span style="color:var(--crimson)">⚔ <b>#{x.p.woundRank || 1}</b> {x.p.title}</span>
          <span><span class="hint" style="margin-right:8px">heal: {woundTimeLabel(x.p.woundRank || 1)}</span>
            <button class="heal-btn" on:click={() => actions.healWound(x.i)}>Heal (rest)</button></span>
        </div>
      {/each}
    {/if}
  </div>
</div>
