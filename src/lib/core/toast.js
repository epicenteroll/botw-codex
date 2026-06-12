// toast.js — ONE notification system for the whole app (§4 lib/core, §7).
//
// This is the atlas's stacking-toast queue, lifted out of its throwaway shell
// into a shared store so every feature uses the same notifications. A toast is
// { id, msg, kind, action } where kind is '' | 'warn' | 'error' and action is
// an optional { label, fn } (e.g. an Undo button). The layout renders the stack
// with aria-live="polite". Call pushToast('done') or
// pushToast({ msg, kind: 'error' }).

import { writable } from 'svelte/store'

export const toasts = writable([]) // [{ id, msg, kind, action }]

let seq = 0

export function pushToast(detail) {
  const t = typeof detail === 'string' ? { msg: detail } : detail || {}
  const id = ++seq
  const entry = { id, msg: t.msg, kind: t.kind || '', action: t.action || null }
  toasts.update((list) => [...list, entry])
  const ttl = entry.kind === 'error' ? 4200 : 2400
  if (typeof window !== 'undefined') setTimeout(() => dismissToast(id), ttl)
  return id
}

export function dismissToast(id) {
  toasts.update((list) => list.filter((t) => t.id !== id))
}
