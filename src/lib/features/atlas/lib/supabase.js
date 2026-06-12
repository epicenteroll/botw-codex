// supabase.js — Phase 1 merge: the atlas no longer creates its own client.
// It re-exports the single app-wide client (lib/core/supabase.js) so the whole
// Codex shares ONE Supabase connection (§4). The data layer keeps importing
// './supabase.js', so nothing else in the atlas changes.
export { supabase, isSupabaseConfigured } from '$lib/core/supabase.js'
