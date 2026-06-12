<script>
  // Notes.svelte — the "World Chronicles" / "World Memory Archives", rebuilt the
  // §9 way: a single `notes` array is the source of truth, the screen reflects it
  // through `bind:` and reactive `$:`, and all book/page logic lives in the pure
  // rules.js. There is no getElementById, no innerHTML, no querySelectorAll —
  // saving is "write the array", loading is "set the array". The book tabs, the
  // page-index entries, "+ Inscribe Page" and "Incinerate Page" are all real
  // <button>s.
  //
  // It reads the logged-in vessel from $lib/core (vesselId), persists through the
  // feature's own data layer (notesData.js — the only notes file that knows about
  // Supabase), and reports through the shared toast store. Notes are SINGLE-BLOB
  // like the calendar: they live in the vessel's own sheet_data under
  // `dynamicVesselNotes`, so there is no shared/global row, and every save MERGES
  // that one key over the re-fetched blob so sheet/calendar/deeds keys survive.
  //
  // ── §5 rule 1 / safety is the headline for this feature ──────────────────────
  // Page titles and page content are entirely author-entered free text. The live
  // site built its page-index list with `innerHTML +=` and interpolated the raw
  // title straight in — a stored-XSS path (a title of `<img onerror=…>` would
  // execute). This rebuild has NO innerHTML path at all: every piece of author
  // text is rendered through Svelte `{…}` interpolation (the page-index captions
  // via pageLabel(), the badge numbers) or two-way `bind:value` (the title field
  // and the body textarea). Both auto-escape on render, so a malicious title is
  // shown as literal text, never executed. utils `s()` is the escape we would
  // reach for if anything were ever hand-assembled into an HTML string — there is
  // deliberately no such path here, so calling it in the render path would only
  // double-escape; the safety guarantee is structural.

  import { vesselId } from '$lib/core/session.js'
  import { pushToast } from '$lib/core/toast.js'
  import { debounce } from '$lib/core/utils.js'
  import { blankNotes, loadNotes, saveNotes } from './notesData.js'
  import {
    BOOKS, DEFAULT_BOOK, NO_PAGE,
    pageLabel, pagesInBook, bookCounts, clampPointer, virtualToReal,
    activePageAt, showWorkstation, blankPage,
  } from './rules.js'

  let notes = blankNotes()
  let activeBook = DEFAULT_BOOK // which volume is open (live: activeLedgerCategoryBook)
  let pointer = NO_PAGE // raw page pointer within the active book (live: activeLedgerPagePointerIndex)

  let ready = false // true once a vessel is loaded; gates autosave
  let loading = false
  let loadError = ''
  let saveState = 'idle' // idle | saving | saved | error

  let currentVesselId = null
  $: currentVesselId = $vesselId

  // ── Load whenever the selected vessel changes (mirrors Calendar). ───────────
  let loadedId = undefined
  $: if (currentVesselId !== loadedId) loadFor(currentVesselId)

  async function loadFor(id) {
    loadedId = id
    ready = false
    loadError = ''
    pointer = NO_PAGE // let the clamp below select the book's first page
    if (!id) {
      notes = blankNotes()
      return
    }
    loading = true
    const res = await loadNotes(id)
    loading = false
    if (res.error) {
      loadError = res.error
      notes = blankNotes()
      return
    }
    notes = res.notes
    ready = true
  }

  // ── Autosave: when the notes array changes (after load), persist a moment
  //    later. Identical mechanism to Calendar's autosave. Switching books or
  //    selecting a page touches only activeBook/pointer (not `notes`), so — as on
  //    the live site — mere navigation never writes; only add/edit/delete do. ──
  const flushSave = debounce(async () => {
    if (!ready || !currentVesselId) return
    saveState = 'saving'
    const res = await saveNotes(currentVesselId, notes)
    if (res.error) {
      saveState = 'error'
      pushToast({ msg: 'Save failed: ' + res.error, kind: 'error' })
    } else {
      saveState = 'saved'
    }
  }, 700)

  // JSON.stringify touches every field, so this re-runs on any notes edit.
  $: serialized = JSON.stringify(notes)
  $: if (ready && currentVesselId && serialized) {
    saveState = 'saving'
    flushSave()
  }

  // ── Derived view state (recompute automatically) ────────────────────────────
  $: counts = bookCounts(notes)
  $: activePages = pagesInBook(notes, activeBook)
  // The live loader writes the clamped pointer back; we instead derive a clamped
  // `safePointer` and leave `pointer` as raw intent — same result, no reactive
  // self-assignment. Everything "current" reads safePointer.
  $: safePointer = clampPointer(pointer, activePages.length)
  $: activePage = activePageAt(activePages, safePointer)
  $: workstationOpen = showWorkstation(activePage)
  // The real index of the active page in the unfiltered `notes` store (the live
  // virtual→real walk). The workstation binds title/body straight to this
  // element of the plain `notes` array — the same idiom Deeds uses to bind an
  // array element — so a `bind:value` write mutates the store directly and the
  // serialize-watch autosaves. -1 only when no page is active (guarded by
  // workstationOpen), so inside the editor block it is always a valid index.
  $: realIndex = activePage ? virtualToReal(notes, activeBook, safePointer) : -1

  // ── Mutators (each just writes the relevant state; autosave picks up `notes`
  //    changes). Touching the top-level `notes` variable guarantees the
  //    serialize-watch fires even when an edit lands on a nested field. ─────────
  const touch = () => (notes = notes)

  // Switch book volume (live: switchActiveLedgerBook — set the book, reset the
  // pointer to 0; the clamp then lands on the first page, or the empty state).
  function switchBook(key) {
    activeBook = key
    pointer = 0
  }

  // Select a page within the active book (live: selectLedgerPageNode).
  function selectPage(virtualIdx) {
    pointer = virtualIdx
  }

  // Add a page to the active book (live: createNewPageInActiveBook — push a blank
  // page, then point at it as the last page in this book). Requires a vessel.
  function addPage() {
    if (!currentVesselId) {
      pushToast({ msg: 'Select a vessel from the top bar to inscribe a page.', kind: 'warn' })
      return
    }
    notes = [...notes, blankPage(activeBook)]
    pointer = pagesInBook(notes, activeBook).length - 1
  }

  // Delete the active page (live: purgeActiveNoteNodeFromLedger — map the virtual
  // pointer to the real array index, splice, reset the pointer to 0). Requires a
  // vessel and an active page.
  function purgePage() {
    if (!currentVesselId || !activePage) return
    if (!window.confirm('Permanently delete and incinerate this chronicle page index? This cannot be undone.'))
      return
    const realIndex = virtualToReal(notes, activeBook, safePointer)
    if (realIndex < 0) return
    notes = notes.filter((_, idx) => idx !== realIndex)
    pointer = 0
  }
</script>

<svelte:head><title>Blood of the World — Notes</title></svelte:head>

<div class="notes">
  {#if loading}
    <div class="empty"><p>Consulting the World Memory Archives…</p></div>
  {:else if loadError}
    <div class="empty"><h2>Could not load</h2><p>{loadError}</p></div>
  {:else}
    <div class="savebar" data-state={saveState}>
      {#if saveState === 'saving'}Saving…{:else if saveState === 'saved'}All changes saved{:else if saveState === 'error'}Save failed — will retry on next edit{/if}
    </div>

    <section class="card">
      <div class="card-title">The World Memory Archives</div>

      {#if !currentVesselId}
        <div class="placeholder">Select a vessel from the top bar to open its chronicle volumes.</div>
      {:else}
        <div class="ledger">
          <!-- ── Sidebar: book volumes + page index ── -->
          <aside class="sidebar">
            <span class="sidebar-label">Select Book Volume</span>

            {#each BOOKS as book (book.key)}
              <button
                class="book-tab"
                class:active={activeBook === book.key}
                on:click={() => switchBook(book.key)}>
                <span>{book.label}</span>
                <span class="badge num">{counts[book.key]}</span>
              </button>
            {/each}

            <button class="inscribe-btn" on:click={addPage}>+ Inscribe Page</button>

            <div class="page-index">
              {#if activePages.length === 0}
                <span class="index-empty">Book volume is empty.</span>
              {:else}
                {#each activePages as note, i (i)}
                  <button
                    class="index-item"
                    class:active={i === safePointer}
                    title={pageLabel(note.title)}
                    on:click={() => selectPage(i)}>{pageLabel(note.title)}</button>
                {/each}
              {/if}
            </div>
          </aside>

          <!-- ── Workstation: the active page editor ── -->
          <div class="workstation">
            {#if !workstationOpen}
              <div class="ws-empty">
                Select an inscribed page from the left index or forge a new page to update the chronicle records database.
              </div>
            {:else}
              <div class="ws-head">
                <input
                  class="ws-title"
                  type="text"
                  placeholder="Page Heading Assignment..."
                  bind:value={notes[realIndex].title}
                  on:input={touch} />
                <button class="incinerate-btn" on:click={purgePage}>Incinerate Page</button>
              </div>
              <textarea
                class="ws-body"
                placeholder="Inscribe session observations, transcript records, or faction details..."
                bind:value={notes[realIndex].content}
                on:input={touch}></textarea>
            {/if}
          </div>
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  /* Local shorthands → the shared tokens (src/lib/styles/tokens.css). Notes'
     accent is the blue the live "World Memory Archives" panel used (§6: blue =
     info / notes). The colour names --blue / --blood / --green resolve straight
     from the canonical tokens, so they are not re-declared here. */
  .notes {
    --b: var(--border);
    --p: var(--panel);
    --tx: var(--text);
    --mut: var(--text-muted);
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

  .card { background: var(--p); border: 1px solid var(--b); border-left: 5px solid var(--blue);
    border-radius: 6px; padding: 14px; }
  .card-title { font-family: var(--font-display); font-size: 16px; color: var(--tx); margin-bottom: 14px; }

  .placeholder { color: var(--mut); font-style: italic; font-size: 12px; padding: 14px;
    border: 1px dashed var(--b); border-radius: 4px; text-align: center; }

  /* ── Two-column ledger: sidebar + workstation ── */
  .ledger { display: grid; grid-template-columns: 240px 1fr; gap: 20px; min-height: 580px; }
  @media (max-width: 720px) { .ledger { grid-template-columns: 1fr; } }

  .sidebar { background: #111115; border: 1px solid var(--b); border-radius: 6px; padding: 12px;
    display: flex; flex-direction: column; gap: 8px; }
  .sidebar-label { font-size: 10px; font-weight: 700; color: var(--mut); text-transform: uppercase;
    letter-spacing: .5px; margin-bottom: 5px; }

  .book-tab { background: #1e1e24; color: var(--mut); border: 1px solid transparent; padding: 10px 12px;
    border-radius: 4px; cursor: pointer; text-align: left; font-weight: 700; font-size: 12px;
    font-family: inherit; transition: all .15s; display: flex; justify-content: space-between; align-items: center; }
  .book-tab:hover { background: #25252e; color: #fff; }
  .book-tab.active { background: #000; border-color: var(--blue); color: #fff; }

  .badge { font-size: 10px; padding: 2px 6px; border-radius: 10px; font-weight: 700;
    background: rgba(255, 255, 255, .05); color: var(--mut); }

  .inscribe-btn { background: var(--blue); color: #fff; border: 0; border-radius: 4px; margin-top: 15px;
    width: 100%; font-size: 11px; font-weight: 700; padding: 8px; cursor: pointer; font-family: inherit; }
  .inscribe-btn:hover { filter: brightness(1.1); }

  .page-index { display: flex; flex-direction: column; gap: 4px; margin-top: 10px; overflow-y: auto;
    max-height: 380px; border-top: 1px solid var(--b); padding-top: 10px; }
  .index-empty { font-size: 11px; color: var(--mut); font-style: italic; padding: 6px; }
  .index-item { background: transparent; color: var(--mut); border: none; padding: 6px 8px; border-radius: 3px;
    cursor: pointer; text-align: left; font-size: 11px; font-family: inherit; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; }
  .index-item:hover { background: rgba(255, 255, 255, .03); color: #fff; }
  .index-item.active { background: rgba(3, 105, 161, .15); color: #38bdf8; font-weight: 700; }

  .workstation { background: #0b0b0d; border: 1px solid var(--b); border-radius: 6px; padding: 20px;
    display: flex; flex-direction: column; gap: 15px; min-height: 550px; }
  .ws-empty { display: flex; flex: 1; align-items: center; justify-content: center; color: var(--mut);
    font-style: italic; font-size: 13px; text-align: center; }

  .ws-head { display: flex; gap: 10px; align-items: center; }
  .ws-title { flex: 1; font-size: 15px; font-weight: 700; padding: 8px 12px; color: var(--tx);
    background: rgba(0, 0, 0, .35); border: 1px solid var(--b); border-radius: 4px; font-family: inherit; }
  .ws-title:focus { outline: none; border-color: var(--blue); }

  .incinerate-btn { background: #4a1212; color: #ff8888; font-weight: 700; padding: 6px 12px; border: 0;
    border-radius: 4px; cursor: pointer; font-size: 12px; font-family: inherit; }
  .incinerate-btn:hover { filter: brightness(1.15); }

  .ws-body { flex: 1; min-height: 400px; padding: 12px; font-size: 13px; line-height: 1.5; resize: vertical;
    color: var(--tx); background: rgba(0, 0, 0, .35); border: 1px solid var(--b); border-radius: 4px;
    font-family: inherit; }
  .ws-body:focus { outline: none; border-color: var(--blue); }
</style>
