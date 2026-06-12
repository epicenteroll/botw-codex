// viewport.js — responsive breakpoint stores (Workstream A).
//
// `isNarrow` (≤880px) drives the aside → bottom-sheet swap, the admin column
// layout, and Workstreams B/D touch affordances. `isPhone` (≤600px) drives the
// breadcrumb collapse. Both are readable stores backed by matchMedia so every
// component shares ONE listener per query.

import { readable } from 'svelte/store'

function mediaStore(query, fallback = false) {
  return readable(fallback, (set) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {}
    const mq = window.matchMedia(query)
    set(mq.matches)
    const onChange = (e) => set(e.matches)
    // addEventListener with fallback for older Safari
    if (mq.addEventListener) mq.addEventListener('change', onChange)
    else mq.addListener(onChange)
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', onChange)
      else mq.removeListener(onChange)
    }
  })
}

export const isNarrow = mediaStore('(max-width: 880px)')
export const isPhone = mediaStore('(max-width: 600px)')
export const isTouch = mediaStore('(pointer: coarse)')
