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

// Proficiency / generic d20 + modifier.
//
// DELIBERATE DIVERGENCE from the live monolith (plan §4, F5; ported from the
// approved prototype's profRoll): a natural 1 adds +10 to the total (no longer a
// fumble), a natural 20 is a critical success. Rolls are never persisted, so this
// is blob-safe; it only changes how the two sites would roll, and the live site
// is retiring (D6). `bonus` records the +10 nat-1 nudge for the terminal display.
export function rollProficiency(modifier) {
  const mod = parseInt(modifier, 10) || 0
  const roll = d(20)
  const bonus = roll === 1 ? 10 : 0
  let crit = null
  if (roll === 20) crit = 'success'
  else if (roll === 1) crit = 'lucky' // nat 1 → +10 (was 'fail' in the live site)
  const total = roll + mod + bonus
  return { roll, mod, bonus, total, crit, tier: tierOf(total) }
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

// ═══════════════════════════════════════════════════════════════════════════
// NEW pure maths for the redesigned sheet (plan §4). Every formula below is
// ported VERBATIM from the approved prototype's <script> (botw-sheet-revamp-v7).
// Pure: plain numbers in, plain values out, no DOM, no Supabase, no Math.random
// except the few clearly-marked roll helpers at the end.
// ═══════════════════════════════════════════════════════════════════════════

// ── Proficiency tiers (prototype: tierOf / tierMin) ──────────────────────────
// A rating's tier by band: 0 (<3) / 1 (3–13) / 2 (14–24) / 3 (25–35) /
// 4 (36–46) / 5 (47–57+).
export function tierOf(n) {
  const v = parseInt(n, 10) || 0
  if (v < 3) return 0
  if (v <= 13) return 1
  if (v <= 24) return 2
  if (v <= 35) return 3
  if (v <= 46) return 4
  return 5
}
// Minimum value to *be* in each tier (index = tier; [0] unused). Used by odds.
export const TIER_MIN = [null, 3, 14, 25, 36, 47]

// ── AP upgrade ladder (prototype: baseAPCost / discountedAP) ─────────────────
// Per-point cost to raise a proficiency's Max by 1, with tier-entry surcharges
// at the band edges (13→3, 24→5, 35→7, 46→9); null at the 57 cap.
export function apCostToRaise(currentMax) {
  const cur = parseInt(currentMax, 10) || 0
  if (cur >= 57) return null
  if (cur === 13) return 3
  if (cur === 24) return 5
  if (cur === 35) return 7
  if (cur === 46) return 9
  return [0, 1, 2, 3, 4, 5][tierOf(cur)]
}
// A ✦ crit on the node halves its next upgrade cost (floored). The prototype
// keeps the discount permanent while crit ≥ 1 (it does not consume a marker) —
// preserved here; see §9.5 (flagged, no ruleset doc to say otherwise).
export function discountedApCost(currentMax, critCount) {
  const base = apCostToRaise(currentMax)
  if (base === null) return null
  return (parseInt(critCount, 10) || 0) > 0 ? Math.floor(base / 2) : base
}

// ── Weapons (prototype: rarityBand / weaponBonus / combatValue) ──────────────
// Allowed rarity-modifier bands, used to flag an out-of-band weapon mod.
export const RARITY_BANDS = {
  common: [0, 2], uncommon: [3, 5], rare: [6, 9], epic: [10, 14],
}
export const COMBAT_STYLES = COMBAT_TITLES // alias: the same three combat styles

// The effective bonus a single weapon lends a combat proficiency of `style`:
// broken ⇒ 0; on-style ⇒ full (mod + unique-if-named); off-style ⇒ capped low
// (min(full, 2)). [ASM in prototype: off-style cap = 2.]
export function weaponEffectiveBonus(weapon, style) {
  const w = weapon || {}
  if (w.broken) return 0
  const base = (parseInt(w.mod, 10) || 0) + (w.named ? (parseInt(w.unique, 10) || 0) : 0)
  return w.combatType === style ? base : Math.min(base, 2)
}
// A weapon's full on-style bonus (display helper; broken ⇒ 0).
export function weaponFullBonus(weapon) {
  const w = weapon || {}
  if (w.broken) return 0
  return (parseInt(w.mod, 10) || 0) + (w.named ? (parseInt(w.unique, 10) || 0) : 0)
}
// True when a weapon's mod sits inside its rarity band.
export function weaponModInBand(weapon) {
  const w = weapon || {}
  const band = RARITY_BANDS[w.rarity] || RARITY_BANDS.common
  const mod = parseInt(w.mod, 10) || 0
  return mod >= band[0] && mod <= band[1]
}
// Named is only allowed for rare/epic weapons.
export function weaponNamedAllowed(weapon) {
  const r = (weapon || {}).rarity
  return r === 'rare' || r === 'epic'
}

// Combat-proficiency Current = its Max + the effective bonus of every EQUIPPED
// weapon, each measured against this slot's style (generalizes the live
// combatProficiencyCurrent to N weapons + style matching). Derived only.
export function combatCurrentFromWeapons(profMax, style, weapons) {
  let v = parseInt(profMax, 10) || 0
  for (const w of weapons || []) {
    if (w && w.equipped) v += weaponEffectiveBonus(w, style)
  }
  return v
}

// ── Manifestations (prototype: manifestRoll taint maths) ─────────────────────
// Taint accrued by working an Abilities/Pharmakia manifestation:
//   BoW × 2^(failures − successes), rounded. successCount is 0–2 (containment +
//   will). Two successes shrink it (×2^-2), two failures balloon it (×2^2).
export function manifestTaint(bow, successCount) {
  const b = parseInt(bow, 10) || 40
  const succ = clamp(parseInt(successCount, 10) || 0, 0, 2)
  const fails = 2 - succ
  return Math.round(b * Math.pow(2, fails - succ))
}

// ── End-of-session skill growth (prototype: endSession) ──────────────────────
// Given a skill's Total% and a d100, return the % delta: +2 (95–100, crit
// success) / −2 (1–5, crit failure) / +1 (rolled over the Total, pushed past the
// limit) / 0 otherwise.
export function endOfSessionGrowth(totalPercent, d100) {
  const total = parseInt(totalPercent, 10) || 0
  const roll = parseInt(d100, 10) || 0
  if (roll >= 95) return 2
  if (roll <= 5) return -2
  if (roll > total) return 1
  return 0
}

// ── Wounds & healing (prototype: HEAL_DAYS / woundTimeLabel) ──────────────────
export const HEAL_DAYS = [1, 3, 7, 14, 30] // 1st/2nd/3rd/4th/5th+ wound
export function healDays(woundRank) {
  return HEAL_DAYS[clamp((parseInt(woundRank, 10) || 1) - 1, 0, 4)]
}
export function woundTimeLabel(woundRank) {
  const days = healDays(woundRank)
  return days + (days === 1 ? ' day' : ' days')
}
// The next wound's rank = one past the highest rank currently carried. Vacated
// lower ranks are NOT reused — wounds stay in the order received (§9.7, flagged).
export function nextWoundRank(profs) {
  let mx = 0
  for (const p of profs || []) {
    if (p && p.wounded && (p.woundRank || 0) > mx) mx = p.woundRank
  }
  return mx + 1
}

// ── Challenge die (prototype: issueChallenge) ────────────────────────────────
// Resolve a foe's challenge: 'clean' = max wounds already (no roll needed),
// 'none' = nothing marked, otherwise roll the die — 'defeated' when roll < wounds
// (morale breaks), 'holds' when roll ≥ wounds.
export function challengeResolve(dieSize, wounds, roll) {
  const die = parseInt(dieSize, 10) || 0
  const w = clamp(parseInt(wounds, 10) || 0, 0, die)
  if (w <= 0) return { outcome: 'none', die, wounds: w }
  if (w >= die) return { outcome: 'clean', die, wounds: w }
  const r = roll == null ? d(die) : parseInt(roll, 10)
  return { outcome: r < w ? 'defeated' : 'holds', die, wounds: w, roll: r }
}

// ── Effectiveness predicates (prototype: manifestRoll) ───────────────────────
// Containment holds on d100 ≤ 60; will steadies on d20 ≤ WIL; an Archonic
// intervention lands when d100 > current Veil. Pure predicates for the rolls.
export function containmentHolds(d100) { return (parseInt(d100, 10) || 0) <= 60 }
export function willSteadies(d20, wil) {
  return (parseInt(d20, 10) || 0) <= (parseInt(wil, 10) || 0)
}
export function interventionLands(d100, veil) {
  return (parseInt(d100, 10) || 0) > (parseInt(veil, 10) || 0)
}

// ── Odds table (prototype: renderOdds) ───────────────────────────────────────
// For a proficiency `value`, the chance (over the 20 d20 faces, with 1 → +10)
// that d20 + value reaches each tier's minimum, plus the flat crit chance (nat
// 20 = 1/20). Returns { tiers:[t1..t5 percentages], crit }.
export function tierReachOdds(value) {
  const v = parseInt(value, 10) || 0
  const tiers = []
  for (let k = 1; k <= 5; k++) {
    let reach = 0
    for (let f = 1; f <= 20; f++) {
      const total = v + (f === 1 ? 11 : f) // nat 1 → value + 1 + 10
      if (total >= TIER_MIN[k]) reach++
    }
    tiers.push(Math.round((reach / 20) * 100))
  }
  return { tiers, crit: Math.round((1 / 20) * 100) }
}
