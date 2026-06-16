// submissionsData.js — the data layer for the vessel-note → GM review queue.
// The ONLY notes file besides notesData.js that talks to Supabase. Mirrors the
// rest of the app: it guards isSupabaseConfigured (offline → harmless no-ops),
// and all access control is enforced by Row-Level Security on note_submissions
// (db/migrations/003_note_submissions.sql), not by trusting the client.
//
// A submission is a SNAPSHOT of a note at submit time — editing the note later
// does not change what the GM is reviewing. Approving one does not yet write to
// the encyclopedia; Phase D wires an approved row into the import/upsert path.

import { supabase, isSupabaseConfigured } from '$lib/core/supabase.js'
import { normalizeCategory, BOOK_TO_ENTITY_TYPE } from './rules.js'
import { buildPlan, submissionToPatchEntity } from '$lib/features/atlas/lib/importWorld.js'
import { uuidFromSlug, toSlug } from '$lib/features/atlas/lib/linkResolve.js'
import { upsertEntity } from '$lib/features/atlas/lib/dataLayer.js'

const TABLE = 'note_submissions'

export const STATUS_LABEL = {
  pending: 'Pending review',
  approved: 'Approved',
  changes_requested: 'Sent back',
  declined: 'Declined',
}

// Submit one note for review. `note` is { title, category, content }.
export async function submitNote(vesselId, note) {
  if (!isSupabaseConfigured || !supabase) return { ok: true } // offline: no-op
  if (!vesselId) return { error: 'No vessel selected.' }
  const book = normalizeCategory(note?.category)
  const row = {
    vessel_id: vesselId,
    title: (note?.title || '').slice(0, 300),
    content: note?.content || '',
    category: book,
    proposed_type: BOOK_TO_ENTITY_TYPE[book] || 'lore_entry',
    status: 'pending',
  }
  const { error } = await supabase.from(TABLE).insert(row)
  return error ? { error: error.message } : { ok: true }
}

// A player's own submissions for the current vessel (RLS also limits to own).
export async function mySubmissions(vesselId) {
  if (!isSupabaseConfigured || !supabase || !vesselId) return { ok: true, rows: [] }
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('vessel_id', vesselId)
    .order('created_at', { ascending: false })
  return error ? { error: error.message } : { ok: true, rows: data || [] }
}

// All submissions, newest first — admin only (RLS returns nothing for players).
// Pass a status to filter (e.g. 'pending'); omit for everything.
export async function allSubmissions(status = null) {
  if (!isSupabaseConfigured || !supabase) return { ok: true, rows: [] }
  let q = supabase.from(TABLE).select('*').order('created_at', { ascending: false })
  if (status) q = q.eq('status', status)
  const { data, error } = await q
  return error ? { error: error.message } : { ok: true, rows: data || [] }
}

// GM action on a submission: approve | send back (with feedback) | decline.
// `reviewerId` is the admin's auth user id (from session `user`).
export async function reviewSubmission(id, status, { feedback = '', reviewerId = null } = {}) {
  if (!isSupabaseConfigured || !supabase) return { ok: true }
  if (!['approved', 'changes_requested', 'declined'].includes(status))
    return { error: 'Invalid review action.' }
  const patch = {
    status,
    gm_feedback: feedback || '',
    reviewed_by: reviewerId || null,
    reviewed_at: new Date().toISOString(),
  }
  const { error } = await supabase.from(TABLE).update(patch).eq('id', id)
  return error ? { error: error.message } : { ok: true }
}

// Player withdraws an open (pending / sent-back) submission.
export async function withdrawSubmission(id) {
  if (!isSupabaseConfigured || !supabase) return { ok: true }
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  return error ? { error: error.message } : { ok: true }
}

// approveToCodex — Phase D: turn an approved submission into a codex DRAFT,
// reusing the exact import path (buildPlan + dataLayer.upsertEntity) so it is
// idempotent and merges with anything already there. We first fetch the one
// existing row by its deterministic id and feed it to buildPlan as `existing`,
// so a MERGE appends the note's text and PRESERVES is_published / geometry —
// never clobbering a published entry or unpublishing it. A brand-new subject is
// created with is_published:false. Re-approving the same note is a no-op.
// Returns { ok, created, entityId } or { error }.
export async function approveToCodex(sub) {
  const entity = submissionToPatchEntity(sub)
  let existing = []
  if (isSupabaseConfigured && supabase) {
    const id = uuidFromSlug(toSlug(entity.name))
    const { data, error } = await supabase
      .from('world_encyclopedia')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) return { error: error.message }
    if (data) existing = [data]
  }
  const plan = buildPlan({ entities: [entity] }, existing)
  if (plan.errors.length) return { error: plan.errors[0] }
  const e = plan.entities[0]
  if (!e) return { ok: true, created: false, entityId: existing[0]?.id || null } // already present
  const res = await upsertEntity(e)
  if (res && res.error) return { error: res.error }
  return { ok: true, created: plan.counts.create > 0, entityId: e.id }
}
