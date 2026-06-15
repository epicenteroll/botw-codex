<script>
  // Core Attributes & Skills — origin/ascension split, ✦ crit, end-session marks,
  // and the End-of-Session Growth roll. Total% = base + origin + ascension.
  import { getSheetCtx, SKILL_LABEL } from './context.js'
  import { attrBase, clampAttr } from '../rules.js'
  const { sheet, actions } = getSheetCtx()

  const GROUPS = { str: 'Strength (STR)', dex: 'Dexterity (DEX)', wil: 'Will (WIL)' }
  const BY_ATTR = { str: ['endurance', 'grip'], dex: ['reaction', 'grace'], wil: ['focus', 'resolve'] }
  const SK_CRIT = { endurance: 'crit_sk_end', grip: 'crit_sk_grp', reaction: 'crit_sk_rea', grace: 'crit_sk_gra', focus: 'crit_sk_foc', resolve: 'crit_sk_res' }

  const total = (s, attr, sk) => attrBase(s[`val_${attr}`]) + (s.skillOrigin?.[sk] || 0) + (s.skillAsc?.[sk] || 0)
</script>

<div class="card">
  <div class="card-title">Core Attributes &amp; Skills <small>click a skill → d100 ≤ Total</small></div>
  <p class="hint" style="margin:0 0 6px">Total% = base + Origin + Ascension. ✦ = crit successes (halves next upgrade cost). End-session mark: at session end a marked skill rolls to grow.
    <span class="tip asm" data-tip="End-session growth: d100 → 95-100 = +2%, 1-5 = -2%, else >Total% = +1%. Ascension AP cost above 60% is unspecified in the ruleset — flagged; the asc field is free-edit and growth is uncharged.">RULE</span></p>

  {#each ['str', 'dex', 'wil'] as a}
    <div class="attr">
      <div class="attr-head">
        <span class="attr-title">{GROUPS[a]}</span>
        <span class="crit" title="Attribute crit successes">✦
          <button on:click={() => actions.adjAttrCrit(a, -1)}>−</button>
          <span class="star">{$sheet[`crit_attr_${a}`]}</span>
          <button on:click={() => actions.adjAttrCrit(a, 1)}>+</button></span>
        <input class="attrval" type="number" min="2" max="18" bind:value={$sheet[`val_${a}`]}
          on:change={() => actions.setAttr(a, $sheet[`val_${a}`])} />
      </div>
      <div class="skill-head"><span>Skill</span><span>Base</span><span>Origin / Asc</span><span>Total</span><span>✦ Crit</span><span>End</span></div>
      {#each BY_ATTR[a] as sk}
        {@const base = attrBase($sheet[`val_${a}`])}
        {@const tot = total($sheet, a, sk)}
        <div class="skill-row">
          <button class="rolllabel" on:click={() => actions.skillCheck(sk)}>{SKILL_LABEL[sk]}</button>
          <span class="num">{base}%</span>
          <div class="split">
            <div><input type="number" value={$sheet.skillOrigin[sk]} on:input={(e) => actions.setSkill(sk, 'origin', e.target.value)} /><div class="lab">orig</div></div>
            <div><input type="number" value={$sheet.skillAsc[sk]} on:input={(e) => actions.setSkill(sk, 'asc', e.target.value)} /><div class="lab">{tot >= 60 ? 'asc·AP' : 'asc'}</div></div>
          </div>
          <span class="num total">{tot}%</span>
          <span class="crit">
            <button on:click={() => actions.adjSkillCrit(sk, -1)}>−</button>
            <span class="star">✦{$sheet[SK_CRIT[sk]]}</span>
            <button on:click={() => actions.adjSkillCrit(sk, 1)}>+</button></span>
          <button class="es-chk" class:on={$sheet[`chk_${sk}`]} on:click={() => actions.toggle(`chk_${sk}`)} aria-pressed={$sheet[`chk_${sk}`]} aria-label="End-session mark for {SKILL_LABEL[sk]}"></button>
        </div>
      {/each}
    </div>
  {/each}
  <button class="block" style="background:var(--green); margin-top:4px" on:click={actions.endSession}>Run End-of-Session Growth</button>
</div>
