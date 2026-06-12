// rules.js — the World Chronicles / "World Memory Archives" book-and-page logic,
// pure and side-effect-free (§5 rule 3, §9).
//
// Every definition and formula here is ported VERBATIM from the live monolith
// (HTML_live.txt): the four book/category keys and their volume labels, the
// per-book page filtering, the per-book page counts (badge numbers), the
// virtual-index ↔ real-array mapping (the live `targetCounter` walk used by both
// the save-field path and the purge path), the loader's pointer clamp, the
// "Untitled Inscribed Page" / "New Page Designation" labels, and the blank-page
// factory. The only thing removed is the DOM and Supabase — these functions take
// plain values and return plain values or NEW objects/arrays. They never read
// the page and never touch the database, so they are trivial to verify and
// impossible to break by editing the UI.
//
// Start points in the live file (all ported here as pure functions):
//   loadAndRenderNotesWorkspaceEngine  — book counts, active-book filter, the
//                                        pointer clamp, the page-index labels
//   switchActiveLedgerBook             — book switch resets the pointer to 0
//   selectLedgerPageNode               — pointer = a virtual index
//   createNewPageInActiveBook          — blankPage() pushed shape
//   updateActiveNoteContentFromWorkspace / purgeActiveNoteNodeFromLedger
//                                        — the virtual→real index mapping
//   evaluateNotesWorkstationDisplayState — empty vs active display state
//   + the state vars activeLedgerCategoryBook / activeLedgerPagePointerIndex.

// ── The four book volumes (live: the four bookTab_* ids / badge_* keys, in the
//    order the sidebar lists them; switchActiveLedgerBook('personal'|'quest'|
//    'knowledge'|'campaign')). `key` is the value stored in each note's
//    `category`; `label` is the sidebar volume name. ──────────────────────────
export const BOOKS = [
  { key: 'personal', label: 'Personal Journal' },
  { key: 'quest', label: 'Quest Ledger' },
  { key: 'knowledge', label: 'Knowledge File' },
  { key: 'campaign', label: 'Campaign Log' },
]

// The four category keys, in order (live: the keys of the `counts` object).
export const BOOK_KEYS = BOOKS.map((b) => b.key)

// The book a fresh workspace opens on (live: activeLedgerCategoryBook = "personal").
export const DEFAULT_BOOK = 'personal'

// The pointer's "nothing selected" sentinel (live: activeLedgerPagePointerIndex
// starts at -1, and the loader resets it to -1 for an empty book).
export const NO_PAGE = -1

// Labels the live site bakes in.
export const UNTITLED = 'Untitled Inscribed Page' // live page-index fallback text
export const NEW_PAGE_TITLE = 'New Page Designation' // live createNewPageInActiveBook

// pageLabel — the page-index button caption (live: note.title.trim() ||
// "Untitled Inscribed Page"). Guarded against a missing/non-string title so it
// never throws the way the live `.trim()` on `undefined` would.
export function pageLabel(title) {
  return String(title ?? '').trim() || UNTITLED
}

// pagesInBook — the active-book filter (live: payload.dynamicVesselNotes.filter(
// n => n.category === activeLedgerCategoryBook)). Returns a new array whose
// elements are the SAME note object references as in `notes`, in original order,
// so binding to an element edits the underlying note.
export function pagesInBook(notes, book) {
  const list = Array.isArray(notes) ? notes : []
  return list.filter((n) => n && n.category === book)
}

// bookCounts — the badge numbers (live: a { personal, quest, knowledge,
// campaign } tally that increments only for categories it already knows —
// `if (counts[note.category] !== undefined)`). Notes with an unknown/missing
// category are intentionally not counted (and show in no book), exactly as live.
export function bookCounts(notes) {
  const counts = { personal: 0, quest: 0, knowledge: 0, campaign: 0 }
  const list = Array.isArray(notes) ? notes : []
  list.forEach((note) => {
    if (note && counts[note.category] !== undefined) counts[note.category]++
  })
  return counts
}

// clampPointer — the loader's pointer normalisation (live, verbatim semantics):
//   • empty book                  → -1 (nothing selected, show the empty state)
//   • pointer is -1 or past the end → 0 (default to the first page)
//   • otherwise                    → unchanged
// Idempotent: clamping an already-clamped value returns it unchanged.
export function clampPointer(pointer, length) {
  if (length === 0) return NO_PAGE
  if (pointer === NO_PAGE || pointer >= length) return 0
  return pointer
}

// virtualToReal — the virtual-index ↔ real-array mapping (live: the identical
// `targetCounter` walk in updateActiveNoteContentFromWorkspace and
// purgeActiveNoteNodeFromLedger). Given the full notes array, the active book,
// and a virtual index (position WITHIN that book), it returns the position in
// the FULL array — or -1 if there is no such page. This is what lets an edit or
// a delete on the filtered view hit the right element of the unfiltered store.
export function virtualToReal(notes, book, virtualIdx) {
  const list = Array.isArray(notes) ? notes : []
  let targetCounter = 0
  for (let i = 0; i < list.length; i++) {
    if (list[i] && list[i].category === book) {
      if (targetCounter === virtualIdx) return i
      targetCounter++
    }
  }
  return -1
}

// activePageAt — the page a (clamped) pointer points at within a book, or null
// (live: activePagesArray[activeLedgerPagePointerIndex], guarded). Returns the
// real note object reference so the workstation binds straight to the store.
export function activePageAt(pagesArray, pointer) {
  const arr = Array.isArray(pagesArray) ? pagesArray : []
  return pointer >= 0 && pointer < arr.length ? arr[pointer] : null
}

// showWorkstation — the display-state decision (live:
// evaluateNotesWorkstationDisplayState — show the empty message when there is no
// active note, show the editor when there is). Pure boolean for the view.
export function showWorkstation(activeNoteObject) {
  return activeNoteObject != null
}

// blankPage — a fresh page in the given book (live createNewPageInActiveBook's
// pushed shape: { title: "New Page Designation", category, content: "" }).
export function blankPage(book) {
  return { title: NEW_PAGE_TITLE, category: book, content: '' }
}
