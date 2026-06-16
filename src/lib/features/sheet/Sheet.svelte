<script>
  // Sheet.svelte — the shell for the redesigned character sheet. It owns the ONE
  // `sheet` store (the single source of truth), the System Terminal output, the
  // proficiency lock, and the small transient roll-state; provides them to the
  // card children through context; and is the only place that orchestrates
  // load/save. Persistence itself lives in the feature data layers:
  //   • sheetData.js  — the sheet blob (legacy flat keys + the vesselV2 namespace)
  //   • notesData.js  — the Notes quick-capture card writes the vessel's notes
  //   • deedsData.js  — the Deeds quick card writes the personal deeds slice + AP
  // Each re-fetches and merges on write, so the three never clobber one another
  // (and calendar / unknown keys survive every save).
  import { onDestroy } from 'svelte'
  import { setContext } from 'svelte'
  import { writable, get } from 'svelte/store'
  import { vesselId } from '$lib/core/session.js'
  import { pushToast } from '$lib/core/toast.js'
  import { debounce } from '$lib/core/utils.js'
  import FeatureState from '$lib/components/FeatureState.svelte'

  import { blankSheet, loadSheet, saveSheet } from './sheetData.js'
  import { loadNotes, saveNotes } from '$features/notes/notesData.js'
  import { loadDeeds, savePersonalDeeds } from '$features/deeds/deedsData.js'
  import { makeActions } from './sheetActions.js'
  import { masonry } from './masonry.js'
  import { CTX } from './cards/context.js'
  import './sheet-theme.css'

  import IdentityHeader from './cards/IdentityHeader.svelte'
  import SuccessGritCard from './cards/SuccessGritCard.svelte'
  import AttributesSkillsCard from './cards/AttributesSkillsCard.svelte'
  import SigilsCard from './cards/SigilsCard.svelte'
  import ResonanceCard from './cards/ResonanceCard.svelte'
  import ProficienciesCard from './cards/ProficienciesCard.svelte'
  import ManifestationsCard from './cards/ManifestationsCard.svelte'
  import ArmamentsCard from './cards/ArmamentsCard.svelte'
  import TimeRestCard from './cards/TimeRestCard.svelte'
  import VisionCard from './cards/VisionCard.svelte'
  import TerminalCard from './cards/TerminalCard.svelte'
  import DeedsCard from './cards/DeedsCard.svelte'
  import NotesCard from './cards/NotesCard.svelte'
  import TierLadderCard from './cards/TierLadderCard.svelte'

  // ── the stores the whole feature shares ──
  const sheet = writable(blankSheet())
  const terminal = writable('Awaiting command line execution…')
  const locked = writable(true)
  const transient = writable({ sigilRepairs: 0, lastCombatDamage: 0, lastVision: null, pendingLuck: null })
  const actions = makeActions({ sheet, terminal, transient })
  setContext(CTX, { sheet, terminal, locked, transient, actions })

  let ready = false
  let loading = false
  let loadError = ''
  let saveState = 'idle' // idle | saving | saved | error
  let cur = null
  $: cur = $vesselId

  // ── load: sheet + notes + personal deeds, merged into the one store ──
  let loadedId = undefined
  $: if (cur !== loadedId) loadFor(cur)

  async function loadFor(id) {
    loadedId = id
    ready = false
    loadError = ''
    terminal.set('Awaiting command line execution…')
    transient.set({ sigilRepairs: 0, lastCombatDamage: 0, lastVision: null, pendingLuck: null })
    if (!id) { sheet.set(blankSheet()); return }
    loading = true
    const res = await loadSheet(id)
    if (res.error) { loading = false; loadError = res.error; return }
    const base = res.sheet
    // notes (quick-capture mirror of dynamicVesselNotes)
    const nres = await loadNotes(id)
    base.notes = (nres.notes || []).map((n) => ({ cat: n.category || 'Other', text: n.title || '', detail: n.content || '' }))
    // personal deeds slice + the shared AP total
    const dres = await loadDeeds(id)
    const personal = dres.personal || { dynamicAchievementsList: [], unlockedAchievements: [], advancementPoints: 0 }
    base.deeds = (personal.dynamicAchievementsList || []).map((dd, i) => ({
      title: dd.title || '', desc: dd.desc || '', apValue: dd.apValue || 0, isGlobal: !!dd.isGlobal,
      claimed: (personal.unlockedAchievements || []).includes('p_' + i),
    }))
    base.advancementPoints = personal.advancementPoints
    loading = false
    sheet.set(base)
    ready = true
  }

  // ── three independent debounced savers (each re-fetches + merges) ──
  const saveCore = debounce(async () => {
    if (!ready || !cur) return
    saveState = 'saving'
    const r = await saveSheet(cur, get(sheet))
    if (r.error) { saveState = 'error'; pushToast({ msg: 'Save failed: ' + r.error, kind: 'error' }) }
    else saveState = 'saved'
  }, 700)
  const saveNotesD = debounce(async () => {
    if (!ready || !cur) return
    const s = get(sheet)
    const notes = (s.notes || []).map((n) => ({ title: n.text || '', category: n.cat || 'Other', content: n.detail || '' }))
    const r = await saveNotes(cur, notes)
    if (r.error) pushToast({ msg: 'Notes save failed: ' + r.error, kind: 'error' })
  }, 800)
  const saveDeedsD = debounce(async () => {
    if (!ready || !cur) return
    const s = get(sheet)
    const personal = {
      dynamicAchievementsList: (s.deeds || []).map((dd) => ({ title: dd.title || '', desc: dd.desc || '', apValue: dd.apValue || 0, isGlobal: !!dd.isGlobal })),
      unlockedAchievements: (s.deeds || []).map((dd, i) => (dd.claimed ? 'p_' + i : null)).filter(Boolean),
      advancementPoints: parseInt(s.advancementPoints, 10) || 0,
    }
    const r = await savePersonalDeeds(cur, personal)
    if (r.error) pushToast({ msg: 'Deeds save failed: ' + r.error, kind: 'error' })
  }, 800)

  // Signatures: core excludes notes/deeds so their edits don't trigger a sheet
  // write; AP stays in core AND deeds so a change persists to both (F2 — String
  // in the sheet blob, int in the deeds slice; both loaders tolerate both).
  const coreOf = (s) => { const { notes, deeds, ...rest } = s; return JSON.stringify(rest) }
  $: coreSig = ready ? coreOf($sheet) : ''
  $: if (ready && cur && coreSig) { saveState = 'saving'; saveCore() }
  $: notesSig = ready ? JSON.stringify($sheet.notes || []) : ''
  $: if (ready && cur && notesSig) saveNotesD()
  $: deedsSig = ready ? JSON.stringify({ d: $sheet.deeds || [], ap: $sheet.advancementPoints }) : ''
  $: if (ready && cur && deedsSig) saveDeedsD()

  // ── tap-to-reveal tooltip popover (attached as an action → no markup click
  // handler → no a11y warning). Mirrors the prototype's #tipPop behaviour. ──
  let tipPop
  function tooltipLayer(node) {
    function onClick(e) {
      const t = e.target.closest('[data-tip]')
      if (t && tipPop) {
        tipPop.textContent = t.getAttribute('data-tip')
        const r = t.getBoundingClientRect()
        tipPop.style.left = Math.min(r.left, window.innerWidth - 280) + 'px'
        tipPop.style.top = (r.bottom + 6) + 'px'
        tipPop.classList.add('show')
        e.stopPropagation()
      } else if (tipPop) tipPop.classList.remove('show')
    }
    document.addEventListener('click', onClick, true)
    return { destroy() { document.removeEventListener('click', onClick, true) } }
  }

  function printSheet() { if (typeof window !== 'undefined') window.print() }
</script>

<div class="botw-sheet sheet" use:tooltipLayer>
  {#if !cur}
    <FeatureState title="No vessel selected" message="Choose a character vessel to open its sheet." />
  {:else if loading}
    <FeatureState message="Downloading sheet matrix…" />
  {:else if loadError}
    <FeatureState title="Could not load" message={loadError} />
  {:else}
    <div class="savebar" data-state={saveState}>
      {#if saveState === 'saving'}Saving…{:else if saveState === 'saved'}All changes saved{:else if saveState === 'error'}Save failed — will retry on next edit{/if}
    </div>
    <div class="topbar">
      <h1 class="brand">Blood of the World — The Codex</h1>
      <div class="row">
        <button class="lockbtn" class:unlocked={!$locked} on:click={() => locked.update((v) => !v)}>{$locked ? '🔒 Sheet locked' : '🔓 Editing'}</button>
        <button class="printbtn" on:click={printSheet}>🖨 Print</button>
      </div>
    </div>

    <IdentityHeader />

    <div class="grid" use:masonry>
      <SuccessGritCard />
      <AttributesSkillsCard />
      <SigilsCard />
      <ResonanceCard />
      <ProficienciesCard />
      <ManifestationsCard />
      <ArmamentsCard />
      <TimeRestCard />
      <TerminalCard />
      <VisionCard />
      <DeedsCard />
      <NotesCard />
      <TierLadderCard />
    </div>

    <div id="tipPop" bind:this={tipPop} role="tooltip"></div>
  {/if}
</div>
