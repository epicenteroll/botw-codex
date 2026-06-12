// supabase.js — THE single Supabase client for the whole Codex (§4 lib/core).
//
// Every feature imports this one client (the atlas re-exports it). Reads the
// project URL + anon key from .env.local at build time:
//   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
//
// If both are blank, `supabase` is null and `isSupabaseConfigured` is false.
// In that state the app runs fully offline — the atlas falls back to its bundled
// seed and the auth bar shows a "demo / offline" notice. Fill .env.local to talk
// to the real project; no code changes either way.
//
// Note: the anon key is meant to live in client code — it is the PUBLIC key, and
// your data is protected by Row-Level Security in Supabase, not by hiding it.
// Never put the *service_role* key here.

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env?.VITE_SUPABASE_URL || ''
const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || ''

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = isSupabaseConfigured ? createClient(url, anonKey) : null
