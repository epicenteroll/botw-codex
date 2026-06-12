// rules.js — the Calendar's "Dynamic Progression Orbital Engine", pure and
// side-effect-free (§5 rule 3, §9).
//
// Every formula here is ported VERBATIM from the live monolith (HTML_live.txt):
// the same archon orbit order, the same crucible-registry construction
// (initializeCrucibleRegistry), the same blood-moon pillar arithmetic, the same
// "roll random weeks"/transition-duration dice, and the same date-badge string.
// The only thing removed is the DOM and Supabase — these functions take plain
// values and return plain values or new objects. They never read the page and
// never touch the database, so they are trivial to verify and impossible to
// break by editing the UI.

// ── Constants from the live engine ───────────────────────────────────────────
export const DAYS_PER_WEEK = 8 // live: totalDaysInThisMonth = m.weeks * 8
export const BLOOD_MOON_INTERVAL = 14 // live: pillars stride d += 14
export const MONTHS_PER_CRUCIBLE = 8 // live: for (let i = 0; i < 8; i++)
export const TRANSITION_DEFAULT = 'Awaiting Session Roll...'

// The Crucible-17 seed overrides (live: targetCrucibleNum == 17 special-case).
const DEFAULT_WEEKS = 4

// Master Sequential Cosmic Loop Order (live: `archonOrbitOrder`). NOTE this is
// the *orbital* order and is deliberately different from the sheet's
// archonRegistry — the calendar owns its own copy (features are islands, §4).
export const archonOrbitOrder = [
  'Archon of Ember & Passion/Will',
  'Archon of Stone & Memory/Endurance',
  'Archon of Moon & Mystique/Secrets',
  'Archon of Gale & Freedom/Thought',
  'Archon of Frost & Silence/Stagnation',
  'Archon of Tides & Reflection/Emotions',
  'Archon of Earth & Forge/Structure',
  'Archon of Acorn & Renewal/Growth',
]

// The three cycles a month can belong to, with the live's colour tokens and the
// trigger labels from the calendar accordion. The colour strings are stored
// verbatim into each month object so the saved `cruciblesData` shape stays
// byte-compatible with the live site.
export const CYCLES = {
  rejuv: { key: 'rejuv', label: 'Cycle of Rejuvenation', emoji: '🌱', color: 'var(--accent-green)' },
  fest: { key: 'fest', label: 'Cycle of Festivities', emoji: '🍷', color: 'var(--accent-gold)' },
  valour: { key: 'valour', label: 'Cycle of Valour', emoji: '⚔️', color: 'var(--accent-blood)' },
}
export const CYCLE_ORDER = ['rejuv', 'fest', 'valour']

// Sensible defaults the live `loadAndRenderVesselCalendar` fills in when a blob
// is missing the calendar keys.
export const DEFAULTS = {
  currentAge: 'Age of Nightmares',
  currentCrucible: 17,
  calendarCurrentMonth: 7,
  calendarCurrentDay: 1,
}

const toInt = (v, def = 0) => {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : def
}

// A crucible number, parsed the way the live inputs do (parseInt || 17), floored
// at 1 to honour the input's min="1".
export function clampCrucible(value) {
  return Math.max(1, toInt(value, DEFAULTS.currentCrucible))
}

// Manual per-month week count (live: updateManualMonthWeeks → Math.max(1, ... || 4)).
export function clampWeeks(value) {
  return Math.max(1, toInt(value, DEFAULT_WEEKS))
}

// Which cycle/colour the i-th month of a crucible falls into (live: the
// i in [3,4] → fest, i >= 5 → valour, else rejuv branch).
export function cycleForMonthIndex(i) {
  if (i >= 3 && i <= 4) return CYCLES.fest
  if (i >= 5) return CYCLES.valour
  return CYCLES.rejuv
}

// The short display name for an archon (live: name.split(' & ')[0]).
export function archonShortName(name) {
  return String(name ?? '').split(' & ')[0]
}

// buildCrucible — the verbatim port of `initializeCrucibleRegistry`. Pure: given
// the existing registry entry for this crucible (or null) plus an optional
// forced orbit-origin index, it returns the crucible's registry object
// { startArchonIndex, months[8], manualTransitionDuration }.
//
// Live semantics preserved exactly:
//  • If the crucible already exists and no orbit origin is forced, it is left
//    untouched (returned as-is) — the live `if (exists && forced===null) return`.
//  • Otherwise startIndex = forced ?? existing.startArchonIndex ?? 0.
//  • Per-month weeks keep any existing value; else Crucible 17 seeds month 7 = 5
//    and month 8 = 8 weeks; else the default of 4.
export function buildCrucible(targetCrucibleNum, { existing = null, forcedStartOrbitIndex = null } = {}) {
  if (existing && forcedStartOrbitIndex === null) return existing

  let startIndex = 0
  if (forcedStartOrbitIndex !== null) startIndex = forcedStartOrbitIndex
  else if (existing?.startArchonIndex !== undefined) startIndex = existing.startArchonIndex

  const months = []
  for (let i = 0; i < MONTHS_PER_CRUCIBLE; i++) {
    const currentOrbitPos = (startIndex + i) % MONTHS_PER_CRUCIBLE
    const archonName = archonOrbitOrder[currentOrbitPos]
    const { key: cycle, color } = cycleForMonthIndex(i)

    let assignedWeeks = DEFAULT_WEEKS
    if (existing && existing.months[i]) {
      assignedWeeks = existing.months[i].weeks
    } else if (Number(targetCrucibleNum) === 17) {
      if (i === 6) assignedWeeks = 5
      if (i === 7) assignedWeeks = 8
    }

    months.push({
      index: i + 1,
      orbitIndex: currentOrbitPos,
      name: archonName,
      cycle,
      weeks: assignedWeeks,
      color,
    })
  }

  return {
    startArchonIndex: startIndex,
    months,
    manualTransitionDuration: existing?.manualTransitionDuration || TRANSITION_DEFAULT,
  }
}

// ensureCrucible — the immutable equivalent of mutating `payload.cruciblesData`.
// Returns a NEW cruciblesData object with the target crucible present (built via
// buildCrucible). Reassigning the result keeps Svelte reactivity clean.
export function ensureCrucible(cruciblesData, targetCrucibleNum, forcedStartOrbitIndex = null) {
  const data = { ...(cruciblesData || {}) }
  data[targetCrucibleNum] = buildCrucible(targetCrucibleNum, {
    existing: data[targetCrucibleNum],
    forcedStartOrbitIndex,
  })
  return data
}

// bloodMoonPillars — verbatim port of the live accumulator. Walks the months in
// order; the anchor is 7 days into the "Earth & Forge" month, and blood moons
// fall every 14 days forward and backward from that anchor. Returns the set of
// global day-indices that are blood moons, plus the totals.
export function bloodMoonPillars(months) {
  let globalDayAccumulator = 0
  let anchorGlobalDayOffset = 0

  for (const m of months) {
    if (m.name.includes('Earth & Forge')) {
      anchorGlobalDayOffset = globalDayAccumulator + 7
    }
    globalDayAccumulator += m.weeks * DAYS_PER_WEEK
  }

  const pillars = new Set()
  for (let d = anchorGlobalDayOffset; d <= globalDayAccumulator; d += BLOOD_MOON_INTERVAL) pillars.add(d)
  for (let d = anchorGlobalDayOffset - BLOOD_MOON_INTERVAL; d > 0; d -= BLOOD_MOON_INTERVAL) pillars.add(d)

  return { pillars, totalDays: globalDayAccumulator, anchorOffset: anchorGlobalDayOffset }
}

// monthDays — days in a month (live: m.weeks * 8).
export function monthDays(weeks) {
  return (toInt(weeks, DEFAULT_WEEKS)) * DAYS_PER_WEEK
}

// buildMonthGrid — turns a crucible's months into render-ready rows, marking
// each day's blood-moon status. Mirrors the live render loop exactly: a single
// `evaluatedDaysPassed` counter increments across every day of every month in
// order, and a day is a blood moon iff that running count is in the pillar set.
export function buildMonthGrid(months) {
  const { pillars } = bloodMoonPillars(months)
  let evaluatedDaysPassed = 0
  return months.map((m) => {
    const totalDaysInThisMonth = monthDays(m.weeks)
    const days = []
    for (let d = 1; d <= totalDaysInThisMonth; d++) {
      evaluatedDaysPassed++
      days.push({ day: d, bloodMoon: pillars.has(evaluatedDaysPassed), globalDay: evaluatedDaysPassed })
    }
    return { ...m, totalDays: totalDaysInThisMonth, days }
  })
}

// ── Dice, ported verbatim ────────────────────────────────────────────────────
function d(faces) {
  return Math.floor(Math.random() * faces) + 1
}

// One month's random week count (live: Math.floor(Math.random()*6)+3 → 3–8).
export function randomWeekCount() {
  return Math.floor(Math.random() * 6) + 3
}

// rollRandomWeeks — new week counts for all 8 months plus the transition-period
// roll (live: rollRandomWeeksForCrucible). Returns the raw values; the data
// model decides how to apply them.
export function rollRandomWeeks() {
  const weeks = Array.from({ length: MONTHS_PER_CRUCIBLE }, () => randomWeekCount())
  return { weeks, transition: rollTransitionDuration() }
}

// rollTransitionDuration — the d8 magnitude + d100 unit band (live: the d100/d8
// block at the end of rollRandomWeeksForCrucible).
export function rollTransitionDuration() {
  const d100 = d(100)
  const d8 = d(8)
  let unit = 'Days'
  if (d100 <= 5) unit = 'Days'
  else if (d100 <= 57) unit = 'Weeks'
  else if (d100 <= 94) unit = 'Months'
  else unit = 'Crucibles'
  return { d100, d8, unit, text: `${d8} ${unit} (Rolled ${d100} on d100)` }
}

// dateBadge — the header shorthand (live: updateHeaderDateBadgeDisplay).
export function dateBadge({ currentCrucible, calendarCurrentMonth, calendarCurrentDay } = {}) {
  if (calendarCurrentMonth && calendarCurrentDay) {
    const shorthandCruc = currentCrucible || DEFAULTS.currentCrucible
    return `C${shorthandCruc} • M${calendarCurrentMonth} D${calendarCurrentDay}`
  }
  return 'Set Date'
}
