<script>
  // Sheet.svelte — the character sheet, rebuilt the §9 way: a single `sheet`
  // object is the source of truth, the screen reflects it through `bind:` and
  // reactive `$:`, and all arithmetic lives in the pure rules.js. There is no
  // getElementById, no innerHTML, no querySelectorAll — saving is "write the
  // object", loading is "set the object".
  //
  // It reads the logged-in vessel from $lib/core (vesselId), persists through
  // the feature's own data layer (sheetData.js — the only file here that knows
  // about Supabase), and reports through the shared toast store.

  import { vesselId } from '$lib/core/session.js'
  import { pushToast } from '$lib/core/toast.js'
  import { debounce } from '$lib/core/utils.js'
  import FeatureState from '$lib/components/FeatureState.svelte'
  import {
    blankSheet, loadSheet, saveSheet,
  } from './sheetData.js'
  import {
    ATTR_SKILLS, COMBAT_TITLES,
    attrBase, skillTotal, pointsInvested, critMarkers,
    inventoryMax, payloadWeight, combatProficiencyCurrent,
    corruptionFromTaint, clampCorruption, clampAttr,
    rmMeterWidth, taintMeterWidth, corruptionMeterWidth, veilMeterWidth,
    rollSkillCheck, rollProficiency, rollSigil, rollDiceTray, rollOracle, rollArchon,
  } from './rules.js'

  let sheet = blankSheet()
  let ready = false // true once a vessel is loaded; gates autosave
  let loading = false
  let loadError = ''
  let saveState = 'idle' // idle | saving | saved | error
  let terminal = null // last roll result, rendered in the System Terminal

  let currentVesselId = null
  $: currentVesselId = $vesselId

  // ── Load whenever the selected vessel changes ──────────────────────────────
  let loadedId = undefined
  $: if (currentVesselId !== loadedId) loadFor(currentVesselId)

  async function loadFor(id) {
    loadedId = id
    ready = false
    loadError = ''
    terminal = null
    if (!id) {
      sheet = blankSheet()
      return
    }
    loading = true
    const res = await loadSheet(id)
    loading = false
    if (res.error) {
      loadError = res.error
      return
    }
    sheet = res.sheet
    ready = true
  }

  // ── Autosave: when the object changes (after load), persist a moment later ──
  const flushSave = debounce(async () => {
    if (!ready || !currentVesselId) return
    saveState = 'saving'
    const res = await saveSheet(currentVesselId, sheet)
    if (res.error) {
      saveState = 'error'
      pushToast({ msg: 'Save failed: ' + res.error, kind: 'error' })
    } else {
      saveState = 'saved'
    }
  }, 700)

  // JSON.stringify touches every field, so this re-runs on any sheet edit.
  $: serialized = JSON.stringify(sheet)
  $: if (ready && currentVesselId && serialized) {
    saveState = 'saving'
    flushSave()
  }

  // ── Derived values (recompute automatically) ───────────────────────────────
  $: skillRows = {
    str: { label: 'Strength (STR)', skills: ATTR_SKILLS.str },
    dex: { label: 'Dexterity (DEX)', skills: ATTR_SKILLS.dex },
    wil: { label: 'Will (WIL)', skills: ATTR_SKILLS.wil },
  }
  const SKILL_LABEL = {
    endurance: 'Endurance', grip: 'Grip', reaction: 'Reaction',
    grace: 'Grace', focus: 'Focus', resolve: 'Resolve',
  }
  const SKILL_CRIT = {
    endurance: 'crit_sk_end', grip: 'crit_sk_grp', reaction: 'crit_sk_rea',
    grace: 'crit_sk_gra', focus: 'crit_sk_foc', resolve: 'crit_sk_res',
  }
  const ATTR_OF = {
    endurance: 'val_str', grip: 'val_str', reaction: 'val_dex',
    grace: 'val_dex', focus: 'val_wil', resolve: 'val_wil',
  }

  $: baseStr = attrBase(sheet.val_str)
  $: baseDex = attrBase(sheet.val_dex)
  $: baseWil = attrBase(sheet.val_wil)
  $: baseFor = { str: baseStr, dex: baseDex, wil: baseWil }
  $: investedStr = pointsInvested(sheet.alloc_endurance, sheet.alloc_grip)
  $: investedDex = pointsInvested(sheet.alloc_reaction, sheet.alloc_grace)
  $: investedWil = pointsInvested(sheet.alloc_focus, sheet.alloc_resolve)
  $: invested = { str: investedStr, dex: investedDex, wil: investedWil }

  $: critMarkersVal = critMarkers(sheet.globalSuccessCount)

  $: slots = Math.min(inventoryMax(sheet.val_str, sheet.val_dex), 24)
  $: payload = payloadWeight(sheet.inventory, slots)
  $: overloaded = payload > slots

  $: derivedProfC5 = combatProficiencyCurrent(
    sheet.profM_5, sheet.weapEquip_1, sheet.weapMod_1, sheet.weapEquip_2, sheet.weapMod_2,
  )
  // critMarkersDisplay and profC_5 are derived for display only and written
  // into the saved blob by sheetData.toBlob — never assigned back into `sheet`,
  // which would create a reactive cycle with the autosave trigger above.

  $: synthAvailable = (parseInt(sheet.favorGlyphs, 10) || 0) >= 3

  $: rmWidth = rmMeterWidth(sheet.rmCur, sheet.rmMax)
  $: taintWidth = taintMeterWidth(sheet.taintCur)
  $: corrWidth = corruptionMeterWidth(sheet.corruptionVal)
  $: veilWidth = veilMeterWidth(sheet.veilCur)

  // ── Small mutators (all just write the object) ─────────────────────────────
  const adjust = (field, amt) => { sheet[field] = Math.max(0, (parseInt(sheet[field], 10) || 0) + amt) }
  const clampAttrField = (field) => { sheet[field] = clampAttr(sheet[field]) }
  const toggle = (field) => { sheet[field] = !sheet[field] }

  function synthesize() {
    if ((parseInt(sheet.favorGlyphs, 10) || 0) >= 3) {
      sheet.favorGlyphs = (parseInt(sheet.favorGlyphs, 10) || 0) - 3
      sheet.favorTokens = (parseInt(sheet.favorTokens, 10) || 0) + 1
    }
  }

  function purgeTaint() {
    const t = parseInt(sheet.taintCur, 10) || 0
    if (t <= 0) { pushToast('No Taint to purge.'); return }
    sheet.corruptionVal = clampCorruption((parseInt(sheet.corruptionVal, 10) || 0) + corruptionFromTaint(t))
    sheet.taintCur = 0
  }
  function drainOne() {
    sheet.corruptionVal = Math.max(0, (parseInt(sheet.corruptionVal, 10) || 0) - 1)
  }

  function rollArchonDomain() { sheet.archonDomain = rollArchon() }

  function doSkillCheck(skillKey) {
    const total = skillTotal(sheet[ATTR_OF[skillKey]], sheet[`alloc_${skillKey}`])
    const r = rollSkillCheck(total)
    if (r.success) sheet[`chk_${skillKey}`] = true
    terminal = {
      kind: 'skill', label: SKILL_LABEL[skillKey], roll: r.roll, target: r.target,
      success: r.success,
    }
  }

  function doProficiencyRoll(idx) {
    const isCombat = idx === 5
    const mod = isCombat ? derivedProfC5 : (parseInt(sheet[`profC_${idx}`], 10) || 0)
    const title = isCombat ? sheet.profTitle_5 : (sheet[`profTitle_${idx}`] || 'Auxiliary Matrix')
    const r = rollProficiency(mod)
    terminal = { kind: 'prof', title, roll: r.roll, mod: r.mod, total: r.total, crit: r.crit }
  }

  function doSigil(sigilField, attrField, label) {
    const tokens = parseInt(sheet[sigilField], 10) || 0
    if (tokens <= 0) { terminal = { kind: 'sigil-cancel', label }; return }
    sheet[sigilField] = Math.max(0, tokens - 1)
    const r = rollSigil(sheet[attrField])
    terminal = { kind: 'sigil', label, roll: r.roll, mod: r.mod, total: r.total, success: r.success, critical: r.critical }
  }

  function doDiceTray() {
    terminal = { kind: 'dice', ...rollDiceTray(sheet.diceQty, sheet.diceSides) }
  }
  function doOracle() {
    terminal = { kind: 'oracle', ...rollOracle() }
  }
</script>

<svelte:head><title>Blood of the World — Sheet</title></svelte:head>

{#if !currentVesselId}
  <FeatureState
    title="No vessel summoned"
    message="Select a character vessel from the bar above to open its sheet." />
{:else if loading}
  <FeatureState message="Downloading sheet matrix…" />
{:else if loadError}
  <FeatureState title="Could not load" message={loadError} />
{:else}
  <div class="sheet">
    <div class="savebar" data-state={saveState}>
      {#if saveState === 'saving'}Saving…{:else if saveState === 'saved'}All changes saved{:else if saveState === 'error'}Save failed — will retry on next edit{/if}
    </div>

    <!-- HEADER: identity + favor resources + time badge -->
    <header class="hdr">
      <div class="hdr-left">
        <label class="field"><span>Character Name</span>
          <input type="text" bind:value={sheet.characterName} /></label>
        <label class="field"><span>Background</span>
          <input type="text" bind:value={sheet.characterBackground} /></label>
        <label class="field"><span>Archon <button class="mini" on:click={rollArchonDomain}>Roll</button></span>
          <input type="text" bind:value={sheet.archonDomain} placeholder="Click roll or write…" /></label>
        <label class="field"><span>RMC Balance</span>
          <input type="number" bind:value={sheet.rmcBalance} /></label>
        <label class="field"><span class="gold">Advancement (AP)</span>
          <input type="number" min="0" max="57" bind:value={sheet.advancementPoints}
            on:change={() => sheet.advancementPoints = Math.min(Math.max(parseInt(sheet.advancementPoints, 10) || 0, 0), 57)} /></label>
      </div>
      <div class="hdr-right">
        <div class="favor">
          <span class="cap gold">Favor Tokens</span>
          <div class="counter"><button on:click={() => adjust('favorTokens', -1)}>−</button>
            <span class="num gold">{sheet.favorTokens}</span>
            <button on:click={() => adjust('favorTokens', 1)}>+</button></div>
        </div>
        <div class="favor">
          <span class="cap">Favor Glyphs</span>
          <div class="counter"><button on:click={() => adjust('favorGlyphs', -1)}>−</button>
            <span class="num">{sheet.favorGlyphs}</span>
            <button on:click={() => adjust('favorGlyphs', 1)}>+</button></div>
        </div>
        {#if synthAvailable}
          <button class="synth" on:click={synthesize}>Synthesize (Spends 3)</button>
        {/if}
      </div>
    </header>

    <div class="grid">
      <!-- LEFT: session registry + attributes & skills -->
      <div class="col">
        <div class="card success">
          <div class="row spread">
            <span class="cap">Session Success Registry</span>
            <div class="counter"><span class="cap">Success Log</span>
              <button on:click={() => adjust('globalSuccessCount', -1)}>−</button>
              <span class="num">{sheet.globalSuccessCount}</span>
              <button on:click={() => adjust('globalSuccessCount', 1)}>+</button></div>
          </div>
          <div class="markerbox">
            <span>Crit Markers Unlocked:</span>
            <span class="num big">{critMarkersVal}</span>
            <span class="hint">(1 Marker per 8 Successes)</span>
          </div>
        </div>

        <div class="card grit">
          <span class="gold strong">GRIT (Reroll Available):</span>
          <button class="chk" class:on={sheet.gritStatus} on:click={() => toggle('gritStatus')} aria-pressed={sheet.gritStatus}></button>
        </div>

        <div class="card">
          <div class="card-title">Core Attributes &amp; Skill Matrices <span>Click a skill to roll d100 under its Total</span></div>
          {#each ['str', 'dex', 'wil'] as attr}
            <div class="attr">
              <div class="attr-head">
                <span class="attr-title">{skillRows[attr].label}</span>
                <div class="attr-right">
                  <div class="counter small"><span class="cap">D20 Crit</span>
                    <button on:click={() => adjust(`crit_attr_${attr}`, -1)}>−</button>
                    <span class="num">{sheet[`crit_attr_${attr}`]}</span>
                    <button on:click={() => adjust(`crit_attr_${attr}`, 1)}>+</button></div>
                  <input class="attrval" type="number" min="2" max="18" bind:value={sheet[`val_${attr}`]} on:change={() => clampAttrField(`val_${attr}`)} />
                </div>
              </div>
              <div class="skill-head"><span>Skill Node</span><span>Base</span><span>Alloc</span><span>Total</span><span>Crit</span><span>End</span></div>
              {#each skillRows[attr].skills as sk}
                <div class="skill-row">
                  <button class="rolllabel" on:click={() => doSkillCheck(sk)}>{SKILL_LABEL[sk]}</button>
                  <span class="num">{baseFor[attr]}%</span>
                  <input class="alloc" type="number" bind:value={sheet[`alloc_${sk}`]} />
                  <span class="num total">{skillTotal(sheet[`val_${attr}`], sheet[`alloc_${sk}`])}%</span>
                  <div class="counter tiny">
                    <button on:click={() => adjust(SKILL_CRIT[sk], -1)}>−</button>
                    <span class="num">{sheet[SKILL_CRIT[sk]]}</span>
                    <button on:click={() => adjust(SKILL_CRIT[sk], 1)}>+</button></div>
                  <button class="chk" class:on={sheet[`chk_${sk}`]} on:click={() => toggle(`chk_${sk}`)} aria-pressed={sheet[`chk_${sk}`]}></button>
                </div>
              {/each}
              <div class="invested">Points Invested: {invested[attr]}</div>
            </div>
          {/each}
        </div>
      </div>

      <!-- CENTER: trackers + proficiencies -->
      <div class="col">
        <div class="card">
          <div class="card-title">Resonance &amp; Environmental Flux</div>

          <div class="tracker">
            <div class="row spread"><span>RM (Magical Essence)</span><span class="num">{sheet.rmCur} / {sheet.rmMax}</span></div>
            <div class="meter"><div class="fill rm" style="width:{rmWidth}%"></div></div>
            <div class="row"><input type="number" bind:value={sheet.rmCur} /><span>/</span><input type="number" bind:value={sheet.rmMax} /></div>
          </div>

          <div class="tracker">
            <div class="row spread"><span class="taint strong">Taint Allocation Matrix</span><span class="num">{sheet.taintCur} Accumulated</span></div>
            <div class="meter"><div class="fill taint" style="width:{taintWidth}%"></div></div>
            <div class="row">
              <input type="number" min="0" bind:value={sheet.taintCur} />
              <div class="counter small" style="margin-left:auto"><span class="cap">Cleanse Days</span>
                <button on:click={() => adjust('cleanseDays', -1)}>−</button>
                <span class="num">{sheet.cleanseDays}</span>
                <button on:click={() => adjust('cleanseDays', 1)}>+</button></div>
            </div>
            <button class="block taint-btn" on:click={purgeTaint}>Purge Taint to Corruption</button>
            <button class="block blood-btn" on:click={drainOne}>Drain One from Corruption</button>
          </div>

          <div class="tracker">
            <div class="row spread"><span class="corr strong">Calculated Corruption Index</span><span class="num corr strong">{clampCorruption(sheet.corruptionVal)}%</span></div>
            <div class="meter"><div class="fill corr" style="width:{corrWidth}%"></div></div>
            <div class="hint">Derived from Taint vectors: 100 Taint ➔ +35% Corruption</div>
          </div>

          <div class="tracker">
            <div class="row spread"><span class="muted">The Global Veil Vector</span><span class="num">{sheet.veilCur} / 100</span></div>
            <div class="meter"><div class="fill veil" style="width:{veilWidth}%"></div></div>
            <div class="row"><input type="number" step="5" bind:value={sheet.veilCur} /><span class="hint">Steps: ±5 or ±10 intervals</span></div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Proficiencies &amp; Pools <span>Click a name to roll d20 + Modifier</span></div>
          <p class="hint">Main Base Score: 2d6+12 | Others: 2d6+7. Slot 5 (combat) recalculates with equipped weapon modifiers.</p>
          <div class="prof-head"><span>Descriptor Designation</span><span>Cur</span><span>Max</span><span>D20 Crit</span></div>
          {#each [1, 2, 3, 4, 5, 6, 7, 8] as i}
            <div class="prof-row" class:combat={i === 5}>
              {#if i === 5}
                <select class="rolllabel sel" bind:value={sheet.profTitle_5} on:click={() => doProficiencyRoll(5)}>
                  {#each COMBAT_TITLES as t}<option value={t}>{t} (Combat)</option>{/each}
                </select>
                <input class="num gold" type="number" readonly value={derivedProfC5} title="Recalculated from Max + equipped weapon modifiers" />
                <input type="number" bind:value={sheet.profM_5} />
              {:else}
                <input class="rolllabel" type="text" bind:value={sheet[`profTitle_${i}`]} on:click={() => doProficiencyRoll(i)} />
                <input type="number" bind:value={sheet[`profC_${i}`]} />
                <input type="number" bind:value={sheet[`profM_${i}`]} />
              {/if}
              <div class="counter tiny">
                <button on:click={() => adjust(`crit_prof_${i}`, -1)}>−</button>
                <span class="num">{sheet[`crit_prof_${i}`]}</span>
                <button on:click={() => adjust(`crit_prof_${i}`, 1)}>+</button></div>
            </div>
          {/each}
        </div>
      </div>

      <!-- RIGHT: sigils, abilities, armaments + inventory, terminal -->
      <div class="col">
        <div class="card">
          <div class="card-title">Defensive Sigil Allocations <span>Click a sigil to roll &amp; spend</span></div>
          <p class="hint">Parry (+STR) | Evasion (+DEX) | Barrier (+WIL).</p>
          <div class="sigils">
            {#each [['Parry', 'sigilParry', 'val_str', 'blue'], ['Evasion', 'sigilEvasion', 'val_dex', 'gold'], ['Barrier', 'sigilBarrier', 'val_wil', 'taint']] as [label, field, attr, tone]}
              <button class="sigil {tone}" on:click={() => doSigil(field, attr, label)}>
                <span class="sigil-title">{label}</span>
                <div class="counter" on:click|stopPropagation>
                  <button on:click={() => adjust(field, -1)}>−</button>
                  <span class="num">{sheet[field]}</span>
                  <button on:click={() => adjust(field, 1)}>+</button>
                </div>
              </button>
            {/each}
          </div>
        </div>

        <div class="card">
          <div class="card-title">Abilities &amp; Magia Registers
            <div class="counter small"><span class="cap">Successes</span>
              <button on:click={() => adjust('abilitySuccessTracker', -1)}>−</button>
              <span class="num">{sheet.abilitySuccessTracker}</span>
              <button on:click={() => adjust('abilitySuccessTracker', 1)}>+</button></div>
          </div>
          <textarea rows="4" bind:value={sheet.abilitiesLogBox} placeholder="Register abilities protocols, cost indices, and success marks…"></textarea>
        </div>

        <div class="card">
          <div class="card-title">Wielded Armaments</div>
          <div class="weap-head"><span>Eq.</span><span>Equipped Weapon Name</span><span>Prof. Mod</span></div>
          {#each [1, 2] as w}
            <div class="weap-row">
              <button class="chk" class:on={sheet[`weapEquip_${w}`]} on:click={() => toggle(`weapEquip_${w}`)} aria-pressed={sheet[`weapEquip_${w}`]}></button>
              <input type="text" bind:value={sheet[`weapName_${w}`]} placeholder={w === 1 ? 'Primary Armament' : 'Secondary / Alternative'} />
              <input class="modin" type="number" bind:value={sheet[`weapMod_${w}`]} />
            </div>
          {/each}

          <div class="card-title sub">Equipment Systems
            <span class="num" class:over={overloaded}>Slots: {payload} / {slots}</span>
          </div>
          <div class="inv">
            {#each Array(slots) as _, i}
              <div class="inv-row">
                <input type="text" bind:value={sheet.inventory[i].name} placeholder={`Item allocation ${i + 1}`} />
                <select bind:value={sheet.inventory[i].weight}>
                  <option value={0}>Empty</option>
                  <option value={1}>Normal (1)</option>
                  <option value={2}>Large (2)</option>
                </select>
              </div>
            {/each}
          </div>
        </div>

        <div class="card">
          <div class="card-title">System Terminal Tray</div>
          <div class="dice">
            <input class="qty" type="number" min="1" max="10" bind:value={sheet.diceQty} />
            <select bind:value={sheet.diceSides}>
              <option value={100}>d100 (Checks)</option>
              <option value={20}>d20 (Standard)</option>
              <option value={12}>d12 Die</option>
              <option value={10}>d10 Die</option>
              <option value={8}>d8 Die</option>
              <option value={6}>d6 Die</option>
              <option value={4}>d4 Die</option>
            </select>
            <button class="act" on:click={doDiceTray}>Roll</button>
          </div>
          <button class="oracle" on:click={doOracle}>Consult Fate Oracle</button>
          <div class="terminal">
            {#if !terminal}Awaiting command line execution…
            {:else if terminal.kind === 'skill'}
              <span class="cap">Skill {terminal.label} Check</span>
              <div class="line" style:color={terminal.success ? 'var(--accent-green,#166534)' : 'var(--accent-blood,#991b1b)'}>d100 [{terminal.roll}] vs Target [{terminal.target}%]</div>
              <div class="sub-line" style:color={terminal.success ? 'var(--accent-green,#166534)' : 'var(--accent-blood,#991b1b)'}>{terminal.success ? 'SUCCESS (Under Core Capability) — End Session checked' : 'FAILURE (Over-Exertion)'}</div>
            {:else if terminal.kind === 'prof'}
              <span class="cap">Proficiency Execution</span>
              <div class="line"><strong>{terminal.title}</strong></div>
              <div class="line gold">d20 [{terminal.roll}] + Mod [{terminal.mod}] = Total {terminal.total}</div>
              {#if terminal.crit === 'success'}<div class="sub-line" style="color:var(--accent-green,#166534)">🔥 Critical Manifestation Multiplier</div>{/if}
              {#if terminal.crit === 'fail'}<div class="sub-line" style="color:var(--accent-blood,#991b1b)">💀 Critical Failure Disruption</div>{/if}
            {:else if terminal.kind === 'sigil'}
              <span class="cap">Sigil {terminal.label} Matrix Fired</span>
              <div class="line">d20 [{terminal.roll}] + Mod [{terminal.mod}] = Total {terminal.total}</div>
              {#if terminal.critical}<div class="sub-line" style="color:var(--accent-green,#166534)">🔥 Critical Structural Nullification</div>
              {:else if terminal.success}<div class="sub-line gold">Success (Mitigated Damage)</div>
              {:else}<div class="sub-line muted">Check Complete</div>{/if}
            {:else if terminal.kind === 'sigil-cancel'}
              <span class="cap" style="color:var(--accent-blood,#991b1b)">Roll Action Cancelled</span>
              <div class="line">No remaining {terminal.label} Tokens available.</div>
            {:else if terminal.kind === 'dice'}
              <div class="line">Output [ {terminal.results.join(', ')} ]</div>
              {#if terminal.count > 1}<div class="sub-line">Matrix Total: {terminal.total}</div>{/if}
              {#if terminal.flag === 'crit'}<div class="sub-line" style="color:var(--accent-green,#166534)">🔥 Critical Success Layer Triggered</div>{/if}
              {#if terminal.flag === 'fumble'}<div class="sub-line" style="color:var(--accent-blood,#991b1b)">💀 Break Critical Fumble Paradox</div>{/if}
            {:else if terminal.kind === 'oracle'}
              <span class="cap">The Fate Oracle Decides</span>
              <div class="line strong" style:color={terminal.color}>[Roll {terminal.roll}] — {terminal.judgment}</div>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .sheet {
    /* Local shorthands → the shared tokens (src/lib/styles/tokens.css). The
       colour names --blood / --blue / --green / --taint resolve straight from
       the canonical tokens, so they are not re-declared here. */
    --taint-c: var(--taint);
    --b: var(--border);
    --p: var(--panel);
    --p2: var(--panel-2);
    --tx: var(--text);
    --mut: var(--text-muted);
    --gd: var(--gold);
    font-family: var(--font-ui);
    color: var(--tx);
    padding: 14px;
    overflow-y: auto;
  }
  /* Empty / loading / error states now use the shared FeatureState component
     ($lib/components/FeatureState.svelte) — task D. */

  .savebar { font-size: 11px; color: var(--mut); height: 16px; margin-bottom: 6px; text-align: right; }
  .savebar[data-state='saved'] { color: var(--green); }
  .savebar[data-state='error'] { color: var(--blood); }

  .num { font-family: var(--font-data); }
  .num.big { font-size: 15px; }
  .gold { color: var(--gd); }
  .muted { color: var(--mut); }
  .corr { color: #f43f5e; }
  .taint { color: #a78bfa; }
  .strong { font-weight: 700; }
  .hint { font-size: 10px; color: var(--mut); font-style: italic; }
  .cap { font-size: 9px; text-transform: uppercase; letter-spacing: .5px; color: var(--mut); }

  .hdr { display: flex; gap: 18px; flex-wrap: wrap; justify-content: space-between;
    background: var(--p); border: 1px solid var(--b); border-radius: 6px; padding: 12px; margin-bottom: 12px; }
  .hdr-left { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; flex: 1; min-width: 320px; }
  .hdr-right { display: flex; align-items: center; gap: 14px; }
  .field { display: flex; flex-direction: column; gap: 3px; }
  .field > span { font-size: 9px; text-transform: uppercase; color: var(--mut); }
  .favor { display: flex; flex-direction: column; align-items: center; gap: 3px; }

  input, select, textarea {
    background: #0c0c11; border: 1px solid var(--b); color: var(--tx);
    border-radius: 4px; padding: 5px 6px; font-size: 12px; font-family: inherit; width: 100%;
  }
  input[type='number'] { font-family: var(--font-data); }
  input:focus, select:focus, textarea:focus { outline: 2px solid var(--gd); outline-offset: -1px; }
  textarea { resize: vertical; }

  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; align-items: start; }
  @media (max-width: 980px) { .grid { grid-template-columns: 1fr; } .hdr-left { grid-template-columns: 1fr; } }
  .col { display: flex; flex-direction: column; gap: 12px; }
  .card { background: var(--p); border: 1px solid var(--b); border-radius: 6px; padding: 12px; }
  .card-title { font-family: var(--font-display); font-size: 16px; color: var(--tx); margin-bottom: 8px;
    display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .card-title span { font-size: 9px; text-transform: uppercase; color: var(--mut); font-family: var(--font-ui); }
  .card-title.sub { margin-top: 14px; border-bottom: 1px solid var(--b); padding-bottom: 4px; }
  .row { display: flex; align-items: center; gap: 6px; }
  .row.spread { justify-content: space-between; }

  .counter { display: inline-flex; align-items: center; gap: 4px; }
  .counter.small { font-size: 9px; } .counter.tiny button { padding: 0 5px; }
  .counter button { background: var(--p2); border: 1px solid var(--b); color: var(--tx);
    width: auto; padding: 1px 7px; border-radius: 3px; cursor: pointer; font-size: 12px; }
  .counter button:hover { border-color: var(--gd); }
  .counter .num { min-width: 16px; text-align: center; }
  .mini { background: var(--p2); border: 1px solid var(--b); color: var(--gd); cursor: pointer;
    width: auto; font-size: 9px; padding: 1px 6px; border-radius: 3px; margin-left: 6px; }
  .synth { background: var(--gd); color: #000; font-weight: 700; font-size: 10px; border: 0;
    border-radius: 4px; padding: 5px 8px; cursor: pointer; width: auto; }

  .success { background: linear-gradient(180deg, #14141d, var(--p)); }
  .markerbox { display: flex; align-items: center; gap: 8px; margin-top: 6px;
    background: rgba(0,0,0,.25); border-radius: 4px; padding: 8px; }
  .markerbox .hint { margin-left: auto; }
  .grit { display: flex; align-items: center; }
  .grit .gold { margin-right: auto; }

  .chk { width: 18px; height: 18px; border: 2px solid var(--b); border-radius: 4px;
    background: #0c0c11; cursor: pointer; padding: 0; flex: 0 0 auto; }
  .chk.on { background: var(--gd); border-color: var(--gd); }

  .attr { border-top: 1px solid var(--b); padding-top: 8px; margin-top: 8px; }
  .attr:first-of-type { border-top: 0; }
  .attr-head { display: flex; justify-content: space-between; align-items: center; }
  .attr-title { font-weight: 700; }
  .attr-right { display: flex; align-items: center; gap: 8px; }
  .attrval { width: 56px; text-align: center; }
  .skill-head, .skill-row { display: grid; grid-template-columns: 1.4fr .6fr .8fr .8fr 1fr .5fr; gap: 4px; align-items: center; }
  .skill-head { font-size: 9px; text-transform: uppercase; color: var(--mut); margin: 6px 0 2px; }
  .skill-row { margin-bottom: 4px; }
  .skill-row .total { color: var(--gd); }
  .rolllabel { background: none; border: 0; color: var(--tx); text-align: left; cursor: pointer;
    border-bottom: 1px dotted var(--gd); padding: 2px 0; width: 100%; font-size: 12px; }
  .rolllabel:hover { color: var(--gd); }
  .rolllabel.sel { border: 1px solid var(--b); color: var(--gd); border-radius: 4px; }
  .alloc { padding: 3px; text-align: center; }
  .invested { text-align: right; font-size: 10px; color: var(--mut); font-style: italic; margin-top: 2px; }

  .tracker { border-top: 1px solid rgba(255,255,255,.05); padding-top: 8px; margin-top: 8px; }
  .tracker:first-of-type { border-top: 0; }
  .meter { height: 8px; background: #000; border-radius: 4px; overflow: hidden; margin: 4px 0; }
  .fill { height: 100%; transition: width .2s; }
  .fill.rm { background: var(--blue); } .fill.taint { background: var(--taint-c); }
  .fill.corr { background: #f43f5e; } .fill.veil { background: var(--mut); }
  .tracker input[type='number'] { width: 70px; }
  .block { width: 100%; border: 0; border-radius: 4px; padding: 6px; margin-top: 8px; cursor: pointer; color: #fff; }
  .taint-btn { background: var(--taint-c); } .blood-btn { background: #7f1d1d; }

  .prof-head, .prof-row { display: grid; grid-template-columns: 2fr .8fr .8fr 1fr; gap: 5px; align-items: center; }
  .prof-head { font-size: 9px; text-transform: uppercase; color: var(--mut); margin-bottom: 4px; }
  .prof-row { margin-bottom: 4px; }
  .prof-row.combat { border-left: 2px solid var(--blood); padding-left: 4px; }
  .prof-row .rolllabel { border: 0; }

  .sigils { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .sigil { background: var(--p2); border: 1px solid var(--b); border-radius: 6px; padding: 8px;
    cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 6px; width: auto; color: var(--tx); }
  .sigil.blue { border-top: 2px solid var(--blue); } .sigil.gold { border-top: 2px solid var(--gd); }
  .sigil.taint { border-top: 2px solid var(--taint-c); }
  .sigil-title { font-weight: 700; font-size: 12px; }

  .weap-head, .weap-row { display: grid; grid-template-columns: 24px 1fr 70px; gap: 6px; align-items: center; }
  .weap-head { font-size: 9px; text-transform: uppercase; color: var(--mut); margin-bottom: 2px; }
  .weap-row { margin-bottom: 5px; }
  .modin { text-align: center; }
  .num.over { color: var(--blood); font-weight: 700; }
  .inv { max-height: 230px; overflow-y: auto; margin-top: 8px; padding-right: 4px; }
  .inv-row { display: grid; grid-template-columns: 2.5fr 1.2fr; gap: 4px; margin-bottom: 5px; }

  .dice { display: flex; gap: 6px; align-items: center; }
  .dice .qty { width: 46px; text-align: center; }
  .act, .oracle { border: 0; border-radius: 4px; cursor: pointer; color: #fff; }
  .act { background: var(--blue); padding: 6px 10px; width: auto; }
  .oracle { background: var(--gd); color: #000; font-weight: 700; padding: 7px; width: 100%; margin-top: 8px; }
  .terminal { background: #000; border: 1px solid var(--b); border-radius: 4px; padding: 10px;
    margin-top: 8px; min-height: 56px; font-size: 12px; color: var(--mut); }
  .terminal .line { font-size: 13px; margin: 2px 0; color: var(--tx); }
  .terminal .line.gold, .terminal .sub-line.gold { color: var(--gd); }
  .terminal .sub-line { font-size: 11px; font-weight: 700; }
</style>
