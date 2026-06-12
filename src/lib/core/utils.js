// utils.js — small shared helpers used across features (§4 lib/core, §5 rule 1).
//
// The headline export is s(): the HTML-escape used before any author-entered
// text ever reaches innerHTML. It mirrors the live app's s() EXACTLY (same five
// replacements, same &#x27; for the apostrophe) so behaviour is identical after
// the merge. It needs no DOM, so it is safe during build/SSR and in tests.
//
// Most of the new app renders through Svelte's `{...}` interpolation, which
// escapes automatically — so you rarely call s() by hand. It is here for the few
// places a feature builds an HTML string itself (e.g. the atlas's lore links).

export function s(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
}

// debounce — collapse a burst of calls into one trailing call. Handy for
// "save the object a moment after the user stops typing" (Phase 2 sheets).
export function debounce(fn, ms = 600) {
  let t
  return (...args) => {
    clearTimeout(t)
    t = setTimeout(() => fn(...args), ms)
  }
}
