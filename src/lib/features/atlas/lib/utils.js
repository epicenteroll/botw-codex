// utils.js — shared helpers for the encyclopedia.
//
// The single most important rule (Section 12 + 19): ALL author-entered text is
// passed through s() before it ever touches innerHTML. Name-links are parsed
// only AFTER sanitising the surrounding prose.

// ---------- the s() sanitiser ----------
// Browser-safe HTML escape. Mirrors the main app's s() so behaviour is identical
// after merge. Works in the DOM (Vite/browser); falls back to a manual escape
// during SSR / tests where `document` is absent.
export function s(str) {
  const v = str == null ? '' : String(str)
  if (typeof document !== 'undefined') {
    const d = document.createElement('div')
    d.textContent = v
    return d.innerHTML
  }
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// ---------- deterministic organic blob generator ----------
// Catmull-Rom -> cubic Bézier, closed. Seeded by the entity id so a region's
// shape is stable across renders but never geometric (Section 14, Section 10).
function mulberry(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
export function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
export function blobPath(cx, cy, r, id) {
  const rnd = mulberry(hash(id))
  const n = 9
  const pts = []
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2
    const rad = r * (0.74 + rnd() * 0.42)
    pts.push([cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad * 0.92])
  }
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)} `
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n],
      p1 = pts[i],
      p2 = pts[(i + 1) % n],
      p3 = pts[(i + 2) % n]
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += `C ${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)} `
  }
  return d + 'Z'
}

// ---------- the Fate Oracle (Section 17) ----------
// The application's existing d100 Fate Oracle. The roll gates *access* to
// authored tiers; the GM writes all content.
export const ORACLE_BANDS = [
  { max: 5, key: 'yes_and', label: 'YES, AND' },
  { max: 33, key: 'yes', label: 'YES' },
  { max: 67, key: 'yes_but', label: 'YES, BUT' },
  { max: 81, key: 'no_but', label: 'NO, BUT' },
  { max: 94, key: 'no', label: 'NO' },
  { max: 100, key: 'no_and', label: 'NO, AND' },
]
export function rollOracle() {
  const n = 1 + Math.floor(Math.random() * 100)
  const band = ORACLE_BANDS.find((b) => n <= b.max)
  return { n, key: band.key, label: band.label }
}
// Maps an oracle result to its effect on a location's discovery (Section 17).
export function resolveOracleForLocation(oracleResult) {
  const upgrade = {
    yes_and: 'full_upgrade',
    yes: 'full_upgrade',
    yes_but: 'text_only',
    no_but: 'hint',
    no: 'no_change',
    no_and: 'complication',
  }
  return upgrade[oracleResult] || 'no_change'
}
