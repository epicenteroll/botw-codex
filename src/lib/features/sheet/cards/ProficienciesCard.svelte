<script>
  // Proficiencies & Pools. Locked: tap a name to roll (combat shows its style as
  // text, Cur is derived, Max read-only). Unlocked: edit names/values, combat
  // gets a style dropdown, remove + add appear. Tier badge + AP cost are derived.
  import { getSheetCtx, RARITIES } from './context.js'
  import { tierOf, apCostToRaise, discountedApCost, combatCurrentFromWeapons, COMBAT_STYLES } from '../rules.js'
  const { sheet, actions, locked } = getSheetCtx()

  const combatValue = (s, p) => combatCurrentFromWeapons(p.max, p.style, s.weapons)
</script>

<div class="card band">
  <div class="card-title">Proficiencies &amp; Pools <small>locked: tap a name to roll · unlock to edit</small>
    <button class="lockbtn" class:unlocked={!$locked} on:click={() => locked.update((v) => !v)}>{$locked ? '🔒 Locked' : '🔓 Edit'}</button></div>
  <p class="hint" style="margin:0 0 6px"><b>1</b> → +10 · <b>20</b> → crit · result tier = feat scope &amp; combat damage · <b>0 current = Wounded</b>. A combat slot's <b>Cur is derived</b> from Max + equipped weapons that match its style.</p>
  <div class="prof-head"><span>Descriptor / Style</span><span>Cur</span><span>Max</span><span>Tier</span><span>+1 AP</span><span>✦ Crit</span><span>Wnd</span><span></span></div>

  {#each $sheet.profs as p, i}
    {@const curVal = p.combat ? combatValue($sheet, p) : p.cur}
    {@const tierVal = p.combat ? curVal : (parseInt(p.max, 10) || 0)}
    {@const tier = tierOf(tierVal)}
    {@const base = apCostToRaise(p.max)}
    {@const disc = discountedApCost(p.max, p.crit)}
    <div class="prof-row" class:combat={p.combat} class:wounded={p.wounded}>
      {#if $locked}
        <button class="rollbtn" on:click={() => actions.profRoll(i)} title="{(p.combat ? (p.style || 'Combat') : p.title)} — tap to roll">{p.combat ? (p.style || 'Combat') : p.title}</button>
      {:else if p.combat}
        <select class="rolllabel" on:change={(e) => actions.setProf(i, 'style', e.target.value)}>
          {#each COMBAT_STYLES as st}<option value={st} selected={p.style === st}>{st} (Combat)</option>{/each}
        </select>
      {:else}
        <input class="rolllabel" type="text" value={p.title} on:input={(e) => actions.setProf(i, 'title', e.target.value)} />
      {/if}

      {#if p.combat}
        <span class="ro derived" title="Max + matched equipped weapons">{curVal}</span>
      {:else}
        <input type="number" value={p.cur} on:input={(e) => actions.setProf(i, 'cur', e.target.value)} />
      {/if}

      {#if $locked}
        <span class="ro">{p.max}</span>
      {:else}
        <input type="number" value={p.max} on:input={(e) => actions.setProf(i, 'max', e.target.value)} />
      {/if}

      <span class="tier-badge tier-{tier}">{tier ? 'T' + tier : '—'}</span>
      <span class="apcost">
        {#if base === null}max
        {:else if p.crit > 0 && disc !== base}<span class="was">{base}</span><span class="now">{disc}</span>
        {:else}<span class="now">{base}</span>{/if}
      </span>
      <span class="crit">
        <button on:click={() => actions.adjProfCrit(i, -1)}>−</button>
        <span class="star">✦{p.crit}</span>
        <button on:click={() => actions.adjProfCrit(i, 1)}>+</button></span>
      <button class="wound-chk" class:on={p.wounded} on:click={() => actions.toggleWound(i)} title="Wounded" aria-label="Wounded toggle"></button>
      {#if !$locked}<button class="rm-btn" on:click={() => actions.removeProf(i)} title="Remove">✕</button>{:else}<span></span>{/if}
    </div>
  {/each}

  {#if !$locked}<button class="add-btn" style="margin-top:4px" on:click={actions.addProf}>+ Add proficiency slot</button>{/if}
</div>
