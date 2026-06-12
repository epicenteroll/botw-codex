// rules.js — the Sheet's game maths, pure and side-effect-free (§5 rule 3, §9).
//
// Every formula here is ported VERBATIM from the live monolith (HTML_live.txt):
// the same conversion table, the same skill/payload/corruption arithmetic, the
// same dice/oracle/sigil rolls. The only thing removed is the DOM — these
// functions take plain numbers and return plain values or small result objects.
// They never read the page and never touch Supabase, so they are trivial to
// verify and impossible to break by editing the UI.

// ── Attribute → base-percent conversion (live: `conversionTable`) ────────────
// Values 2–18 map to a base skill percentage. Identical to the live table.
export const conversionTable = {
  2: 24, 3: 26, 4: 28, 5: 30, 6: 32,
  7: 34, 8: 36, 9: 38, 10: 40, 11: 42, 12: 43,
  13: 44, 14: 45, 15: 46, 16: 47, 17: 48, 18: 49,
}

// The eight Archon domains, used by the "Roll" button on the Archon field.
// (live: `archonRegistry`)
export const archonRegistry = [
  'Archon of Acorn & Renewal/Growth', 'Archon of Ember & Passion/Will',
  'Archon of Stone & Memory/Endurance', 'Archon of Moon & Mystique/Secrets',
  'Archon of Gale & Freedom/Thought', 'Archon of Frost & Silence/Stagnation',
  'Archon of Tides & Reflection/Emotions', 'Archon of Earth & Forge/Structure',
]

// Which skills hang off which attribute (live: `subSkillMaps`).
export const ATTR_SKILLS = {
  str: ['endurance', 'grip'],
  dex: ['reaction', 'grace'],
  wil: ['focus', 'resolve'],
}

// The combat-proficiency slot-5 dropdown options (live: profTitle_5 <select>).
export const COMBAT_TITLES = ['Precision Strike', 'Heavy Blow', 'Disturb Hit']

export function clamp(n, lo, hi) {
  return Math.min(Math.max(n, lo), hi)
}

// Attribute value clamps to 2–18 (live: runCalculations clamps val_* the same).
export function clampAttr(v) {
  const n = parseInt(v, 10)
  if (!Number.isFinite(n)) return 2
  return clamp(n, 2, 18)
}

// Base percentage for an attribute score. Live falls back to 33 if a value is
// somehow outside the table; we keep that fallback exactly.
export function attrBase(attrValue) {
  return conversionTable[clampAttr(attrValue)] || 33
}

// A skill's Total% = its attribute base + the points allocated to it.
export function skillTotal(attrValue, alloc) {
  return attrBase(attrValue) + (parseInt(alloc, 10) || 0)
}

// Points invested in one attribute = sum of its two skills' allocations.
export function pointsInvested(allocA, allocB) {
  return (parseInt(allocA, 10) || 0) + (parseInt(allocB, 10) || 0)
}

// Crit markers unlocked = 1 per 8 logged successes (live: adjustGlobalSuccess).
export function critMarkers(successCount) {
  return Math.floor((parseInt(successCount, 10) || 0) / 8)
}

// Inventory slot capacity = STR + DEX (live: reconstructInventorySlots).
export function inventoryMax(strVal, dexVal) {
  return clampAttr(strVal) + clampAttr(dexVal)
}

// Total payload = sum of the carried item weights across the live slots
// (live: recalculatePayloadWeightNoReconstruct).
export function payloadWeight(inventory, maxSlots) {
  let sum = 0
  for (let i = 0; i < maxSlots && i < inventory.length; i++) {
    sum += parseInt(inventory[i]?.weight, 10) || 0
  }
  return sum
}

// Combat slot-5 current score = its max + the modifiers of any EQUIPPED weapon
// (live: updateCombatProficiencyValue).
export function combatProficiencyCurrent(profM5, equip1, weapMod1, equip2, weapMod2) {
  let total = parseInt(profM5, 10) || 0
  if (equip1) total += parseInt(weapMod1, 10) || 0
  if (equip2) total += parseInt(weapMod2, 10) || 0
  return total
}

// ── Corruption (live: convertTaintToCorruption / drainCorruption / refreshTrackers)
export const CORRUPTION_MAX = 800

export function corruptionFromTaint(taint) {
  // "100 Taint ➔ +35% Corruption" — floored, exactly as the live engine.
  return Math.floor(((parseInt(taint, 10) || 0) / 100) * 35)
}

export function clampCorruption(v) {
  return clamp(parseInt(v, 10) || 0, 0, CORRUPTION_MAX)
}

// ── Meter fill widths (percentages), ported from refreshTrackers ─────────────
export function rmMeterWidth(cur, max) {
  const c = parseInt(cur, 10) || 0
  const m = parseInt(max, 10) || 120
  const safeMax = m <= 0 ? 1 : m
  return clamp((c / safeMax) * 100, 0, 100)
}
export function taintMeterWidth(cur) {
  return clamp(parseInt(cur, 10) || 0, 0, 100)
}
export function corruptionMeterWidth(corruption) {
  return Math.min(clampCorruption(corruption), 100)
}
export function veilMeterWidth(cur) {
  return clamp(parseInt(cur, 10) || 0, 0, 100)
}

// ── Dice / checks / oracle — return result objects, no side effects ──────────
function d(faces) {
  return Math.floor(Math.random() * faces) + 1
}

// Skill check: roll d100, success if at or under the skill's Total% (live:
// executeSkillD100Check). Caller decides what to do with `success`.
export function rollSkillCheck(skillTotalPercent) {
  const target = parseInt(skillTotalPercent, 10) || 33
  const roll = d(100)
  return { roll, target, success: roll <= target }
}

// Proficiency / generic d20 + modifier (live: executeProficiencyD20Roll).
export function rollProficiency(modifier) {
  const mod = parseInt(modifier, 10) || 0
  const roll = d(20)
  let crit = null
  if (roll === 20) crit = 'success'
  else if (roll === 1) crit = 'fail'
  return { roll, mod, total: roll + mod, crit }
}

// Defensive sigil: d20 + attribute modifier; >20 mitigates, nat 1/20 is a
// critical nullification (live: triggerSigilRoll).
export function rollSigil(attrModifier) {
  const mod = parseInt(attrModifier, 10) || 0
  const roll = d(20)
  const total = roll + mod
  const critical = roll === 20 || roll === 1
  return { roll, mod, total, success: total > 20, critical }
}

// Free-form dice tray (live: rollDiceTray). d100×1 flags crit success/fumble.
export function rollDiceTray(qty, sides) {
  const count = clamp(parseInt(qty, 10) || 1, 1, 10)
  const faces = parseInt(sides, 10) || 100
  const results = []
  let total = 0
  for (let i = 0; i < count; i++) {
    const r = d(faces)
    results.push(r)
    total += r
  }
  let flag = null
  if (faces === 100 && count === 1) {
    if (total <= 5) flag = 'crit'
    else if (total >= 96) flag = 'fumble'
  }
  return { results, total, count, faces, flag }
}

// Fate Oracle d100 bands (live: rollOracleParadigm).
export function rollOracle() {
  const roll = d(100)
  let judgment, color
  if (roll <= 5) { judgment = 'YES, AND...'; color = '#4ade80' }
  else if (roll <= 33) { judgment = 'YES'; color = '#22c55e' }
  else if (roll <= 67) { judgment = 'YES, BUT...'; color = '#a3e635' }
  else if (roll <= 81) { judgment = 'NO, BUT...'; color = '#fb923c' }
  else if (roll <= 94) { judgment = 'NO'; color = '#f87171' }
  else { judgment = 'NO, AND...'; color = '#ef4444' }
  return { roll, judgment, color }
}

export function rollArchon() {
  return archonRegistry[Math.floor(Math.random() * archonRegistry.length)]
}
