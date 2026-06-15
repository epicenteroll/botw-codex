<script>
  // Vision & Guidance — meditate, pose a question, roll d100. The GM reads cards
  // by the number. Costs 3 hours, or free if folded into a long rest. The sheet
  // only rolls + records; the result can be sent to Notes.
  import { getSheetCtx } from './context.js'
  const { sheet, actions } = getSheetCtx()
  let q = ''
  let foldedIntoRest = false
  let out = null
  let sent = false
  function seek() { out = actions.seekVision(q, foldedIntoRest); sent = false }
  function send() { actions.sendVisionToNotes(); sent = true; setTimeout(() => (sent = false), 1500) }
</script>

<div class="card">
  <div class="card-title">Vision &amp; Guidance <small>meditation / ritual <span class="tip asm" data-tip="Player rolls d100; the GM reads physical cards by the result. The sheet only rolls and records the question + number.">NEW</span></small></div>
  <p class="hint" style="margin:0 0 6px">Still the mind, pose a question, and let the result fall. Your Game Master draws the guiding cards by the number. <b>Costs 3 hours</b> — free if folded into a long rest.</p>
  <input bind:value={q} placeholder="What guidance do you seek?" />
  <label style="display:flex; align-items:center; gap:6px; font-size:11px; margin-top:6px">
    <button class="chk" class:on={foldedIntoRest} on:click={() => (foldedIntoRest = !foldedIntoRest)} aria-pressed={foldedIntoRest} aria-label="Part of a long rest"></button>Part of a long rest (no time cost)</label>
  <button class="oracle" style="background:var(--taint); color:#fff; margin-top:6px" on:click={seek}>Meditate &amp; Roll d100</button>
  <div class="terminal" style="min-height:46px">
    {#if !out}The vision is unsought.
    {:else}
      <div class="line gold" style="font-size:24px; font-weight:700">{out.roll}</div>
      <div class="line">{out.q ? `On: “${out.q}”` : 'No question posed.'}</div>
      <div class="hint">{out.free ? 'Folded into the long rest — no time cost.' : '3 hours elapsed.'} Present this number to your Game Master.</div>
    {/if}
  </div>
  {#if out}<button class="send-btn" on:click={send}>{sent ? '✓ Sent to Notes' : '→ Send this vision to Notes'}</button>{/if}
</div>
