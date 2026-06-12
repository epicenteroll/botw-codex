<script>
  // Calendar.svelte — the "Temporal Horizon", rebuilt the §9 way: a single
  // `calendar` object is the source of truth, the screen reflects it through
  // `bind:` and reactive `$:`, and all arithmetic lives in the pure rules.js
  // (the Dynamic Progression Orbital Engine). There is no getElementById, no
  // innerHTML, no querySelectorAll — saving is "write the object", loading is
  // "set the object".
  //
  // It reads the logged-in vessel from $lib/core (vesselId), persists through
  // the feature's own data layer (calendarData.js — the only file here that
  // knows about Supabase), and reports through the shared toast store. Its data
  // shares the vessel's sheet_data blob with the sheet, so saves MERGE.

  import { vesselId } from '$lib/core/session.js'
  import { pushToast } from '$lib/core/toast.js'
  import { debounce } from '$lib/core/utils.js'
  import { blankCalendar, loadCalendar, saveCalendar } from './calendarData.js'
  import {
    archonOrbitOrder, CYCLES, CYCLE_ORDER, TRANSITION_DEFAULT,
    ensureCrucible, buildMonthGrid, rollRandomWeeks,
    clampCrucible, clampWeeks, archonShortName, dateBadge,
  } from './rules.js'

  let calendar = blankCalendar()
  let ready = false // true once a vessel is loaded; gates autosave
  let loading = false
  let loadError = ''
  let saveState = 'idle' // idle | saving | saved | error

  // Which cycle accordions are open (live: rejuv open ▼, others collapsed ▶).
  let open = { rejuv: true, fest: false, valour: false }

  let currentVesselId = null
  $: currentVesselId = $vesselId

  // ── Load whenever the selected vessel changes ──────────────────────────────
  let loadedId = undefined
  $: if (currentVesselId !== loadedId) loadFor(currentVesselId)

  async function loadFor(id) {
    loadedId = id
    ready = false
    loadError = ''
    if (!id) {
      calendar = blankCalendar()
      return
    }
    loading = true
    const res = await loadCalendar(id)
    loading = false
    if (res.error) {
      loadError = res.error
      return
    }
    calendar = res.calendar
    ready = true
  }

  // ── Autosave: when the object changes (after load), persist a moment later ──
  const flushSave = debounce(async () => {
    if (!ready || !currentVesselId) return
    saveState = 'saving'
    const res = await saveCalendar(currentVesselId, calendar)
    if (res.error) {
      saveState = 'error'
      pushToast({ msg: 'Save failed: ' + res.error, kind: 'error' })
    } else {
      saveState = 'saved'
    }
  }, 700)

  // JSON.stringify touches every field, so this re-runs on any calendar edit.
  $: serialized = JSON.stringify(calendar)
  $: if (ready && currentVesselId && serialized) {
    saveState = 'saving'
    flushSave()
  }

  // ── Derived values (recompute automatically) ───────────────────────────────
  $: activeYear = calendar.cruciblesData?.[calendar.currentCrucible]
  $: monthGrid = activeYear ? buildMonthGrid(activeYear.months) : []
  $: grouped = {
    rejuv: monthGrid.filter((m) => m.cycle === 'rejuv'),
    fest: monthGrid.filter((m) => m.cycle === 'fest'),
    valour: monthGrid.filter((m) => m.cycle === 'valour'),
  }
  $: transitionText = activeYear?.manualTransitionDuration ?? TRANSITION_DEFAULT
  $: badge = dateBadge(calendar)

  // ── Mutators (all just write the object; autosave picks them up) ───────────
  // Crucible number changed: clamp it, then make sure that crucible's registry
  // exists (live: updateVesselEpochState → initializeCrucibleRegistry).
  function onCrucibleChange() {
    const c = clampCrucible(calendar.currentCrucible)
    calendar.currentCrucible = c
    calendar.cruciblesData = ensureCrucible(calendar.cruciblesData, c)
  }

  // Orbit origin changed: force a rebuild of the active crucible from the new
  // start index, preserving each month's week count (live: handleOrbitStartChange).
  function onOrbitChange(e) {
    const idx = parseInt(e.target.value, 10) || 0
    calendar.cruciblesData = ensureCrucible(calendar.cruciblesData, calendar.currentCrucible, idx)
  }

  // Roll new random week counts for every month + a transition-period duration
  // (live: rollRandomWeeksForCrucible).
  function rollWeeks() {
    const year = calendar.cruciblesData[calendar.currentCrucible]
    if (!year) return
    const { weeks, transition } = rollRandomWeeks()
    year.months.forEach((m, i) => { m.weeks = weeks[i] })
    year.manualTransitionDuration = transition.text
    calendar.cruciblesData = { ...calendar.cruciblesData } // trigger reactivity
    pushToast(`Anomaly rolled: ${transition.text}`)
  }

  // Manual per-month week count (live: updateManualMonthWeeks).
  function setWeeks(monthIndex, value) {
    const year = calendar.cruciblesData[calendar.currentCrucible]
    if (!year) return
    const mo = year.months.find((m) => m.index === monthIndex)
    if (mo) mo.weeks = clampWeeks(value)
    calendar.cruciblesData = { ...calendar.cruciblesData }
  }

  // Click a day to set the vessel's active date (live: setVesselActiveDay).
  function setActiveDay(monthIdx, dayNum) {
    calendar.calendarCurrentMonth = monthIdx
    calendar.calendarCurrentDay = dayNum
  }

  // Manual transition-duration text (live: updateManualTransitionDuration, but
  // stored where the renderer reads it — see calendarData.js header note).
  function setTransition(value) {
    const year = calendar.cruciblesData[calendar.currentCrucible]
    if (!year) return
    year.manualTransitionDuration = value
    calendar.cruciblesData = { ...calendar.cruciblesData }
  }

  function toggleCycle(key) {
    open[key] = !open[key]
  }
</script>

<svelte:head><title>Blood of the World — Calendar</title></svelte:head>

<div class="calendar">
  {#if !currentVesselId}
    <div class="empty">
      <h2>No vessel summoned</h2>
      <p>Select a character vessel from the bar above to open its timeline.</p>
    </div>
  {:else if loading}
    <div class="empty"><p>Aligning the chronological matrix…</p></div>
  {:else if loadError}
    <div class="empty"><h2>Could not load</h2><p>{loadError}</p></div>
  {:else}
    <div class="savebar" data-state={saveState}>
      {#if saveState === 'saving'}Saving…{:else if saveState === 'saved'}All changes saved{:else if saveState === 'error'}Save failed — will retry on next edit{/if}
    </div>

    <div class="card">
      <div class="card-title">
        Chronological Matrix
        <span class="badge num">{badge}</span>
      </div>

      <!-- Active Chrono Anchor Control Panel -->
      <div class="anchor">
        <span class="cap">Active Chrono Anchor Control Panel</span>
        <div class="anchor-line">
          The
          <input
            class="cruc num"
            type="number"
            min="1"
            bind:value={calendar.currentCrucible}
            on:change={onCrucibleChange} />
          th Crucible of the
          <input class="age" type="text" bind:value={calendar.currentAge} placeholder="Age name…" />
          {#if activeYear}
            <span class="orbit">
              <span class="cap">Orbit Origin:</span>
              <select value={activeYear.startArchonIndex} on:change={onOrbitChange}>
                {#each archonOrbitOrder as name, idx}
                  <option value={idx}>{archonShortName(name)}</option>
                {/each}
              </select>
            </span>
          {/if}
        </div>
      </div>

      <div class="rollbar">
        <button class="roll-btn" on:click={rollWeeks}>🎲 Roll Random Weeks for This Year</button>
        <span class="hint">(Modify input counts inside cards for session updates)</span>
      </div>

      <!-- The three cycles, as accordions -->
      <div class="cycles">
        {#each CYCLE_ORDER as key}
          {@const cyc = CYCLES[key]}
          <div class="accordion" data-cycle={key}>
            <button class="trigger" on:click={() => toggleCycle(key)} aria-expanded={open[key]}>
              <span>{cyc.emoji} {cyc.label}</span>
              <span class="arrow">{open[key] ? '▼' : '▶'}</span>
            </button>
            {#if open[key]}
              <div class="content">
                {#each grouped[key] as m (m.index)}
                  {@const isCurrentMonth = calendar.calendarCurrentMonth == m.index}
                  <div class="month" class:current={isCurrentMonth} style:--mc={m.color}>
                    <div class="month-head">
                      <div>
                        <span class="cap">Month {m.index}</span>
                        <div class="month-name">{archonShortName(m.name)}</div>
                      </div>
                      <div class="weeks">
                        <input
                          class="wk num"
                          type="number"
                          min="1"
                          max="12"
                          value={m.weeks}
                          on:change={(e) => setWeeks(m.index, e.target.value)} />
                        <span class="wk-label">Wk</span>
                        <div class="days-count">{m.totalDays} Days</div>
                      </div>
                    </div>
                    <div class="day-grid">
                      {#each m.days as cell (cell.day)}
                        {@const isToday = isCurrentMonth && calendar.calendarCurrentDay == cell.day}
                        <button
                          class="day"
                          class:today={isToday}
                          class:bloodmoon={cell.bloodMoon}
                          title={`Day ${cell.day}${cell.bloodMoon ? ' — Blood Moon' : ''}`}
                          on:click={() => setActiveDay(m.index, cell.day)}>
                          {cell.bloodMoon ? '🔴' : cell.day}
                        </button>
                      {/each}
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>

      <!-- Period of Transition -->
      <div class="transition">
        <div class="t-title">⚠️ Anomalous Distortion Manifested</div>
        <div class="t-phase">Active Phase: Period of Transition</div>
        <p class="t-body">
          Standard physical rules are suspended. Anomaly duration context parameters:
          <input
            class="t-input"
            type="text"
            value={transitionText}
            on:change={(e) => setTransition(e.target.value)} />
        </p>
      </div>
    </div>
  {/if}
</div>

<style>
  .calendar {
    /* Local shorthands → the shared tokens (src/lib/styles/tokens.css). The
       colour names --blood / --blue / --green resolve straight from the canonical
       tokens, so they are not re-declared here. */
    --taint-c: var(--taint);
    --b: var(--border);
    --p: var(--panel);
    --p2: var(--panel-2);
    --p3: var(--panel-3);
    --tx: var(--text);
    --mut: var(--text-muted);
    --gd: var(--gold);
    /* expose the live colour tokens the engine stores into months (rules.js
       emits var(--accent-green|gold|blood) as each month's --mc) */
    --accent-green: var(--green);
    --accent-gold: var(--gold);
    --accent-blood: var(--blood);
    font-family: var(--font-ui);
    color: var(--tx);
    padding: 14px;
    max-width: 1100px;
    margin: 0 auto;
    overflow-y: auto;
  }
  .empty { text-align: center; color: var(--mut); padding: 60px 20px; }
  .empty h2 { font-family: var(--font-display); color: var(--tx); }

  .savebar { font-size: 11px; color: var(--mut); height: 16px; margin-bottom: 6px; text-align: right; }
  .savebar[data-state='saved'] { color: var(--green); }
  .savebar[data-state='error'] { color: var(--blood); }

  .num { font-family: var(--font-data); }
  .cap { font-size: 9px; text-transform: uppercase; letter-spacing: .5px; color: var(--mut); font-weight: 700; }
  .hint { font-size: 11px; color: var(--mut); font-style: italic; }

  .card { background: var(--p); border: 1px solid var(--b); border-left: 5px solid var(--taint-c);
    border-radius: 6px; padding: 14px; }
  .card-title { font-family: var(--font-display); font-size: 16px; color: var(--tx); margin-bottom: 12px;
    display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .badge { font-size: 12px; color: var(--gd); background: #000; border: 1px solid var(--b);
    border-radius: 4px; padding: 3px 8px; font-family: var(--font-data); }

  input, select {
    background: #000; border: 1px solid var(--b); color: var(--tx);
    border-radius: 4px; padding: 4px 6px; font-size: 12px; font-family: inherit;
  }
  input:focus, select:focus { outline: 2px solid var(--gd); outline-offset: -1px; }

  .anchor { background: rgba(0,0,0,.4); border: 1px solid var(--b); border-radius: 4px;
    padding: 16px; text-align: center; margin-bottom: 14px; }
  .anchor-line { display: flex; gap: 10px; align-items: center; justify-content: center; flex-wrap: wrap;
    margin-top: 8px; font-size: 16px; font-weight: 700; }
  .cruc { width: 64px; text-align: center; color: var(--blood); font-size: 16px; font-weight: 700; }
  .age { min-width: 220px; text-align: center; color: #fff; font-size: 16px; font-weight: 700; }
  .orbit { display: inline-flex; align-items: center; gap: 6px; }
  .orbit select { color: var(--gd); font-weight: 700; }

  .rollbar { display: flex; gap: 10px; align-items: center; justify-content: center; flex-wrap: wrap;
    background: rgba(0,0,0,.2); border: 1px solid var(--b); border-radius: 4px; padding: 10px; margin-bottom: 14px; }
  .roll-btn { background: var(--blue); color: #fff; border: 0; border-radius: 4px;
    padding: 7px 14px; font-size: 12px; cursor: pointer; font-family: inherit; }
  .roll-btn:hover { filter: brightness(1.1); }

  .cycles { display: flex; flex-direction: column; gap: 10px; }
  .accordion { border: 1px solid var(--b); border-radius: 4px; overflow: hidden; }
  .trigger { width: 100%; display: flex; align-items: center; justify-content: space-between;
    background: #141419; color: var(--tx); border: 0; border-left: 4px solid var(--b);
    padding: 10px 14px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; }
  .accordion[data-cycle='rejuv'] .trigger { border-left-color: var(--green); }
  .accordion[data-cycle='fest'] .trigger { border-left-color: var(--gd); }
  .accordion[data-cycle='valour'] .trigger { border-left-color: var(--blood); }
  .arrow { color: var(--mut); font-size: 11px; }
  .content { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;
    padding: 15px; background: rgba(0,0,0,.1); }

  .month { background: var(--p3); border: 1px solid var(--b); border-top: 3px solid var(--mc, var(--b));
    border-radius: 4px; padding: 12px; }
  .month.current { border: 2px solid var(--gd); border-top: 3px solid var(--mc, var(--gd));
    box-shadow: 0 0 15px rgba(217, 119, 6, .15); }
  .month-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 5px; margin-bottom: 8px; }
  .month-name { font-size: 12px; font-weight: 700; color: #fff; margin-top: 1px; line-height: 1.2; }
  .weeks { text-align: right; min-width: 75px; }
  .wk { width: 40px; text-align: center; color: var(--gd); font-weight: 700; }
  .wk-label { font-size: 10px; color: var(--mut); font-weight: 700; margin-left: 2px; }
  .days-count { font-size: 9px; color: var(--mut); margin-top: 2px; }

  .day-grid { display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px; margin-top: 10px; justify-items: center; }
  .day { width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;
    border-radius: 3px; font-size: 10px; cursor: pointer; background: rgba(0,0,0,.4);
    border: 1px solid rgba(255,255,255,.05); color: var(--tx); padding: 0;
    font-family: var(--font-data); transition: transform .1s; }
  .day:hover { transform: scale(1.08); }
  .day.bloodmoon { border-color: #f43f5e; color: #f43f5e; font-weight: 700; }
  .day.today { background: var(--gd); color: #000; font-weight: 700; box-shadow: 0 0 8px var(--gd); transform: scale(1.08); }
  .day.today.bloodmoon { background: #f43f5e; color: #000; box-shadow: 0 0 8px #f43f5e; }

  .transition { margin-top: 20px; background: rgba(124, 58, 237, .05);
    border: 1px dashed var(--taint-c); border-radius: 6px; padding: 14px; }
  .t-title { font-weight: 700; color: #c084fc; text-transform: uppercase; font-size: 11px; letter-spacing: 1px; }
  .t-phase { font-size: 14px; margin-top: 6px; font-weight: 700; }
  .t-body { color: var(--mut); font-size: 12px; margin-top: 4px; display: flex; align-items: center;
    gap: 10px; flex-wrap: wrap; }
  .t-input { color: #c084fc; width: 240px; font-weight: 700; text-align: center; }
</style>
