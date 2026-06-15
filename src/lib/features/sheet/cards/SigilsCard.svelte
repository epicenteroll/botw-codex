<script>
  // Defensive Sigils — single-use d20 + attr mod, >20 mitigates. Invoke spends a
  // sigil; an enemy crit shatters a READY one (§9.6 flagged). Down sigils repair
  // on a long rest (1, or 2 with a repair kit in the pack).
  import { getSheetCtx } from './context.js'
  const { sheet, actions, transient } = getSheetCtx()

  const SIG = [
    { label: 'Parry', tone: 'blue', totalKey: 'sigilParry' },
    { label: 'Evasion', tone: 'gold', totalKey: 'sigilEvasion' },
    { label: 'Barrier', tone: 'taint', totalKey: 'sigilBarrier' },
  ]
  $: hasKit = $sheet.inventory.some((it) => !it.broken && /repair\s*kit/i.test(it.name || ''))
</script>

<div class="card">
  <div class="card-title">Defensive Sigils <small>single-use · d20 + mod, &gt;20 mitigates</small></div>
  <p class="hint" style="margin:0 0 6px">Invoke spends a sigil; an enemy <b>crit</b> shatters one. Down sigils are repaired on long rest — <b>1</b>, or <b>2</b> with a repair kit in the pack.
    <span class="tip asm" data-tip="A used sigil and a crit-shattered sigil are both 'down' and restored by long-rest repair. If used sigils should refresh fully each rest and only crit-breaks use the 1–2 budget, that needs the ruleset — flagged.">RULE</span></p>
  <div class="hint">Long-rest repairs left: <b style="color:{$transient.sigilRepairs > 0 ? '#86efac' : 'var(--muted)'}">{$transient.sigilRepairs}</b> · Repair kit: <b style="color:{hasKit ? '#86efac' : 'var(--muted)'}">{hasKit ? 'yes (2/rest)' : 'no (1/rest)'}</b></div>
  <div class="sigils">
    {#each SIG as s, i}
      {@const total = $sheet[s.totalKey] || 0}
      {@const used = $sheet.sigilState[i].used}
      {@const broken = $sheet.sigilState[i].broken}
      {@const avail = total - used - broken}
      <div class="sigil {s.tone}">
        <span class="sigil-title">{s.label}</span>
        <div class="sig-stat"><span class="num" style="font-size:17px; color:{avail > 0 ? 'var(--text)' : 'var(--crimson)'}">{avail}</span><span class="cap">/ {total} ready</span></div>
        <div class="counter" style="font-size:9px"><span class="cap">total</span>
          <button on:click={() => actions.adjSigilTotal(i, -1)}>−</button>
          <span class="num">{total}</span>
          <button on:click={() => actions.adjSigilTotal(i, 1)}>+</button></div>
        <span class="sig-broken">
          {#if used > 0}<span style="color:var(--muted)">{used} used</span>{/if}
          {#if used > 0 && broken > 0} · {/if}
          {#if broken > 0}<span style="color:var(--crimson)">{broken} broken</span>{/if}
          {#if used === 0 && broken === 0}<span style="color:var(--muted)">intact</span>{/if}
        </span>
        <button class="sigil-roll" on:click={() => actions.rollSigilAt(i)} disabled={avail <= 0}>Invoke (d20)</button>
        <div class="sig-actions">
          <button class="sig-mini" on:click={() => actions.breakSigil(i)} title="Enemy crit shatters one" disabled={avail <= 0}>✗ break</button>
          <button class="sig-mini rep" on:click={() => actions.repairSigil(i)} title="Repair a broken sigil (uses a long-rest repair)" disabled={broken <= 0 || $transient.sigilRepairs <= 0}>repair</button>
        </div>
      </div>
    {/each}
  </div>
</div>
