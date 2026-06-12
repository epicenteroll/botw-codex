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
  if (mirrorBrowser && typeof history !== 'undefined' && history.pushState) {
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
  if (typeof history !== 'undefined' && history.replaceState) {
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
