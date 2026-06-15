// sheetActions.js — every interactive action the cards trigger, ported VERBATIM
// from the approved prototype's <script> and rebound onto the `sheet` store.
//
// Pure maths stays in rules.js; this file is the glue: it reads/writes the one
// `sheet` store, writes the System Terminal output, and holds the small TRANSIENT
// state the prototype kept outside persistence (sigil long-rest repairs, last
// combat damage, last vision, pending Luck) — none of which is saved (plan §5b).
// It never imports Supabase; the shell owns load/save.

import { get } from 'svelte/store'
import {
  attrBase, clampAttr, archonRegistry,
  rollProficiency, rollSigil, rollDiceTray, rollOracle,
  tierOf, combatCurrentFromWeapons, weaponEffectiveBonus,
  manifestTaint, endOfSessionGrowth, healDays, woundTimeLabel, nextWoundRank,
  challengeResolve, containmentHolds, willSteadies, interventionLands,
  corruptionFromTaint, clampCorruption,
} from './rules.js'
import { SKILL_LABEL } from './cards/context.js'

const d = (f) => Math.floor(Math.random() * f) + 1
const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi)
const esc = (s) => String(s ?? '').replace(/</g, '&lt;').replace(/"/g, '&quot;')

// Build the bound action set for a given (sheet, terminal, transient) trio.
export function makeActions({ sheet, terminal, transient }) {
  const S = () => get(sheet)
  const mut = (fn) => sheet.update((s) => { fn(s); return s })
  const term = (html) => { transient.update((t) => ({ ...t, pendingLuck: null })); terminal.set(html) }
  const tr = () => get(transient)

  // ── generic counters ──
  const adj = (field, n) => mut((s) => { s[field] = Math.max(0, (parseInt(s[field], 10) || 0) + n) })
  const setAttr = (a, v) => mut((s) => { s[`val_${a}`] = clampAttr(v) })
  const toggle = (field) => mut((s) => { s[field] = !s[field] })

  // ── Luck (spend 1 AP to flip a borderline roll). The offer is exposed as
  // transient.pendingLuck so the Terminal card can render a REAL button (no
  // click-handling on {@html}, which would raise an a11y warning). ──
  function appendLuck(label, flip) {
    if ((parseInt(S().advancementPoints, 10) || 0) <= 0) return
    transient.update((t) => ({ ...t, pendingLuck: { flip, label } }))
  }
  function useLuck() {
    const p = tr().pendingLuck
    if (!p || (parseInt(S().advancementPoints, 10) || 0) <= 0) return
    mut((s) => { s.advancementPoints = (parseInt(s.advancementPoints, 10) || 0) - 1 })
    transient.update((t) => ({ ...t, pendingLuck: null }))
    p.flip()
  }

  // ── skills ──
  function skillTotalOf(s, sk) {
    const attr = { endurance: 'str', grip: 'str', reaction: 'dex', grace: 'dex', focus: 'wil', resolve: 'wil' }[sk]
    return attrBase(s[`val_${attr}`]) + (s.skillOrigin?.[sk] || 0) + (s.skillAsc?.[sk] || 0)
  }
  function skillCheck(sk) {
    const s = S(); const total = skillTotalOf(s, sk); const roll = d(100); const okk = roll <= total
    const head = `<span class="cap">Skill — ${SKILL_LABEL[sk]}</span>`
    term(`${head}<div class="line" style="color:${okk ? '#86efac' : '#fda4af'}">d100 [${roll}] vs Total [${total}%] → ${okk ? 'SUCCESS' : 'FAILURE'}</div>`)
    if (okk) mut((s2) => { s2[`chk_${sk}`] = true })
    else if (roll === total + 1) appendLuck('to success', () => term(`${head}<div class="line" style="color:#86efac">d100 [${roll}] nudged by Luck → SUCCESS</div>`))
  }
  function endSession() {
    const s = S(); const lines = []; let any = false
    mut((st) => {
      for (const sk of Object.keys(SKILL_LABEL)) {
        if (!st[`chk_${sk}`]) continue
        any = true
        const total = skillTotalOf(st, sk); const roll = d(100); const delta = endOfSessionGrowth(total, roll)
        st.skillAsc[sk] = Math.max(0, (st.skillAsc[sk] || 0) + delta)
        st[`chk_${sk}`] = false
        const why = delta === 2 ? 'crit success' : delta === -2 ? 'crit failure' : delta === 1 ? 'pushed past limit' : 'no change'
        lines.push(`${SKILL_LABEL[sk]}: d100 [${roll}] vs ${total}% → ${delta > 0 ? '+' : ''}${delta}% (${why})`)
      }
    })
    term(`<span class="cap">End-of-Session Growth</span>${any ? lines.map((l) => `<div class="line">${l}</div>`).join('') : '<div class="line">No skills were marked.</div>'}`)
  }
  const setSkill = (sk, key, v) => mut((s) => {
    const n = Math.max(0, parseInt(v, 10) || 0)
    if (key === 'origin') s.skillOrigin[sk] = n; else s.skillAsc[sk] = n
  })
  const adjSkillCrit = (sk, n) => mut((s) => { s[`crit_sk_${({ endurance: 'end', grip: 'grp', reaction: 'rea', grace: 'gra', focus: 'foc', resolve: 'res' })[sk]}`] = Math.max(0, (s[`crit_sk_${({ endurance: 'end', grip: 'grp', reaction: 'rea', grace: 'gra', focus: 'foc', resolve: 'res' })[sk]}`] || 0) + n) })
  const adjAttrCrit = (a, n) => mut((s) => { s[`crit_attr_${a}`] = Math.max(0, (s[`crit_attr_${a}`] || 0) + n) })

  // ── proficiencies ──
  function combatValue(s, p) { return combatCurrentFromWeapons(p.max, p.style, s.weapons) }
  function profRoll(i) {
    const s = S(); const p = s.profs[i]
    if (p.wounded) { term(`<span class="cap" style="color:var(--crimson)">Wounded</span><div class="line">${esc(p.title)} cannot be used until healed.</div>`); return }
    const value = p.combat ? combatValue(s, p) : p.cur
    const r = rollProficiency(value)
    if (p.combat) transient.update((t) => ({ ...t, lastCombatDamage: r.tier }))
    let crit = ''
    if (r.crit === 'success') crit = `<div class="line gold">🔥 Critical — natural 20</div>`
    else if (r.crit === 'lucky') crit = `<div class="line gold">✦ Rolled 1 → +10</div>`
    term(`<span class="cap">Proficiency — ${esc(p.combat ? (p.style || 'Combat') : p.title)}</span>
      <div class="line gold">d20 [${r.roll}] + value [${value}]${r.bonus ? ' + 10' : ''} = <b>${r.total}</b></div>
      <div class="line"><span class="tier-badge tier-${r.tier}">Tier ${r.tier || '—'}</span>${p.combat ? ` &nbsp; <b>${r.tier}</b> damage to challenge die` : ''}</div>${crit}`)
  }
  const setProf = (i, key, v) => mut((s) => {
    if (key === 'title' || key === 'style') s.profs[i][key] = v
    else { s.profs[i][key] = parseInt(v, 10) || 0; if (key === 'cur') setWounded(s.profs[i], s.profs[i].cur <= 0, s) }
  })
  const adjProfCrit = (i, n) => mut((s) => { s.profs[i].crit = Math.max(0, s.profs[i].crit + n) })
  function setWounded(p, on, s) {
    if (on) { if (!p.wounded) { p.wounded = true; p.woundRank = nextWoundRank(s.profs) } }
    else { p.wounded = false; p.woundRank = 0 }
  }
  const toggleWound = (i) => mut((s) => setWounded(s.profs[i], !s.profs[i].wounded, s))
  const addProf = () => mut((s) => { s.profs.push({ title: 'New Field', cur: 14, max: 14, combat: false, wounded: false, woundRank: 0, crit: 0 }) })
  const removeProf = (i) => mut((s) => { s.profs.splice(i, 1) })

  // ── sigils ──
  const SIG = (s, i) => s.sigilState[i]
  const sigTotalKey = ['sigilParry', 'sigilEvasion', 'sigilBarrier']
  const sigAttr = ['str', 'dex', 'wil']
  const sigLabel = ['Parry', 'Evasion', 'Barrier']
  function sigilAvail(s, i) { return (s[sigTotalKey[i]] || 0) - SIG(s, i).used - SIG(s, i).broken }
  const adjSigilTotal = (i, n) => mut((s) => {
    s[sigTotalKey[i]] = Math.max(0, (s[sigTotalKey[i]] || 0) + n)
    const down = SIG(s, i).used + SIG(s, i).broken
    if (down > s[sigTotalKey[i]]) { const ex = down - s[sigTotalKey[i]]; SIG(s, i).used = Math.max(0, SIG(s, i).used - ex); if (SIG(s, i).used + SIG(s, i).broken > s[sigTotalKey[i]]) SIG(s, i).broken = s[sigTotalKey[i]] - SIG(s, i).used }
  })
  function rollSigilAt(i) {
    const s = S()
    if (sigilAvail(s, i) <= 0) { term(`<span class="cap" style="color:var(--crimson)">None ready</span><div class="line">No ${sigLabel[i]} sigils ready — used ones return on a long rest; broken ones must be repaired.</div>`); return }
    mut((st) => { SIG(st, i).used++ })
    const r = rollSigil(clampAttr(S()[`val_${sigAttr[i]}`]))
    term(`<span class="cap">Sigil — ${sigLabel[i]}</span><div class="line">d20 [${r.roll}] + mod [${r.mod}] = ${r.total}</div><div class="line ${r.success ? 'gold' : ''}">${r.critical ? '🔥 Critical nullification' : (r.success ? 'Mitigated' : 'Check complete')}</div><div class="hint">Sigil spent — returns on long rest.</div>`)
  }
  function breakSigil(i) {
    const s = S(); if (sigilAvail(s, i) <= 0) return
    mut((st) => { SIG(st, i).broken++ })
    term(`<span class="cap" style="color:var(--crimson)">Sigil shattered</span><div class="line">An enemy crit broke a ${sigLabel[i]} sigil. Repair it on a long rest.</div>`)
  }
  const repairSigil = (i) => mut((s) => { if (SIG(s, i).broken <= 0 || tr().sigilRepairs <= 0) return; SIG(s, i).broken--; transient.update((t) => ({ ...t, sigilRepairs: t.sigilRepairs - 1 })) })

  // ── weapons ──
  const setWeap = (i, key, v) => mut((s) => {
    const w = s.weapons[i]
    if (key === 'mod' || key === 'unique') w[key] = parseInt(v, 10) || 0
    else w[key] = v
    if (key === 'rarity' && !(v === 'rare' || v === 'epic')) w.named = false
  })
  const toggleWeap = (i) => mut((s) => { s.weapons[i].equipped = !s.weapons[i].equipped })
  const toggleNamed = (i) => mut((s) => { const w = s.weapons[i]; w.named = !w.named; if (w.named && !w.namedTitle) w.namedTitle = w.name })
  const toggleWeapBroken = (i) => mut((s) => { s.weapons[i].broken = !s.weapons[i].broken })
  const removeWeapon = (i) => mut((s) => { s.weapons.splice(i, 1) })
  const addWeapon = () => mut((s) => { s.weapons.push({ name: 'New armament', rarity: 'common', mod: 0, combatType: 'Precision Strike', broken: false, named: false, namedTitle: '', unique: 0, equipped: false }) })

  // ── backpack ──
  const setItem = (i, key, v) => mut((s) => { s.inventory[i][key] = key === 'weight' ? (parseInt(v, 10) || 0) : v })
  const toggleItemBroken = (i) => mut((s) => { s.inventory[i].broken = !s.inventory[i].broken })
  const removeItem = (i) => mut((s) => { s.inventory.splice(i, 1) })
  const addItem = () => mut((s) => { s.inventory.push({ name: '', weight: 1, broken: false, prof: '—' }) })

  // ── manifestations / disciplines ──
  const setManifest = (i, key, v) => mut((s) => { s.manifestations[i][key] = (key === 'bow' || key === 'glyph' || key === 'ash' || key === 'successes') ? (parseInt(v, 10) || 0) : v })
  const adjManifest = (i, n) => mut((s) => { s.manifestations[i].successes = Math.max(0, s.manifestations[i].successes + n) })
  const delManifest = (i) => mut((s) => { s.manifestations.splice(i, 1) })
  const addManifest = (discId) => mut((s) => {
    const disc = discId && discId !== 'all' ? discId : (s.disciplines[0]?.id || 'bow')
    const m = { name: 'New manifestation', disc, desc: '', successes: 0 }
    const model = s.disciplines.find((x) => x.id === disc)?.model
    if (model === 'bow' || model === 'pharmakia') m.bow = 40
    if (model === 'magia') { m.glyph = 1; m.ash = 0 }
    s.manifestations.push(m)
  })
  const addDiscipline = (name, model) => mut((s) => {
    const colors = ['#fb923c', '#22d3ee', '#a3e635', '#f472b6', '#facc15']
    s.disciplines.push({ id: 'd' + Date.now(), name: name || 'New school', color: colors[s.disciplines.length % colors.length], model: model || 'custom' })
  })
  const togglePrep = () => mut((s) => { s.pharmakia.reagents = !s.pharmakia.reagents })
  const adjDose = (n) => mut((s) => { s.pharmakia.doses = Math.max(0, s.pharmakia.doses + n) })

  function manifestRoll(i) {
    const s = S(); const m = s.manifestations[i]; const disc = s.disciplines.find((x) => x.id === m.disc) || s.disciplines[0]
    const wil = clampAttr(s.val_wil)
    const cont = d(100); const contOk = containmentHolds(cont)
    const will = d(20); const willOk = willSteadies(will, wil)
    const head = `<span class="cap">Manifest — ${esc(m.name)}</span><div class="line"><span class="disc-dot" style="background:${disc.color}"></span>${esc(disc.name)}</div>`
    let body = `<div class="line" style="color:${contOk ? '#86efac' : '#fda4af'}">Containment d100 [${cont}] ≤ 60 → ${contOk ? 'CONTAINED' : '⚠ OVER — Taint risk'}</div>
      <div class="line" style="color:${willOk ? '#86efac' : '#fda4af'}">Will d20 [${will}] ≤ WIL [${wil}] → ${willOk ? 'STEADY' : 'FALTERS'}</div>`
    if (disc.model === 'bow' || disc.model === 'pharmakia') {
      if (disc.model === 'pharmakia' && !s.pharmakia.reagents && s.pharmakia.doses <= 0) {
        term(head + `<div class="line" style="color:#fda4af">No reagents prepared and no doses — cannot work this Pharmakia.</div>`); return
      }
      const succ = (contOk ? 1 : 0) + (willOk ? 1 : 0)
      const taint = manifestTaint(m.bow || 40, succ)
      mut((st) => {
        st.taintCur = (parseInt(st.taintCur, 10) || 0) + taint
        if (disc.model === 'pharmakia') { if (st.pharmakia.doses > 0) st.pharmakia.doses--; else st.pharmakia.reagents = false }
      })
      body += `<div class="line gold">${m.bow || 40} BoW · ${succ} success / ${2 - succ} fail → <b style="color:#a78bfa">+${taint} Taint</b></div>`
    } else if (disc.model === 'magia') {
      const g = m.glyph || 0, a = m.ash || 0
      if ((parseInt(s.favorGlyphs, 10) || 0) < g || (parseInt(s.archonAsh, 10) || 0) < a) { term(head + `<div class="line" style="color:#fda4af">Not enough Glyphs/Ash.</div>`); return }
      mut((st) => { st.favorGlyphs = (parseInt(st.favorGlyphs, 10) || 0) - g; st.archonAsh = (parseInt(st.archonAsh, 10) || 0) - a })
      body += `<div class="line gold">Spent ${g} Glyph(s) + ${a} Ash</div>`
      // §9.3 Magia taint-on-failure is UNSPECIFIED (no ruleset doc). Preserve the
      // prototype's flagged behaviour: surface it, apply no number.
      if (!contOk) body += `<div class="line" style="color:#fda4af">Containment breached — Taint accrues <span class="tip asm" data-tip="Magia taint-on-failure amount is not yet specified in the ruleset — flagged, no value applied.">ASM</span></div>`
    } else if (disc.model === 'intervention') {
      if ((parseInt(s.favorTokens, 10) || 0) <= 0) { term(head + `<div class="line" style="color:#fda4af">No Favor Token to spend.</div>`); return }
      let veil
      mut((st) => { st.favorTokens = (parseInt(st.favorTokens, 10) || 0) - 1; veil = (parseInt(st.veilCur, 10) || 0) + 10; st.veilCur = veil })
      const vr = d(100); const answered = interventionLands(vr, veil)
      body += `<div class="line gold">Spent 1 Token · Veil → ${veil}</div>
        <div class="line" style="color:${answered ? '#86efac' : '#fda4af'}">Veil d100 [${vr}] > Veil [${veil}] → ${answered ? 'THE ARCHON ANSWERS' : 'the veil is too thick'}</div>`
    }
    term(head + body)
    if (!contOk && cont === 61) appendLuck('containment', () => terminal.set(head + body + '<div class="line" style="color:#86efac">Luck → Containment held.</div>'))
    else if (!willOk && will === wil + 1) appendLuck('will', () => terminal.set(head + body + '<div class="line" style="color:#86efac">Luck → Will steadied.</div>'))
  }

  // ── trackers ──
  function purgeTaint() {
    const t = parseInt(S().taintCur, 10) || 0; if (t <= 0) { term('<div class="line">No Taint to purge.</div>'); return }
    mut((s) => { s.corruptionVal = clampCorruption((parseInt(s.corruptionVal, 10) || 0) + corruptionFromTaint(t)); s.taintCur = 0 })
  }
  const drainOne = () => mut((s) => { s.corruptionVal = Math.max(0, (parseInt(s.corruptionVal, 10) || 0) - 1) })
  const synthesize = () => mut((s) => { if ((parseInt(s.favorGlyphs, 10) || 0) >= 3) { s.favorGlyphs = (parseInt(s.favorGlyphs, 10) || 0) - 3; s.favorTokens = (parseInt(s.favorTokens, 10) || 0) + 1 } })
  const rollArchonDomain = () => mut((s) => { s.archonDomain = archonRegistry[d(archonRegistry.length) - 1] })

  // ── dice / oracle ──
  function doDice() {
    const s = S(); const r = rollDiceTray(s.diceQty, s.diceSides)
    let flag = ''
    if (r.flag === 'crit') flag = '<div class="line gold">🔥 Critical success</div>'
    else if (r.flag === 'fumble') flag = '<div class="line" style="color:#fda4af">💀 Critical fumble</div>'
    term(`<div class="line">Output [ ${r.results.join(', ')} ]</div>${r.count > 1 ? `<div class="line">Total ${r.total}</div>` : ''}${flag}`)
  }
  function doOracle() { const r = rollOracle(); term(`<span class="cap">The Fate Oracle Decides</span><div class="line" style="color:${r.color}; font-weight:700">[${r.roll}] — ${r.judgment}</div>`) }

  // ── time & rest ──
  const advanceDays = (n) => mut((s) => {
    let day = s.cal.day + n
    while (day > 30) { day -= 30; s.cal.month++ }
    while (s.cal.month > 12) { s.cal.month -= 12; s.cal.crucible++ }
    s.cal.day = day
  })
  const advanceHours = (n) => { mut((s) => { let h = s.cal.hour + n; let extra = 0; while (h >= 24) { h -= 24; extra++ } s.cal.hour = h; if (extra) { let day = s.cal.day + extra; while (day > 30) { day -= 30; s.cal.month++ } while (s.cal.month > 12) { s.cal.month -= 12; s.cal.crucible++ } s.cal.day = day } }) }
  function longRest() {
    const kit = S().inventory.some((it) => !it.broken && /repair\s*kit/i.test(it.name || ''))
    mut((s) => { s.sigilState.forEach((x) => { x.used = 0 }); s.cal.hour = 8 })
    transient.update((t) => ({ ...t, sigilRepairs: kit ? 2 : 1 }))
    term(`<span class="cap">Long Rest</span><div class="line">Used sigils restored. Repairs available: <b class="gold">${kit ? 2 : 1}</b>${kit ? ' (repair kit)' : ''}. Heal one wound via the Wounds list; a vision may be folded in free.</div>`)
  }
  function healWound(i) {
    const p = S().profs[i]; const rank = p.woundRank || 1; const days = healDays(rank)
    mut((s) => { setWounded(s.profs[i], false, s); if (s.profs[i].cur <= 0) s.profs[i].cur = s.profs[i].max })
    advanceDays(days)
    term(`<span class="cap">Recovery</span><div class="line">${esc(p.title)} (wound #${rank}) healed after ${woundTimeLabel(rank)}. Current restored.</div>`)
  }

  // ── challenge die ──
  function markLastDamage(addToWounds) { addToWounds(tr().lastCombatDamage || 0) }
  function issueChallenge(dieSize, wounds) {
    const r = challengeResolve(dieSize, wounds, null)
    if (r.outcome === 'none') return '<div class="line">No wounds marked — land a hit first.</div>'
    if (r.outcome === 'clean') return '<div class="line gold">Maximum wounds — clean defeat, no challenge needed.</div>'
    if (r.outcome === 'defeated') return `<div class="line">Challenge d${r.die} [${r.roll}] &lt; ${r.wounds} → <b style="color:#86efac">Morale broken — defeated / flees.</b></div>`
    return `<div class="line">Challenge d${r.die} [${r.roll}] ≥ ${r.wounds} → <b style="color:#fda4af">Holds. Only reaching ${r.die} wounds defeats it now.</b></div>`
  }

  // ── vision ──
  function seekVision(question, foldedIntoRest) {
    const roll = d(100)
    if (!foldedIntoRest) advanceHours(3)
    transient.update((t) => ({ ...t, lastVision: { q: question, roll } }))
    return { roll, q: question, free: foldedIntoRest }
  }

  // ── notes (quick capture → in-memory sheet.notes; shell persists) ──
  const addNote = (cat, text, detail) => mut((s) => { (s.notes ||= []).unshift({ cat, text, detail: detail || '' }) })
  const setNote = (i, key, v) => mut((s) => { s.notes[i][key] = v })
  const removeNote = (i) => mut((s) => { s.notes.splice(i, 1) })

  // ── deeds (quick view; reuses the deeds feature shape) ──
  const addDeed = (text, ap) => mut((s) => { (s.deeds ||= []).push({ title: text, desc: '', apValue: parseInt(ap, 10) || 0, isGlobal: false, claimed: false }) })
  const toggleDeed = (i) => mut((s) => { const d2 = s.deeds[i]; d2.claimed = !d2.claimed; s.advancementPoints = Math.max(0, (parseInt(s.advancementPoints, 10) || 0) + (d2.claimed ? d2.apValue : -d2.apValue)) })
  const delDeed = (i) => mut((s) => { const d2 = s.deeds[i]; if (d2.claimed) s.advancementPoints = Math.max(0, (parseInt(s.advancementPoints, 10) || 0) - d2.apValue); s.deeds.splice(i, 1) })
  const sendDeedToNotes = (i) => { const d2 = S().deeds[i]; addNote('Deed', d2.title, `Reward: +${d2.apValue} AP`) }
  const sendVisionToNotes = () => { const v = tr().lastVision; if (v) addNote('Vision', `${v.q || 'Vision sought'} — rolled ${v.roll}`, '') }

  return {
    adj, setAttr, toggle, useLuck,
    skillCheck, endSession, setSkill, adjSkillCrit, adjAttrCrit, skillTotalOf,
    profRoll, setProf, adjProfCrit, toggleWound, addProf, removeProf, combatValue,
    adjSigilTotal, rollSigilAt, breakSigil, repairSigil, sigilAvail,
    setWeap, toggleWeap, toggleNamed, toggleWeapBroken, removeWeapon, addWeapon,
    setItem, toggleItemBroken, removeItem, addItem,
    setManifest, adjManifest, delManifest, addManifest, addDiscipline, togglePrep, adjDose, manifestRoll,
    purgeTaint, drainOne, synthesize, rollArchonDomain,
    doDice, doOracle,
    advanceDays, advanceHours, longRest, healWound,
    markLastDamage, issueChallenge, seekVision,
    addNote, setNote, removeNote,
    addDeed, toggleDeed, delDeed, sendDeedToNotes, sendVisionToNotes,
    weaponEffectiveBonus, tierOf,
  }
}
