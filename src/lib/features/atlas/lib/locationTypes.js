// locationTypes.js — the location-type system (Section 11 of the master plan).
// NOTE: the plan's heading says "53 types", but the enumerated list in Section 11
// actually contains 62 distinct types. All 62 are transcribed faithfully below.
// (Discrepancy flagged in the README — confirm the intended count.)
// Colour language:
//   gold   = civilisation / holy        violet = corruption / the unseen
//   red    = danger                     teal   = water
//   grey   = ruin / stone               white  = figures
//   crimson= faction seats              sand   = natural land
//
// The master plan allows keeping these as a constant rather than a DB table.
// `npm run gen:sql` reads this file to emit the location_types seed INSERTs,
// so the Supabase table and this constant never drift.

export const TYPE_COLOURS = {
  gold:    '#d4af37',
  crimson: '#c0392b',
  red:     '#e05a3a',
  teal:    '#2a9d8f',
  violet:  '#9b59d0',
  grey:    '#9aa0aa',
  white:   '#e8e6df',
  sand:    '#c8a96a',
}

// id, display_name, category, colour key, icon glyph (used by the simple sprite sheet)
const T = (id, display_name, category, colour, glyph, description = '') =>
  ({ id, display_name, category, colour, marker_colour: TYPE_COLOURS[colour], glyph, icon_ref: `#icon-${id}`, description })

export const LOCATION_TYPES = [
  // ── Settlements & Habitation ──────────────────────────────────────────────
  T('settlement',        'Settlement',          'Settlements & Habitation', 'gold',   '⌂'),
  T('city',              'City',                'Settlements & Habitation', 'gold',   '🏙'),
  T('oasis_town',        'Oasis Town',          'Settlements & Habitation', 'teal',   '◍'),
  T('walled_oasis',      'Walled Oasis',        'Settlements & Habitation', 'teal',   '⬡'),
  T('camp',              'Camp',                'Settlements & Habitation', 'sand',   '⛺'),
  T('gate_town',         'Gate-Town',           'Settlements & Habitation', 'gold',   '⛩'),
  T('tribal_encampment', 'Tribal Encampment',   'Settlements & Habitation', 'sand',   '⌾'),
  T('rancho_holdfast',   'Rancho Holdfast',     'Settlements & Habitation', 'crimson','▣'),
  T('waystation',        'Waystation',          'Settlements & Habitation', 'gold',   '⊞'),
  T('outlaw_den',        'Outlaw Den',          'Settlements & Habitation', 'red',    '☠'),

  // ── Ruins & Ancient Structures ────────────────────────────────────────────
  T('ruins',             'Ruins',               'Ruins & Ancient Structures', 'grey', '⌓'),
  T('ancient_structure', 'Ancient Structure',   'Ruins & Ancient Structures', 'grey', '◰'),
  T('buried_facility',   'Buried Facility',      'Ruins & Ancient Structures', 'grey', '⊟'),
  T('tower',             'Tower',               'Ruins & Ancient Structures', 'grey', '♜'),
  T('aqueduct',          'Aqueduct',            'Ruins & Ancient Structures', 'grey', '╫'),
  T('wall_section',      'Wall Section',        'Ruins & Ancient Structures', 'grey', '▤'),
  T('tomb',              'Tomb / Crypt',        'Ruins & Ancient Structures', 'grey', '⚰'),
  T('monument',          'Monument',            'Ruins & Ancient Structures', 'gold', '⛫'),
  T('collapsed_site',    'Collapsed Site',      'Ruins & Ancient Structures', 'grey', '⌗'),

  // ── Natural Features ──────────────────────────────────────────────────────
  T('cave',              'Cave',                'Natural Features', 'sand', '◖'),
  T('cavern_system',     'Cavern System',       'Natural Features', 'sand', '◗'),
  T('canyon',            'Canyon / Gully',      'Natural Features', 'sand', '⩒'),
  T('dune_field',        'Dune Field',          'Natural Features', 'sand', '⌣'),
  T('salt_flat',         'Salt Flat',           'Natural Features', 'white','▭'),
  T('spire_grove',       'Spire Grove',         'Natural Features', 'teal', '♣'),
  T('mountain_pass',     'Mountain Pass',       'Natural Features', 'sand', '⩘'),
  T('plateau',           'Plateau',             'Natural Features', 'sand', '▱'),
  T('bone_field',        'Bone Field',          'Natural Features', 'white','⚆'),

  // ── Water & Resources ─────────────────────────────────────────────────────
  T('oasis',             'Oasis',               'Water & Resources', 'teal', '❍'),
  T('underground_river', 'Underground River',   'Water & Resources', 'teal', '≋'),
  T('well',              'Well / Spring',       'Water & Resources', 'teal', '◉'),
  T('dam',               'Dam / Cistern',       'Water & Resources', 'teal', '⊐'),
  T('mine',              'Mine',                'Water & Resources', 'grey', '⛏'),
  T('scrap_field',       'Scrap Field',         'Water & Resources', 'grey', '⚙'),
  T('vein_deposit',      'Vein Deposit',        'Water & Resources', 'violet','◈'),

  // ── Danger & Creatures ────────────────────────────────────────────────────
  T('monster_lair',      'Monster Lair',        'Danger & Creatures', 'red', '𓆣'),
  T('predator_territory','Predator Territory',  'Danger & Creatures', 'red', '𓃥'),
  T('karrath_ground',    'Karrath Hunting Ground','Danger & Creatures','red', '☾'),
  T('swallowed_sighting','Swallowed One Sighting','Danger & Creatures','violet','◐'),
  T('ambush_site',       'Ambush Site',         'Danger & Creatures', 'red', '✶'),
  T('hazard_zone',       'Hazard Zone',         'Danger & Creatures', 'red', '⚠'),

  // ── Corruption & the Unseen ───────────────────────────────────────────────
  T('corruption_zone',   'Corruption Zone',     'Corruption & the Unseen', 'violet','☣'),
  T('vein_breach',       'Vein Breach',         'Corruption & the Unseen', 'violet','◆'),
  T('nightmare_site',    'Nightmare Manifestation','Corruption & the Unseen','violet','☄'),
  T('echo_pocket',       'Echo Pocket (Beauty)','Corruption & the Unseen', 'gold',  '✦'),
  T('echo_trauma',       'Echo Trauma',         'Corruption & the Unseen', 'violet','✧'),
  T('veil_thin',         'Veil-Thin Site',      'Corruption & the Unseen', 'violet','◌'),
  T('anchor_site',       'Anchor Site',         'Corruption & the Unseen', 'violet','✚'),
  T('darkroad_node',     'Dark Road Node',      'Corruption & the Unseen', 'violet','⬗'),

  // ── Religious & Holy ──────────────────────────────────────────────────────
  T('shrine',            'Shrine',              'Religious & Holy', 'gold', '⛬'),
  T('temple',            'Temple',              'Religious & Holy', 'gold', '⛪'),
  T('monastery',         'Monastery',           'Religious & Holy', 'gold', '☥'),
  T('holy_site',         'Holy Site',           'Religious & Holy', 'gold', '✟'),
  T('wall_sanctum',      'Wall Sanctum',        'Religious & Holy', 'gold', '⛨'),
  T('blood_moon_altar',  'Blood Moon Altar',    'Religious & Holy', 'crimson','☽'),

  // ── Routes & Passages ─────────────────────────────────────────────────────
  T('waypoint',          'Road Waypoint',       'Routes & Passages', 'gold', '⬢'),
  T('crossroads',        'Crossroads',          'Routes & Passages', 'gold', '✛'),
  T('bridge',            'Bridge / Crossing',   'Routes & Passages', 'grey', '╪'),
  T('border_marker',     'Border Marker',       'Routes & Passages', 'grey', '⬓'),
  T('trailhead',         'Trailhead',           'Routes & Passages', 'sand', '➤'),

  // ── Figures & Factions ────────────────────────────────────────────────────
  T('npc',               'Figure',              'Figures & Factions', 'white',  '☗'),
  T('faction_seat',      'Faction Seat',        'Figures & Factions', 'crimson','⚐'),
]

export const TYPES_BY_CATEGORY = LOCATION_TYPES.reduce((acc, t) => {
  ;(acc[t.category] ||= []).push(t)
  return acc
}, {})

export const TYPE_MAP = Object.fromEntries(LOCATION_TYPES.map(t => [t.id, t]))

export function typeColour(id) {
  return TYPE_MAP[id]?.marker_colour || '#94a3b8'
}
export function typeGlyph(id) {
  return TYPE_MAP[id]?.glyph || '•'
}

// ── Marker sprite (Section 14) ────────────────────────────────────────────
// Inline SVG path fragments, drawn at the marker origin (use currentColor so
// the type colour drives the glyph). A representative subset of the type set;
// any type without a bespoke glyph falls back to `default`. Expand freely.
export const ICONS = {
  default: '<circle r="5"/>',
  settlement: '<path d="M-5 4 L-5 -1 L0 -5 L5 -1 L5 4 Z"/>',
  city: '<path d="M-6 4 L-6 -2 L-2 -2 L-2 -5 L2 -5 L2 -2 L6 -2 L6 4 Z"/>',
  oasis_town: '<circle r="4"/><path d="M0 -8 q4 4 0 8 q-4 -4 0 -8" />',
  walled_oasis: '<rect x="-5" y="-5" width="10" height="10" rx="1"/><circle r="2.2" fill="#0a0a0f"/>',
  rancho_holdfast: '<path d="M-6 5 L-6 -3 L0 -7 L6 -3 L6 5 Z M-2 5 L-2 0 L2 0 L2 5"/>',
  collapsed_site: '<path d="M-6 5 L-3 -3 L0 2 L3 -4 L6 5 Z"/>',
  buried_facility:
    '<path d="M-6 -2 a6 6 0 0 1 12 0 Z"/><path d="M-6 1 H6" stroke="currentColor" stroke-width="1.4"/>',
  monastery: '<path d="M0 -8 L0 -3 M-3 -5 H3 M-5 5 L-5 -1 L0 -4 L5 -1 L5 5 Z"/>',
  ruins: '<path d="M-6 5 V-2 M-2 5 V-4 M2 5 V-1 M6 5 V-3" stroke="currentColor" stroke-width="2" fill="none"/>',
  tower: '<path d="M-3 5 V-5 L0 -7 L3 -5 V5 Z"/>',
  aqueduct:
    '<path d="M-7 5 V0 M-2 5 V0 M3 5 V0 M-7 0 a2.5 2.5 0 0 1 5 0 M-2 0 a2.5 2.5 0 0 1 5 0" stroke="currentColor" stroke-width="1.6" fill="none"/>',
  wall_section: '<rect x="-7" y="-2" width="4" height="7"/><rect x="-1" y="-4" width="4" height="9"/><rect x="5" y="-2" width="4" height="7"/>',
  underground_river: '<path d="M-7 0 q3.5 -5 7 0 t7 0" stroke="currentColor" stroke-width="1.8" fill="none"/>',
  well: '<circle r="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle r="1.6"/>',
  dam: '<path d="M-6 5 L6 -5 M-6 5 V-3 M6 -5 V3" stroke="currentColor" stroke-width="1.8" fill="none"/>',
  mine: '<path d="M-5 5 L0 -5 L5 5 M-6 5 H6" stroke="currentColor" stroke-width="1.8" fill="none"/>',
  scrap_field: '<path d="M-5 -3 L5 3 M-5 3 L5 -3 M0 -6 V6" stroke="currentColor" stroke-width="1.6"/>',
  oasis: '<circle r="4.5"/><path d="M0 -9 q5 5 0 9 q-5 -4 0 -9"/>',
  spire_grove:
    '<path d="M-3 5 V-3 a3 3 0 0 1 6 0 V5 M-3 0 H-6 a2 2 0 0 1 0 -4 M3 0 H6 a2 2 0 0 1 0 -4" stroke="currentColor" stroke-width="1.6" fill="none"/>',
  bone_field:
    '<path d="M-6 -4 a1.6 1.6 0 1 0 .1 0 M6 4 a1.6 1.6 0 1 0 .1 0 M-5 -3 L5 3" stroke="currentColor" stroke-width="1.6" fill="none"/>',
  dune_field: '<path d="M-7 2 q3.5 -5 7 0 t7 0" stroke="currentColor" stroke-width="1.8" fill="none"/>',
  karrath_ground: '<path d="M0 -6 L2 -1 L7 -1 L3 2 L4 7 L0 4 L-4 7 L-3 2 L-7 -1 L-2 -1 Z"/>',
  monster_lair:
    '<path d="M-6 4 q1 -8 6 -8 q5 0 6 8 q-3 -3 -6 -3 q-3 0 -6 3" /><circle cx="-2" cy="-1" r="1" fill="#0a0a0f"/><circle cx="2" cy="-1" r="1" fill="#0a0a0f"/>',
  vein_breach: '<path d="M0 -7 L2 -1 L6 0 L2 2 L3 7 L0 3 L-3 6 L-2 1 L-6 0 L-2 -1 Z"/>',
  vein_deposit: '<path d="M0 -7 L2 -1 L6 0 L2 2 L3 7 L0 3 L-3 6 L-2 1 L-6 0 L-2 -1 Z"/>',
  corruption_zone:
    '<circle r="5.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 2"/><circle r="2"/>',
  gate_town: '<path d="M-5 5 V-2 a5 5 0 0 1 10 0 V5 Z M-2 5 V0 H2 V5"/>',
  wall_sanctum: '<path d="M-6 5 V-1 M-3 5 V-3 M0 5 V-5 M3 5 V-3 M6 5 V-1" stroke="currentColor" stroke-width="2" fill="none"/>',
  waypoint: '<circle r="4" fill="none" stroke="currentColor" stroke-width="1.8"/><circle r="1.5"/>',
  bridge: '<path d="M-7 2 q7 -8 14 0 M-7 2 V5 M7 2 V5" stroke="currentColor" stroke-width="1.6" fill="none"/>',
  npc: '<circle cy="-3" r="3"/><path d="M-5 6 a5 6 0 0 1 10 0 Z"/>',
  faction_seat: '<path d="M-4 6 V-5 H4 L2 -2 H4 V0 H-2 V6 Z"/>',
}
export function iconFor(sub) {
  return ICONS[sub] || ICONS.default
}
export function colourFor(sub) {
  return TYPE_MAP[sub]?.marker_colour || '#9a9aa3'
}
