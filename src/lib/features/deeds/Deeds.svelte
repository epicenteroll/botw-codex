<script>
  // Deeds.svelte — the "Registry of Deeds" (Vessel Achievements + Global
  // Triumphs), rebuilt the §9 way: two plain objects are the source of truth,
  // the screen reflects them through `bind:`/`$:`, and all AP arithmetic lives
  // in the pure rules.js. There is no getElementById, no innerHTML, no
  // querySelectorAll — saving is "write the object", loading is "set the object".
  //
  // It reads the logged-in vessel (vesselId) and the admin flag (isAdmin) from
  // $lib/core, persists through the feature's own data layer (deedsData.js — the
  // only deeds file that knows about Supabase), and reports through the shared
  // toast store.
  //
  // Two stores, two save paths (deeds straddle two blobs, §8):
  //   • `personal` (this vessel's deeds, claim ledger, AP) lives in the vessel's
  //     own sheet_data → autosaved via the house serialize-watch, exactly like
  //     Calendar: any edit MERGES the three personal keys over the re-fetched
  //     blob so sheet/calendar/notes keys survive.
  //   • `global` (campaign-wide triumphs) lives in the shared __GLOBAL_CAMPAIGN__
  //     row → written ONLY by the admin-only triumph mutators (add/edit/remove),
  //     each queueing a debounced merge-save. We deliberately do NOT blanket-
  //     autosave the shared row on mere viewing, so a non-admin (or an admin just
  //     looking) never writes it; only a genuine triumph edit does.
  //
  // All author-entered text (deed titles, descriptions, "achieved by/when") is
  // rendered exclusively through Svelte `{…}` interpolation and `bind:value`,
  // both of which escape automatically — so the §5 rule-1 / safety obligation is
  // met without hand-calling utils `s()` (there is no innerHTML path here, unlike
  // the live site that built card markup by hand and had to escape it).

  import { vesselId, isAdmin } from '$lib/core/session.js'
  import { pushToast } from '$lib/core/toast.js'
  import { debounce } from '$lib/core/utils.js'
  import FeatureState from '$lib/components/FeatureState.svelte'
  import {
    blankPersonal, blankGlobal, loadDeeds, savePersonalDeeds, saveGlobalTriumphs,
  } from './deedsData.js'
  import {
    AP_MIN, AP_MAX, PERSONAL_PREFIX, GLOBAL_PREFIX,
    clampAP, clampApValue, apRewardOf, claimKey, isClaimed, applyClaimToggle,
    blankPersonalDeed, blankGlobalTriumph,
  } from './rules.js'

  let personal = blankPersonal()
  let global = blankGlobal()
  let globalExists = true

  let ready = false // true once loaded; gates the personal autosave
  let loading = false
  let loadError = ''
  let saveState = 'idle' // idle | saving | saved | error

  // AP-override control (admin only) — local UI state, never read out of the DOM.
  let apOverrideInput = ''
  let apFeedback = false
  let apFeedbackTimer

  let currentVesselId = null
  $: currentVesselId = $vesselId
  let admin = false
  $: admin = $isAdmin

  // ── Load whenever the selected vessel changes ──────────────────────────────
  // Unlike the sheet/calendar, we load even when no vessel is selected: the
  // global triumphs are visible to every logged-in account, so we still fetch
  // the shared row (personal stays blank until a vessel is chosen).
  let loadedId = undefined
  $: if (currentVesselId !== loadedId) loadFor(currentVesselId)

  async function loadFor(id) {
    loadedId = id
    ready = false
    loadError = ''
    loading = true
    const res = await loadDeeds(id)
    loading = false
    if (res.error) {
      loadError = res.error
      personal = blankPersonal()
      return
    }
    personal = res.personal
    global = res.global
    globalExists = res.globalExists
    ready = true
  }

  // ── Personal autosave: when the personal object changes (after load), persist
  //    a moment later. Identical mechanism to Calendar's autosave. ────────────
  const flushPersonal = debounce(async () => {
    if (!ready || !currentVesselId) return
    saveState = 'saving'
    const res = await savePersonalDeeds(currentVesselId, personal)
    if (res.error) {
      saveState = 'error'
      pushToast({ msg: 'Save failed: ' + res.error, kind: 'error' })
    } else {
      saveState = 'saved'
    }
  }, 700)

  // JSON.stringify touches every field, so this re-runs on any personal edit.
  $: serializedPersonal = JSON.stringify(personal)
  $: if (ready && currentVesselId && serializedPersonal) {
    saveState = 'saving'
    flushPersonal()
  }

  // ── Global save: queued only by the admin-only triumph mutators below. ──────
  const flushGlobal = debounce(async () => {
    saveState = 'saving'
    const res = await saveGlobalTriumphs(global)
    if (res.missing) {
      globalExists = false
      saveState = 'error'
      pushToast({
        msg: 'The Global Triumphs record does not exist yet — create the __GLOBAL_CAMPAIGN__ row in Supabase first.',
        kind: 'error',
      })
    } else if (res.error) {
      saveState = 'error'
      pushToast({ msg: 'Save failed: ' + res.error, kind: 'error' })
    } else {
      saveState = 'saved'
    }
  }, 700)

  function queueGlobalSave() {
    saveState = 'saving'
    flushGlobal()
  }

  // ── Reactive "is this card claimed" lookups ────────────────────────────────
  // Claims for BOTH personal ('p_i') and global ('g_i') deeds live in the
  // vessel's unlockedAchievements list, so both read from `personal`.
  $: claimedKeys = personal.unlockedAchievements || []
  // (referenced via isClaimed(...) in markup so it recomputes with claimedKeys)

  // ── Mutators — each writes the object; the appropriate save path picks it up ─
  // Touching the top-level variable guarantees the serialize-watch / queued save
  // fires regardless of Svelte's nested-binding invalidation.
  const touchPersonal = () => (personal = personal)
  const touchGlobal = () => {
    global = global
    queueGlobalSave()
  }

  // Personal deed: clamp an AP-reward edit the way the live saveDeedField does
  // (floor at 0). Title/desc bind directly; this only normalises apValue.
  function clampPersonalAp(i) {
    const d = personal.dynamicAchievementsList[i]
    if (d) d.apValue = clampApValue(d.apValue)
    touchPersonal()
  }

  // Add a personal deed (live: createNewDynamicAchievement(false)). Requires a
  // vessel; any owner/editor may add.
  function addPersonalDeed() {
    if (!currentVesselId) {
      pushToast({ msg: 'Select a vessel first to add a personal deed.', kind: 'warn' })
      return
    }
    personal.dynamicAchievementsList = [...personal.dynamicAchievementsList, blankPersonalDeed()]
    touchPersonal()
  }

  // Remove a personal deed (live: removeDeedEntry(i, false)). Faithful to the
  // live behaviour, the claim ledger is NOT re-indexed on removal.
  function removePersonalDeed(i) {
    if (!window.confirm('Remove this deed permanently?')) return
    personal.dynamicAchievementsList = personal.dynamicAchievementsList.filter((_, idx) => idx !== i)
    touchPersonal()
  }

  // Global triumph: clamp an AP-reward edit (admin only — UI is gated).
  function clampGlobalAp(i) {
    const t = global.dynamicAchievementsList[i]
    if (t) t.apValue = clampApValue(t.apValue)
    touchGlobal()
  }

  // Add a global triumph (live: createNewDynamicAchievement(true)). Admin only;
  // requires the shared row to exist.
  function addGlobalTriumph() {
    if (!admin) return
    if (!globalExists) {
      pushToast({
        msg: 'The Global Triumphs record does not exist yet — create the __GLOBAL_CAMPAIGN__ row in Supabase first.',
        kind: 'error',
      })
      return
    }
    global.dynamicAchievementsList = [...global.dynamicAchievementsList, blankGlobalTriumph()]
    touchGlobal()
  }

  // Remove a global triumph (live: removeDeedEntry(i, true)). Admin only.
  function removeGlobalTriumph(i) {
    if (!admin) return
    if (!window.confirm('Remove this triumph permanently?')) return
    global.dynamicAchievementsList = global.dynamicAchievementsList.filter((_, idx) => idx !== i)
    touchGlobal()
  }

  // Toggle a deed/triumph claim and award/retract its AP (live:
  // togglePlayerDeedClaim). Requires a vessel AND admin — only admins may award
  // AP via claims. Writes to the VESSEL (claims + AP both live there).
  function toggleClaim(prefix, i, reward) {
    if (!currentVesselId) {
      pushToast({ msg: 'Select a vessel from the top bar to claim deeds and receive AP rewards.', kind: 'warn' })
      return
    }
    if (!admin) {
      pushToast({ msg: 'AP rewards can only be assigned by an admin account.', kind: 'warn' })
      return
    }
    const key = claimKey(prefix, i)
    const { unlocked, ap } = applyClaimToggle(personal.advancementPoints, personal.unlockedAchievements, key, reward)
    personal.unlockedAchievements = unlocked
    personal.advancementPoints = ap
    touchPersonal()
  }

  // Admin: directly correct the active vessel's AP total (live:
  // adminOverrideAPValue). Clamps to 0–57.
  function applyApOverride() {
    if (!admin || !currentVesselId) return
    if (apOverrideInput === '' || apOverrideInput === null) {
      pushToast({ msg: 'Enter an AP value (0–57) before applying.', kind: 'warn' })
      return
    }
    personal.advancementPoints = clampAP(apOverrideInput)
    apOverrideInput = ''
    touchPersonal()
    apFeedback = true
    clearTimeout(apFeedbackTimer)
    apFeedbackTimer = setTimeout(() => (apFeedback = false), 2500)
  }
</script>

<svelte:head><title>Blood of the World — Deeds</title></svelte:head>

{#if loading}
  <FeatureState message="Consulting the Registry of Deeds…" />
{:else if loadError}
  <FeatureState title="Could not load" message={loadError} />
{:else}
  <div class="deeds">
    <div class="savebar" data-state={saveState}>
      {#if saveState === 'saving'}Saving…{:else if saveState === 'saved'}All changes saved{:else if saveState === 'error'}Save failed — will retry on next edit{/if}
    </div>

    <!-- ── ADMIN CONTROL PANEL ── hidden from non-admin accounts ── -->
    {#if admin}
      <div class="admin-panel">
        <div class="admin-tag">
          <span class="admin-flag">⚔ Admin Mode Active</span>
          <span class="admin-note">— Global Triumphs are editable. Use the + Add Triumph button on the right panel.</span>
        </div>
        <div class="ap-override">
          <span class="ovr-label">AP Override</span>
          <span class="ovr-sub">(active vessel)</span>
          <input
            class="ovr-input num"
            type="number"
            min={AP_MIN}
            max={AP_MAX}
            placeholder="0–57"
            disabled={!currentVesselId}
            bind:value={apOverrideInput}
            on:keydown={(e) => e.key === 'Enter' && applyApOverride()} />
          <button class="apply-btn" disabled={!currentVesselId} on:click={applyApOverride}>Apply Correction</button>
          {#if currentVesselId}<span class="cur-ap num">Current AP: {personal.advancementPoints}</span>{/if}
          {#if apFeedback}<span class="ok">✓ Saved</span>{/if}
        </div>
      </div>
    {/if}

    <div class="grids">
      <!-- ── Vessel Achievements (personal) ─────────────────────────────── -->
      <section class="card personal">
        <div class="card-title">
          Vessel Achievements
          <span class="title-side">
            <span class="hint">Tied to active character file</span>
            {#if currentVesselId}
              <button class="add-btn gold" on:click={addPersonalDeed}>+ Add Deed</button>
            {/if}
          </span>
        </div>
        <p class="blurb">Personal choices, context tracking, and narrative footprints completed by this specific vessel.</p>

        <div class="grid">
          {#if !currentVesselId}
            <div class="placeholder">Select a vessel from the top bar to view personal chronicle milestones.</div>
          {:else if personal.dynamicAchievementsList.length === 0}
            <div class="note">No personal deeds recorded yet for this vessel.</div>
          {:else}
            {#each personal.dynamicAchievementsList as deed, i (i)}
              {@const claimed = isClaimed(claimedKeys, PERSONAL_PREFIX, i)}
              <div class="deed" class:claimed>
                <div class="deed-row">
                  <div class="deed-fields">
                    <input
                      class="title-in"
                      type="text"
                      placeholder="Deed Title..."
                      bind:value={deed.title}
                      on:input={touchPersonal} />
                    <textarea
                      class="desc-in"
                      placeholder="Short description or condition..."
                      bind:value={deed.desc}
                      on:input={touchPersonal}></textarea>
                  </div>
                  <div class="deed-side">
                    {#if admin}
                      <input
                        class="ap-in num"
                        type="number"
                        min={AP_MIN}
                        max={AP_MAX}
                        title="AP reward"
                        bind:value={deed.apValue}
                        on:change={() => clampPersonalAp(i)} />
                      <span class="ap-cap">AP</span>
                    {:else}
                      <span class="ap-pill num">+{apRewardOf(deed)}</span>
                      <span class="ap-cap">AP</span>
                    {/if}
                    <button
                      class="chk"
                      class:active={claimed}
                      aria-pressed={claimed}
                      title={claimed ? 'Mark unclaimed' : 'Claim deed'}
                      on:click={() => toggleClaim(PERSONAL_PREFIX, i, apRewardOf(deed))}></button>
                    <button class="del-btn" title="Remove deed" on:click={() => removePersonalDeed(i)}>✕</button>
                  </div>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </section>

      <!-- ── Global Triumphs (campaign-wide) ────────────────────────────── -->
      <section class="card global">
        <div class="card-title">
          Global Triumphs
          <span class="title-side">
            <span class="hint">Shared World Campaign</span>
            {#if admin}
              <button class="add-btn blood" on:click={addGlobalTriumph}>+ Add Triumph</button>
            {/if}
          </span>
        </div>
        <p class="blurb">Macro-level history events achieved by the party that permanently shift the baseline setting layout.</p>

        <div class="grid">
          {#if global.dynamicAchievementsList.length === 0}
            <div class="note">No global campaign triumphs have been recorded yet.</div>
          {:else}
            {#each global.dynamicAchievementsList as t, i (i)}
              {@const claimed = isClaimed(claimedKeys, GLOBAL_PREFIX, i)}
              {#if admin}
                <!-- Admin: fully editable triumph card -->
                <div class="deed" class:claimed>
                  <div class="deed-row">
                    <div class="deed-fields">
                      <input
                        class="title-in"
                        type="text"
                        placeholder="Triumph Title..."
                        bind:value={t.title}
                        on:input={touchGlobal} />
                      <textarea
                        class="desc-in"
                        placeholder="Describe the global event..."
                        bind:value={t.desc}
                        on:input={touchGlobal}></textarea>
                      <div class="meta-grid">
                        <input
                          class="title-in meta"
                          type="text"
                          placeholder="Accomplished by..."
                          bind:value={t.achievedBy}
                          on:input={touchGlobal} />
                        <input
                          class="title-in meta"
                          type="text"
                          placeholder="Date / Session..."
                          bind:value={t.achievedWhen}
                          on:input={touchGlobal} />
                      </div>
                    </div>
                    <div class="deed-side">
                      <input
                        class="ap-in num"
                        type="number"
                        min={AP_MIN}
                        max={AP_MAX}
                        title="AP reward"
                        bind:value={t.apValue}
                        on:change={() => clampGlobalAp(i)} />
                      <span class="ap-cap">AP</span>
                      <button
                        class="chk"
                        class:active={claimed}
                        aria-pressed={claimed}
                        title={claimed ? 'Mark unclaimed' : 'Claim triumph'}
                        on:click={() => toggleClaim(GLOBAL_PREFIX, i, apRewardOf(t))}></button>
                      <button class="del-btn" title="Remove triumph" on:click={() => removeGlobalTriumph(i)}>✕</button>
                    </div>
                  </div>
                </div>
              {:else}
                <!-- Non-admin: read-only triumph view -->
                <div class="deed ro" class:claimed>
                  <div class="ro-head">
                    <div class="ro-text">
                      <div class="ro-title" class:gold={claimed}>{t.title || 'Untitled Triumph'}</div>
                      <div class="ro-desc">{t.desc}</div>
                    </div>
                    <div class="ro-side">
                      <span class="ap-pill num">+{apRewardOf(t)} AP</span>
                      <button
                        class="chk"
                        class:active={claimed}
                        aria-pressed={claimed}
                        title={claimed ? 'Claimed' : 'Claim triumph'}
                        on:click={() => toggleClaim(GLOBAL_PREFIX, i, apRewardOf(t))}></button>
                    </div>
                  </div>
                  <div class="ro-meta">
                    <div>Accomplished By: <strong>{t.achievedBy || 'Unrecorded'}</strong></div>
                    <div>Recorded: <strong>{t.achievedWhen || 'Unknown'}</strong></div>
                  </div>
                </div>
              {/if}
            {/each}
          {/if}
        </div>
      </section>
    </div>
  </div>
{/if}

<style>
  .deeds {
    /* Local shorthands → the shared tokens (src/lib/styles/tokens.css). The
       colour names --blood / --green resolve straight from the canonical
       tokens, so they are not re-declared here. */
    --b: var(--border);
    --p: var(--panel);
    --tx: var(--text);
    --mut: var(--text-muted);
    --gd: var(--gold);
    font-family: var(--font-ui);
    color: var(--tx);
    padding: 14px;
    max-width: 1150px;
    margin: 0 auto;
    overflow-y: auto;
  }
  /* Empty / loading / error states now use the shared FeatureState component
     ($lib/components/FeatureState.svelte) — task D. */

  .savebar { font-size: 11px; color: var(--mut); height: 16px; margin-bottom: 6px; text-align: right; }
  .savebar[data-state='saved'] { color: var(--green); }
  .savebar[data-state='error'] { color: var(--blood); }

  .num { font-family: var(--font-data); }
  .hint { font-size: 9px; color: var(--mut); }

  /* ── Admin control panel ── */
  .admin-panel {
    background: rgba(153, 27, 27, 0.07); border: 1px solid rgba(153, 27, 27, 0.35);
    border-radius: 6px; padding: 12px; margin-bottom: 16px;
    display: flex; gap: 14px; flex-wrap: wrap; align-items: center; justify-content: space-between;
  }
  .admin-tag { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .admin-flag { font-size: 11px; font-weight: 700; color: #f87171; text-transform: uppercase; letter-spacing: .5px; }
  .admin-note { font-size: 10px; color: var(--mut); font-style: italic; }
  .ap-override {
    display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
    border-left: 1px solid rgba(153, 27, 27, 0.3); padding-left: 14px;
  }
  .ovr-label { font-size: 11px; color: var(--mut); }
  .ovr-sub { font-size: 10px; color: var(--mut); font-style: italic; }
  .ovr-input { width: 62px; text-align: center; color: var(--gd); font-weight: 700; }
  .cur-ap { font-size: 11px; color: var(--gd); font-weight: 700; }
  .ok { font-size: 11px; color: #4ade80; }
  .apply-btn { background: var(--blue); color: #fff; border: 0; border-radius: 4px;
    padding: 5px 12px; font-size: 11px; font-weight: 700; cursor: pointer; font-family: inherit; }
  .apply-btn:hover:not(:disabled) { filter: brightness(1.1); }
  .apply-btn:disabled, .ovr-input:disabled { opacity: .5; cursor: default; }

  input, textarea {
    background: rgba(0,0,0,.35); border: 1px solid var(--b); color: var(--tx);
    border-radius: 4px; padding: 5px 8px; font-size: 12px; font-family: inherit;
  }
  input:focus, textarea:focus { outline: none; border-color: var(--gd); }

  /* ── Two-column grid of cards ── */
  .grids { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
  @media (max-width: 760px) { .grids { grid-template-columns: 1fr; } }

  .card { background: var(--p); border: 1px solid var(--b); border-radius: 6px; padding: 14px;
    display: flex; flex-direction: column; }
  .card.personal { border-left: 5px solid var(--gd); }
  .card.global { border-left: 5px solid var(--blood); }
  .card-title { font-family: var(--font-display); font-size: 16px; color: var(--tx);
    display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .title-side { display: flex; gap: 8px; align-items: center; }
  .blurb { font-size: 11px; color: var(--mut); font-style: italic; margin: 8px 0 15px; }

  .add-btn { border: 0; border-radius: 4px; font-size: 10px; padding: 3px 9px; font-weight: 700;
    cursor: pointer; font-family: inherit; }
  .add-btn.gold { background: var(--gd); color: #000; }
  .add-btn.blood { background: var(--blood); color: #fff; }
  .add-btn:hover { filter: brightness(1.1); }

  .grid { display: flex; flex-direction: column; gap: 10px; overflow-y: auto; max-height: 600px; padding-right: 5px; }
  .placeholder, .note { color: var(--mut); font-style: italic; font-size: 12px; padding: 8px; }
  .placeholder { border: 1px dashed var(--b); border-radius: 4px; text-align: center; }

  /* ── A deed/triumph card ── */
  .deed { background: rgba(0,0,0,.15); border: 1px solid var(--b); border-radius: 6px; padding: 12px; }
  .deed.claimed { background: rgba(25,20,15,.4); border-color: var(--gd); }
  .deed-row { display: flex; gap: 10px; align-items: flex-start; }
  .deed-fields { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .deed-side { display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 56px; }

  .title-in { width: 100%; font-weight: 700; color: #fff; }
  .title-in.meta { font-size: 11px; font-weight: 400; }
  .desc-in { width: 100%; resize: none; height: 52px; margin-top: 4px; line-height: 1.4;
    color: var(--mut); border-color: transparent; background: rgba(0,0,0,.25); font-size: 11px; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 4px; }

  .ap-in { width: 42px; text-align: center; color: var(--gd); font-weight: 700; font-size: 11px;
    padding: 3px; background: #000; }
  .ap-cap { font-size: 9px; color: var(--mut); text-transform: uppercase; }
  .ap-pill { font-size: 11px; font-weight: 700; color: var(--gd); background: rgba(217,119,6,.05);
    border-radius: 20px; padding: 2px 8px; }

  .chk { width: 16px; height: 16px; border: 1px solid var(--b); background: rgba(0,0,0,.3);
    border-radius: 2px; cursor: pointer; position: relative; padding: 0; }
  .chk.active { background: var(--green); border-color: var(--green); }
  .chk.active::after { content: '✓'; position: absolute; top: -4px; left: 1px; font-size: 11px; color: #fff; }
  .chk:hover { border-color: var(--gd); }

  .del-btn { background: #4a1212; color: #f87171; border: 0; width: 20px; height: 20px; border-radius: 3px;
    cursor: pointer; font-size: 10px; font-weight: 700; display: flex; align-items: center; justify-content: center;
    opacity: .5; transition: opacity .15s; }
  .del-btn:hover { opacity: 1; }

  /* ── Read-only triumph (non-admin) ── */
  .deed.ro { display: flex; flex-direction: column; gap: 0; }
  .ro-head { display: flex; align-items: center; gap: 10px; justify-content: space-between; }
  .ro-text { flex: 1; }
  .ro-title { font-weight: 700; font-size: 12px; color: #fff; }
  .ro-title.gold { color: var(--gd); }
  .ro-desc { font-size: 11px; color: var(--mut); margin-top: 3px; line-height: 1.3; }
  .ro-side { display: flex; align-items: center; gap: 8px; justify-content: flex-end; min-width: 70px; }
  .ro-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px;
    border-top: 1px dashed rgba(255,255,255,.05); padding-top: 6px; font-size: 11px; color: var(--mut); }
  .ro-meta strong { color: #fff; }
</style>
