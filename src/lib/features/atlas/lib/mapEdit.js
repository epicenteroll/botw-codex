// mapEdit.js — the ONE drag engine shared by all four maps (Workstream D1),
// plus the Edit-map mode flag and the geometry-only undo stack (D2).
//
// Pointer Events (pointerdown/move/up + setPointerCapture) give a single code
// path for mouse, touch, and stylus. Coordinates are converted through
// svg.getScreenCTM().inverse() so drags stay accurate regardless of
// preserveAspectRatio letterboxing or zoom.

import { writable, get } from 'svelte/store'

/** Admin-only "Edit map" mode. While true, click-to-enter is suspended. */
export const mapEditMode = writable(false)

/** Optional snap-to-grid (D2, quadrant/sector layout tidiness). */
export const snapToGrid = writable(false)
export const GRID = 8

export function snap(v, on) {
  return on ? Math.round(v / GRID) * GRID : v
}

/** Convert a pointer event to SVG user-space coordinates. */
export function svgPoint(svg, evt) {
  const ctm = svg.getScreenCTM()
  if (!ctm) return { x: 0, y: 0 }
  const pt = new DOMPoint(evt.clientX, evt.clientY).matrixTransform(ctm.inverse())
  return { x: pt.x, y: pt.y }
}

/**
 * Svelte action: make an SVG element draggable in user-space.
 *
 * use:drag={{
 *   svg: () => svgEl,          // the owning <svg>
 *   enabled: () => bool,       // live check (edit mode + admin)
 *   getPos: () => [x, y],      // current position in svg coords
 *   onMove: (x, y, dx, dy) => {},   // called every pointermove (optimistic)
 *   onEnd:  (x, y, moved) => {},    // called on pointerup (persist here)
 *   onStart: (e) => {},        // optional
 * }}
 */
export function drag(node, params) {
  let p = params
  let active = false
  let start = null // {px, py, ox, oy}
  let moved = false

  function down(e) {
    if (!p.enabled || !p.enabled()) return
    const svg = p.svg && p.svg()
    if (!svg) return
    e.preventDefault()
    e.stopPropagation()
    node.setPointerCapture(e.pointerId)
    const pt = svgPoint(svg, e)
    const [ox, oy] = p.getPos()
    start = { px: pt.x, py: pt.y, ox, oy }
    active = true
    moved = false
    if (p.onStart) p.onStart(e)
  }
  function move(e) {
    if (!active || !start) return
    const svg = p.svg && p.svg()
    if (!svg) return
    const pt = svgPoint(svg, e)
    const dx = pt.x - start.px
    const dy = pt.y - start.py
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) moved = true
    p.onMove(start.ox + dx, start.oy + dy, dx, dy)
  }
  function up(e) {
    if (!active || !start) return
    active = false
    const svg = p.svg && p.svg()
    let x = start.ox,
      y = start.oy
    if (svg) {
      const pt = svgPoint(svg, e)
      x = start.ox + (pt.x - start.px)
      y = start.oy + (pt.y - start.py)
    }
    const wasMoved = moved
    start = null
    p.onEnd(x, y, wasMoved)
  }

  node.addEventListener('pointerdown', down)
  node.addEventListener('pointermove', move)
  node.addEventListener('pointerup', up)
  node.addEventListener('pointercancel', up)

  return {
    update(next) {
      p = next
    },
    destroy() {
      node.removeEventListener('pointerdown', down)
      node.removeEventListener('pointermove', move)
      node.removeEventListener('pointerup', up)
      node.removeEventListener('pointercancel', up)
    },
  }
}

// ---------- geometry-only undo (D2) ----------
// A simple in-memory stack of {id, before, after} edits. `before`/`after` are
// partial entity patches (blob_center / blob_r / coord_x / coord_y /
// sequence_index only). Full content undo is explicitly out of scope.

const _undo = []
export const canUndo = writable(false)

export function pushEdit(edit) {
  _undo.push(edit)
  if (_undo.length > 100) _undo.shift()
  canUndo.set(true)
}
export function popEdit() {
  const e = _undo.pop() || null
  canUndo.set(_undo.length > 0)
  return e
}
export function clearEdits() {
  _undo.length = 0
  canUndo.set(false)
}

// ---------- overlap check (D2, confirmed soft warning) ----------
// Cheap circle-vs-circle on centers and FULL-GROWN radii — the blob path never
// exceeds ~1.16 × r, so circles are a safe proxy, and checking at max size
// prevents real collisions when an uncharted sector later grows (plan risk #4).
export function findOverlaps(entity, siblings) {
  if (!entity.blob_center || !entity.blob_r) return []
  const [x, y] = entity.blob_center
  return siblings.filter((s) => {
    if (s.id === entity.id || !s.blob_center || !s.blob_r) return false
    const dx = s.blob_center[0] - x
    const dy = s.blob_center[1] - y
    return Math.hypot(dx, dy) < (entity.blob_r + s.blob_r) * 0.92
  })
}

/** Read a writable store once without subscribing (convenience). */
export function peek(store) {
  return get(store)
}
