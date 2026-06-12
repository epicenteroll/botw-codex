// navHistory.js — codex back/forward history (Workstream F).
//
// The unit of history is the combined navigation tuple
//   { tab, view, focusId, selectedId }
// so following a name-link from a sector's lore to a Figure, then to the
// Figure's home, is three steps you can walk back precisely.
//
// Browser semantics: push() clears the forward branch; the stack is capped at
// MAX entries. F3: pushes are mirrored into history.pushState so the device's
// hardware back button steps INSIDE the codex on Android instead of leaving
// the page — Encyclopedia.svelte wires the popstate side.

import { writable, derived, get } from 'svelte/store'

const MAX = 50

// Browser-history mirroring is OFF in the unified Codex.
//
// Originally the atlas pushed each internal step into history.pushState so the
// Android hardware back button stepped INSIDE the atlas. But the atlas is now
// one route inside a SvelteKit app, and SvelteKit owns window history + the
// back/forward button. Mirroring here called history.replaceState/pushState
// with our own {botw} state, which overwrote SvelteKit's navigation markers —
// so leaving the atlas (e.g. to the Sheet) and pressing Back left the URL
// changed but the page not re-rendered (fixed only by a refresh), and could
// leave a half-switched, cropped layout.
//
// With mirroring off, the atlas's own ‹ › arrows still walk its in-memory
// stack; the browser back/forward button moves between ROUTES, as it should.
// (To restore the old hardware-back behaviour in a standalone build, flip this
// to true.)
const MIRROR_BROWSER = false

const stack = writable([]) // array of states
const index = writable(-1) // pointer into stack

export const canBack = derived([index], ([$i]) => $i > 0)
export const canForward = derived([stack, index], ([$s, $i]) => $i < $s.length - 1)

// last 8 entries behind the pointer, newest first — for the long-press trail (F2)
export const trail = derived([stack, index], ([$s, $i]) =>
  $s.slice(Math.max(0, $i - 8), $i).reverse(),
)

const same = (a, b) =>
  a && b && a.tab === b.tab && a.view === b.view && a.focusId === b.focusId && a.selectedId === b.selectedId

export function current() {
  const s = get(stack)
  const i = get(index)
  return i >= 0 ? s[i] : null
}

/** Record a new state. No-op if identical to the current entry. */
export function push(state, { mirrorBrowser = true } = {}) {
  const cur = current()
  if (same(cur, state)) return false
  stack.update((s) => {
    const i = get(index)
    let next = s.slice(0, i + 1) // drop the forward branch
    next.push({ ...state })
    if (next.length > MAX) next = next.slice(next.length - MAX)
    index.set(next.length - 1)
    return next
  })
  if (mirrorBrowser && MIRROR_BROWSER && typeof history !== 'undefined' && history.pushState) {
    try {
      history.pushState({ botw: { ...state } }, '')
    } catch {
      /* ignore (sandboxed iframes etc.) */
    }
  }
  return true
}

export function back() {
  const i = get(index)
  if (i <= 0) return null
  index.set(i - 1)
  return current()
}

export function forward() {
  const i = get(index)
  const s = get(stack)
  if (i >= s.length - 1) return null
  index.set(i + 1)
  return current()
}

/** Jump to an absolute position in the trail (long-press jump-back). */
export function jumpTo(state) {
  const s = get(stack)
  const i = s.findIndex((x) => same(x, state))
  if (i < 0) return null
  index.set(i)
  return current()
}

/** Seed the stack with the initial state (no browser mirror). */
export function init(state) {
  stack.set([{ ...state }])
  index.set(0)
  if (MIRROR_BROWSER && typeof history !== 'undefined' && history.replaceState) {
    try {
      history.replaceState({ botw: { ...state } }, '')
    } catch {
      /* ignore */
    }
  }
}

/** popstate helper — align our pointer to a state the browser restored. */
export function syncFromBrowser(state) {
  if (!state) return null
  const cur = current()
  if (same(cur, state)) return null
  // try to find it in our stack (it should be there); fall back to plain back()
  return jumpTo(state) || back()
}
