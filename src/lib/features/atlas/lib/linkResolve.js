// linkResolve.js — resolve [[wiki|links]] to entities whether the target was
// written as a real id (UUID), a slug, or a bare name.
//
// Why this exists (the parked cross-link bug): seeded and imported lore targets
// entities by SLUG, e.g. [[Pale Reach|pale-reach]]. In Supabase mode an entity's
// id is a DETERMINISTIC UUID derived from that slug — id === uuidFromSlug(slug),
// exactly as scripts/gen-world-sql.js generates it. So a raw byId('pale-reach')
// misses (the row's id is the UUID) and the link renders as dead text. We bridge
// by recomputing the same UUID from the slug. In mock mode (where ids ARE slugs)
// the direct match wins first, so behaviour is unchanged there.

// --- SHA-1 (synchronous, UTF-8) — must match Node's crypto.createHash('sha1') ---
function sha1hex(str) {
  const bytes = []
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i)
    if (c < 0x80) bytes.push(c)
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f))
    else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f))
  }
  const ml = bytes.length * 8
  bytes.push(0x80)
  while (bytes.length % 64 !== 56) bytes.push(0)
  for (let i = 7; i >= 0; i--) bytes.push(Math.floor(ml / Math.pow(2, 8 * i)) & 0xff)

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0
  const w = new Array(80)
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++)
      w[i] = (bytes[off + 4 * i] << 24) | (bytes[off + 4 * i + 1] << 16) | (bytes[off + 4 * i + 2] << 8) | bytes[off + 4 * i + 3]
    for (let i = 16; i < 80; i++) {
      const n = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]
      w[i] = (n << 1) | (n >>> 31)
    }
    let a = h0, b = h1, c = h2, d = h3, e = h4
    for (let i = 0; i < 80; i++) {
      let f, k
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999 }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1 }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc }
      else { f = b ^ c ^ d; k = 0xca62c1d6 }
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) | 0
      e = d; d = c; c = (b << 30) | (b >>> 2); b = a; a = t
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0
  }
  const hx = (n) => (n >>> 0).toString(16).padStart(8, '0')
  return hx(h0) + hx(h1) + hx(h2) + hx(h3) + hx(h4)
}

const _idCache = new Map()

// Deterministic UUID from a slug. Byte-for-byte identical to gen-world-sql.js.
export function uuidFromSlug(slug) {
  if (_idCache.has(slug)) return _idCache.get(slug)
  const h = sha1hex('botw:' + slug)
  const id = `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
  _idCache.set(slug, id)
  return id
}

// Lowercase, hyphenated slug from a display name (best-effort, for bare [[Name]]).
export function toSlug(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

// Resolve a link target to an entity. Tries, in order:
//   1. exact id (real UUID, or slug-as-id in mock mode)
//   2. the slug recomputed to its deterministic UUID
//   3. the target slugified, then to its UUID (handles bare [[Pale Reach]])
//   4. a case-insensitive name match, with or without a leading "The "
// Returns the entity or null. Pure — no DB calls.
export function resolveLinkTarget(entities, target) {
  if (!target || !entities || !entities.length) return null
  const direct = entities.find((e) => e.id === target)
  if (direct) return direct
  const bySlug = entities.find((e) => e.id === uuidFromSlug(target))
  if (bySlug) return bySlug
  const bySlugified = entities.find((e) => e.id === uuidFromSlug(toSlug(target)))
  if (bySlugified) return bySlugified
  const t = target.trim().toLowerCase()
  const strip = (s) => (s || '').replace(/^the\s+/i, '').trim().toLowerCase()
  return entities.find((e) => e.name && (e.name.toLowerCase() === t || strip(e.name) === strip(target))) || null
}
