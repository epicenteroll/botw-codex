// session.js — the real auth core (§7b, §8 Phase 1).
//
// Ported from the live HTML's auth logic (signUp / signInWithPassword /
// signOut / updateUser, the onAuthStateChange stream, and the user_roles admin
// check) with every getElementById / alert / location.reload removed. It is the
// data layer for "who is logged in and as which vessel".
//
// It exports the SAME names the atlas already imports from its old mock
// stores.js — `session`, `vesselId`, `isAdmin` — so atlas components keep
// working unchanged; they just read the real values now.
//
// Components never import supabase directly (§5 rule 2). They call the actions
// below (signIn, signOut, …) and read the stores.

import { writable, derived } from 'svelte/store'
import { supabase, isSupabaseConfigured } from './supabase.js'

// ---- stores the rest of the app reads ----
export const session = writable(null) // the Supabase Session object, or null
export const user = derived(session, ($s) => $s?.user ?? null)
export const isAdmin = writable(false) // true when this account has role 'admin'
export const vesselId = writable(null) // the currently selected character_vessels.id
export const authReady = writable(false) // initial auth check finished (avoids UI flash)

let _wired = false

// initAuth — call once from the app shell (routes/+layout.svelte onMount).
// Subscribes to Supabase's auth stream; in v2 the callback fires immediately
// with the restored session (if any), which is what resolves authReady.
export function initAuth() {
  if (_wired) return
  _wired = true

  if (!isSupabaseConfigured || !supabase) {
    // Offline / demo mode: no backend to ask. The app still runs; the atlas
    // shows its bundled seed and the auth bar shows a notice.
    authReady.set(true)
    return
  }

  supabase.auth.onAuthStateChange((_event, newSession) => {
    session.set(newSession)
    if (newSession?.user) {
      refreshAdminRole(newSession.user.id)
    } else {
      isAdmin.set(false)
      vesselId.set(null)
    }
    authReady.set(true)
  })
}

// Background admin-role lookup — never blocks the UI. Mirrors the live app:
// an account is admin iff it has a row in user_roles with role = 'admin'.
async function refreshAdminRole(userId) {
  try {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle()
    isAdmin.set(data?.role === 'admin')
  } catch {
    isAdmin.set(false)
  }
}

// ---- actions (each returns { ok } or { error } — no alert(), no DOM) ----

export async function signIn(email, password) {
  if (!supabase) return { error: 'Supabase is not configured.' }
  if (!email || !password) return { error: 'Enter your email and password.' }
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return error ? { error: error.message } : { ok: true }
}

export async function signUp(email, password) {
  if (!supabase) return { error: 'Supabase is not configured.' }
  if (!email || !password) return { error: 'Enter your email and password.' }
  const { error } = await supabase.auth.signUp({ email, password })
  return error ? { error: error.message } : { ok: true }
}

export async function signOut() {
  vesselId.set(null)
  isAdmin.set(false)
  if (supabase) await supabase.auth.signOut()
  return { ok: true }
}

export async function changePassword(newPassword) {
  if (!supabase) return { error: 'Supabase is not configured.' }
  if (!newPassword || newPassword.length < 8)
    return { error: 'Password must be at least 8 characters.' }
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  return error ? { error: error.message } : { ok: true }
}
