// masonry.js — a tiny, dependency-free masonry layout for the sheet's card grid.
//
// Why this exists: the cards are a mix of half-width panels and a few full-width
// ones (.wide / .band). Neither CSS multi-column nor CSS grid packs that mix
// without holes — multicol leaves a gap below the shorter column wherever a
// full-width card breaks the flow; grid leaves a gap beneath any card shorter
// than its row-mate. This action positions the half-width cards into the SHORTER
// of two columns (so they pack tight, at their natural height) and lets the
// full-width cards break across both columns — the "everything fits together"
// look, with no stretched cards and no holes.
//
// It is purely additive: it only writes inline position/size styles. If it never
// runs (JS disabled) or below the mobile breakpoint, the cards keep the
// stylesheet's normal flow (multi-column on desktop, a stacked block on phones).
// On unmount it removes every inline style it set, so a route remount starts
// clean — nothing here can "stick" the way the old Atlas-CSS bleed did.

export function masonry(grid, opts = {}) {
  const GAP = opts.gap ?? 12
  const COLS = opts.cols ?? 2
  const BREAK = opts.breakpoint ?? 680 // at/below this width: hand back to CSS (single stacked column)

  let raf = 0
  let active = false

  const cards = () => Array.from(grid.children).filter((el) => el.nodeType === 1)

  function clear() {
    grid.style.position = ''
    grid.style.height = ''
    grid.style.columnCount = ''
    for (const c of cards()) {
      c.style.position = ''
      c.style.left = ''
      c.style.top = ''
      c.style.width = ''
    }
    active = false
  }

  function layout() {
    const W = grid.clientWidth
    if (!W) return
    if (W <= BREAK) {
      if (active) clear()
      return
    }
    active = true

    // Become the positioning context and neutralise multi-column while we
    // absolutely position the cards. (Idempotent — only writes when changing.)
    if (grid.style.position !== 'relative') grid.style.position = 'relative'
    if (grid.style.columnCount !== '1') grid.style.columnCount = '1'

    const colW = Math.floor((W - GAP * (COLS - 1)) / COLS)
    const heights = new Array(COLS).fill(0)

    for (const c of cards()) {
      const full = c.classList.contains('wide') || c.classList.contains('band')
      const targetW = full ? W : colW

      if (c.style.position !== 'absolute') c.style.position = 'absolute'
      // Set width first so offsetHeight reflects the laid-out column width.
      if (c.style.width !== targetW + 'px') c.style.width = targetW + 'px'

      const h = c.offsetHeight
      let x, y
      if (full) {
        y = Math.max(...heights)
        x = 0
        for (let i = 0; i < COLS; i++) heights[i] = y + h + GAP
      } else {
        let ci = 0
        for (let i = 1; i < COLS; i++) if (heights[i] < heights[ci]) ci = i
        x = ci * (colW + GAP)
        y = heights[ci]
        heights[ci] = y + h + GAP
      }
      // Diff-apply position so a converged layout writes nothing (avoids
      // ResizeObserver feedback loops).
      if (c.style.left !== x + 'px') c.style.left = x + 'px'
      if (c.style.top !== y + 'px') c.style.top = y + 'px'
    }

    const H = Math.max(...heights) - GAP
    if (grid.style.height !== H + 'px') grid.style.height = H + 'px'
  }

  function schedule() {
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = 0
      layout()
    })
  }

  // Re-pack when the container resizes or any card's height changes (edits,
  // counter clicks, adding a prof/note row inside a card, etc.).
  const ro = new ResizeObserver(schedule)
  ro.observe(grid)
  for (const c of cards()) ro.observe(c)

  // Re-pack if the grid's children change (defensive — the set is static today).
  const mo = new MutationObserver(() => {
    for (const c of cards()) ro.observe(c) // observing an element twice is a no-op
    schedule()
  })
  mo.observe(grid, { childList: true })

  // Web fonts (Cinzel titles) can change heights after first paint.
  if (typeof document !== 'undefined' && document.fonts?.ready) document.fonts.ready.then(schedule)
  if (typeof window !== 'undefined') window.addEventListener('resize', schedule)

  schedule()

  return {
    destroy() {
      ro.disconnect()
      mo.disconnect()
      if (typeof window !== 'undefined') window.removeEventListener('resize', schedule)
      if (raf) cancelAnimationFrame(raf)
      clear()
    },
  }
}
