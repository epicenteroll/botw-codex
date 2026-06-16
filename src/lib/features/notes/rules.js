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
// ── Book volumes. Re-vocabularied to mirror the encyclopedia's entity types so
//    a captured note maps cleanly to a codex entry, plus an "Unsorted" catch-all.
//    IMPORTANT (monolith-safe): we do NOT rename the values stored in each note's
//    `category`. A note keeps whatever category string it was saved with; we only
//    NORMALISE it to one of these display books at read time (normalizeCategory).
//    So the live monolith — which still groups by its own personal/quest/
//    knowledge/campaign keys — keeps showing its notes unchanged, and nothing a
//    player saved here ever disappears (an unknown category lands in Unsorted). ──
export const BOOKS = [
  { key: 'person', label: 'People' },
  { key: 'faction', label: 'Factions' },
  { key: 'place', label: 'Places' },
  { key: 'region', label: 'Regions' },
  { key: 'item', label: 'Items' },
  { key: 'lore', label: 'Lore & Events' },
  { key: 'unsorted', label: 'Unsorted' },
]

// The category keys, in order (used to seed the badge-count tally).
export const BOOK_KEYS = BOOKS.map((b) => b.key)

// The book a fresh workspace opens on.
export const DEFAULT_BOOK = 'person'

// normalizeCategory — map ANY stored category onto one of the display books.
// Covers the new keys (pass-through), the sheet quick-capture vocabulary
// (NPC/Location/…), and the legacy monolith book keys (personal/quest/…).
// Unknown/missing → 'unsorted', so a note is ALWAYS visible somewhere. This is
// what fixes the old bug where a sheet note saved under e.g. "NPC" showed in no
// book at all. Display-only: the stored value is never rewritten by this.
const CATEGORY_ALIASES = {
  person: 'person', faction: 'faction', place: 'place', region: 'region', item: 'item',
  lore: 'lore', unsorted: 'unsorted',
  // sheet quick-capture (old NOTE_CATS)
  npc: 'person', location: 'place', monster: 'lore', reagent: 'item', material: 'item',
  knowledge: 'lore', vision: 'lore', deed: 'lore', other: 'unsorted',
  // legacy monolith book keys
  personal: 'unsorted', quest: 'lore', campaign: 'lore',
}
export function normalizeCategory(cat) {
  const k = String(cat ?? '').trim().toLowerCase()
  return CATEGORY_ALIASES[k] || 'unsorted'
}

// Map a display book key → the encyclopedia entity_type a submission proposes.
export const BOOK_TO_ENTITY_TYPE = {
  person: 'people', faction: 'faction', place: 'location', region: 'sector',
  item: 'item', lore: 'lore_entry', unsorted: 'lore_entry',
}

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
  return list.filter((n) => n && normalizeCategory(n.category) === book)
}

// bookCounts — the badge numbers. Every note is normalised into a known book,
// so unlike the old tally (which silently dropped unknown categories) nothing is
// uncounted — a sheet "NPC"/"Vision"/etc. note now lands in People/Lore/Unsorted.
export function bookCounts(notes) {
  const counts = {}
  BOOK_KEYS.forEach((k) => (counts[k] = 0))
  const list = Array.isArray(notes) ? notes : []
  list.forEach((note) => {
    if (note) counts[normalizeCategory(note.category)]++
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
    if (list[i] && normalizeCategory(list[i].category) === book) {
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
