// rules.js — the Registry of Deeds AP maths, pure and side-effect-free
// (§5 rule 3, §9).
//
// Every formula here is ported VERBATIM from the live monolith (HTML_live.txt):
// the same AP clamps (the 0–57 override band and the 0-floored per-deed reward),
// the same composite claim keys ('p_' + index / 'g_' + index), and the same
// claim-toggle arithmetic (add → cap at 57, remove → floor at 0) from
// togglePlayerDeedClaim / adminOverrideAPValue / saveDeedField. The only thing
// removed is the DOM and Supabase — these functions take plain values and return
// plain values or NEW objects/arrays. They never read the page and never touch
// the database, so they are trivial to verify and impossible to break by editing
// the UI.

// ── Constants from the live engine ───────────────────────────────────────────
// AP is bounded 0–57 everywhere the live site touches it (the advancementPoints
// input is min="0" max="57"; validateAPRange and adminOverrideAPValue clamp to
// that band; the claim toggle caps additions at 57 and floors removals at 0).
export const AP_MIN = 0
export const AP_MAX = 57

// The default AP a fresh vessel starts with (live: the advancementPoints input
// ships value="3"; sheetData seeds the same).
export const AP_DEFAULT = 3

// Claim-key prefixes (live: 'p_' personal, 'g_' global — both stored in the
// VESSEL's unlockedAchievements list, even for global triumphs).
export const PERSONAL_PREFIX = 'p'
export const GLOBAL_PREFIX = 'g'

const toInt = (v, def = 0) => {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : def
}

// clampAP — the admin AP-override band (live: adminOverrideAPValue →
// Math.max(0, Math.min(57, parseInt(rawInput) || 0))). Used for the direct
// "Apply Correction" override and anywhere a final AP total is set outright.
export function clampAP(value) {
  return Math.max(AP_MIN, Math.min(AP_MAX, toInt(value, 0)))
}

// clampApValue — a per-deed AP reward as the live saveDeedField stores it:
// Math.max(0, parseInt(rawValue) || 0). NOTE this is deliberately floored at 0
// only and NOT capped at 57 — that is exactly what the live field-save does
// (the max="57" on the input is a UI hint the save never enforced). Kept
// byte-faithful so old and new writes agree.
export function clampApValue(value) {
  return Math.max(AP_MIN, toInt(value, 0))
}

// apRewardOf — the AP a card grants on claim (live: const claimAP = ach.apValue
// || 0). Returns 0 for missing/blank/zero values.
export function apRewardOf(ach) {
  return Number(ach?.apValue) || 0
}

// claimKey — the composite key the live site stores in unlockedAchievements
// (live: '${inputIdPrefix}_${index}', e.g. 'p_0' / 'g_3').
export function claimKey(prefix, index) {
  return `${prefix}_${index}`
}

// isClaimed — whether the unlockedAchievements list contains a given card's key
// (live: unlockedAchievements.includes('p_' + arrayIndex) /
// claimedGlobal.includes('g_' + arrayIndex)).
export function isClaimed(unlockedAchievements, prefix, index) {
  const list = Array.isArray(unlockedAchievements) ? unlockedAchievements : []
  return list.includes(claimKey(prefix, index))
}

// applyClaimToggle — the verbatim port of togglePlayerDeedClaim's array + AP
// arithmetic, expressed purely: given the current AP, the current
// unlockedAchievements list, the card's composite key, and its AP reward, it
// returns a NEW { unlocked, ap } pair.
//
// Live semantics preserved exactly:
//  • Already claimed → remove the key, AP = Math.max(0, AP - reward).
//  • Not yet claimed → add the key, AP = Math.min(57, AP + reward).
export function applyClaimToggle(currentAP, unlockedAchievements, key, apReward) {
  const unlocked = Array.isArray(unlockedAchievements) ? [...unlockedAchievements] : []
  const reward = toInt(apReward, 0)
  let ap = toInt(currentAP, 0)

  const idx = unlocked.indexOf(key)
  if (idx > -1) {
    unlocked.splice(idx, 1)
    ap = Math.max(AP_MIN, ap - reward)
  } else {
    unlocked.push(key)
    ap = Math.min(AP_MAX, ap + reward)
  }
  return { unlocked, ap }
}

// ── Blank-entry factories (live: createNewDynamicAchievement's pushed shapes) ─
// New personal deed (live: { title, desc, apValue, isGlobal: false }).
export function blankPersonalDeed() {
  return { title: 'New Personal Deed', desc: '...', apValue: 0, isGlobal: false }
}

// New global triumph (live: { title, desc, apValue, achievedBy, achievedWhen }).
export function blankGlobalTriumph() {
  return {
    title: 'New Global Triumph',
    desc: 'Describe this campaign-wide achievement...',
    apValue: 0,
    achievedBy: '',
    achievedWhen: '',
  }
}
