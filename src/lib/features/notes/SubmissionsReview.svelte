<script>
  // SubmissionsReview.svelte — the GM's review queue for vessel-note submissions
  // (Phase B). Admin-only; the parent renders it inside {#if $isAdmin}. All
  // access is still enforced by RLS on note_submissions — this UI just calls the
  // data layer. Three actions per submission: approve, send back with feedback,
  // or decline. Approving only marks the row 'approved' for now; Phase D will
  // route an approved row into the encyclopedia import/upsert path.
  import { onMount } from 'svelte'
  import { user } from '$lib/core/session.js'
  import { pushToast } from '$lib/core/toast.js'
  import { allSubmissions, reviewSubmission, approveToCodex, STATUS_LABEL } from './submissionsData.js'

  const FILTERS = [
    { key: 'pending', label: 'Pending' },
    { key: 'changes_requested', label: 'Sent back' },
    { key: 'approved', label: 'Approved' },
    { key: 'declined', label: 'Declined' },
    { key: null, label: 'All' },
  ]

  let filter = 'pending'
  let rows = []
  let loading = false
  let error = ''
  let busyId = null
  let feedback = {} // id → draft feedback text for "send back"

  async function load() {
    loading = true
    error = ''
    const res = await allSubmissions(filter)
    loading = false
    if (res.error) { error = res.error; rows = []; return }
    rows = res.rows
  }
  onMount(load)

  function setFilter(k) { filter = k; load() }

  async function act(row, status) {
    if (status === 'changes_requested' && !(feedback[row.id] || '').trim()) {
      pushToast({ msg: 'Add a note of what to change before sending it back.', kind: 'warn' })
      return
    }
    if (status === 'declined' && !window.confirm('Decline this submission? The player will see it was declined.')) return
    busyId = row.id

    // Phase D: approving first writes the note into the codex as a draft (merging
    // with any existing entry). If that fails, we do NOT mark it approved, so you
    // can retry.
    let codexNote = ''
    if (status === 'approved') {
      const codex = await approveToCodex(row)
      if (codex.error) {
        busyId = null
        pushToast({ msg: 'Could not add to the codex: ' + codex.error, kind: 'error' })
        return
      }
      codexNote = codex.created ? ' — added to the codex as a draft.' : ' — merged into the existing codex entry.'
    }

    const res = await reviewSubmission(row.id, status, {
      feedback: feedback[row.id] || '',
      reviewerId: $user?.id || null,
    })
    busyId = null
    if (res.error) { pushToast({ msg: 'Review failed: ' + res.error, kind: 'error' }); return }
    pushToast({
      msg: status === 'approved' ? 'Approved' + codexNote
        : status === 'declined' ? 'Declined.'
        : 'Sent back with feedback.',
      kind: 'info',
    })
    feedback[row.id] = ''
    load()
  }

  const short = (s) => (s ? String(s).slice(0, 8) : '—')
  const open = (s) => s === 'pending' || s === 'changes_requested'
</script>

<section class="review">
  <div class="head">
    <span class="title">Vessel-note submissions <span class="hint">(GM review)</span></span>
    <div class="filters">
      {#each FILTERS as f}
        <button class="ftab" class:active={filter === f.key} on:click={() => setFilter(f.key)}>{f.label}</button>
      {/each}
    </div>
  </div>

  {#if loading}
    <div class="muted">Loading submissions…</div>
  {:else if error}
    <div class="err">Could not load submissions: {error}</div>
  {:else if rows.length === 0}
    <div class="muted">No submissions{filter ? ` in “${FILTERS.find((f) => f.key === filter)?.label}”` : ''}.</div>
  {:else}
    <div class="list">
      {#each rows as r (r.id)}
        <div class="sub" class:dim={!open(r.status)}>
          <div class="sub-top">
            <span class="cat">{r.category}</span>
            <span class="ttl">{r.title || '(untitled)'}</span>
            <span class="status s-{r.status}">{STATUS_LABEL[r.status] || r.status}</span>
          </div>
          {#if r.content}<div class="content">{r.content}</div>{/if}
          <div class="meta">
            proposes <b>{r.proposed_type}</b> · vessel {short(r.vessel_id)} · from {short(r.submitted_by)}
            {#if r.gm_feedback}· feedback sent{/if}
          </div>

          {#if open(r.status)}
            <textarea
              class="fb"
              rows="2"
              placeholder="Feedback for the player (required to send back)…"
              bind:value={feedback[r.id]}></textarea>
            <div class="actions">
              <button class="btn approve" disabled={busyId === r.id} on:click={() => act(r, 'approved')}>Approve</button>
              <button class="btn sendback" disabled={busyId === r.id} on:click={() => act(r, 'changes_requested')}>Send back</button>
              <button class="btn decline" disabled={busyId === r.id} on:click={() => act(r, 'declined')}>Decline</button>
            </div>
          {:else if r.gm_feedback}
            <div class="fbshown">Feedback: {r.gm_feedback}</div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .review { background: var(--panel); border: 1px solid var(--border); border-left: 5px solid var(--gold, #d4af37);
    border-radius: 6px; padding: 14px; margin-bottom: 16px; font-family: var(--font-ui); color: var(--text); }
  .head { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; margin-bottom: 12px; }
  .title { font-family: var(--font-display); font-size: 16px; }
  .title .hint { font-size: 11px; color: var(--text-muted); font-family: var(--font-ui); }
  .filters { display: flex; flex-wrap: wrap; gap: 4px; }
  .ftab { background: #1e1e24; color: var(--text-muted); border: 1px solid transparent; padding: 5px 10px;
    border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: 700; font-family: inherit; }
  .ftab:hover { color: #fff; }
  .ftab.active { background: #000; border-color: var(--gold, #d4af37); color: #fff; }

  .muted { color: var(--text-muted); font-style: italic; font-size: 12px; padding: 10px; }
  .err { color: var(--blood, #ff8888); font-size: 12px; padding: 10px; }

  .list { display: flex; flex-direction: column; gap: 10px; }
  .sub { background: #0b0b0d; border: 1px solid var(--border); border-radius: 5px; padding: 12px; }
  .sub.dim { opacity: 0.7; }
  .sub-top { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .cat { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px;
    background: rgba(255,255,255,.06); color: var(--text-muted); padding: 2px 7px; border-radius: 10px; }
  .ttl { font-weight: 700; font-size: 14px; flex: 1; min-width: 120px; }
  .status { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
  .s-pending { background: rgba(212,175,55,.15); color: #e6c34d; }
  .s-changes_requested { background: rgba(56,189,248,.15); color: #38bdf8; }
  .s-approved { background: rgba(134,239,172,.13); color: #86efac; }
  .s-declined { background: rgba(255,120,120,.13); color: #ff8888; }

  .content { font-size: 12px; color: var(--text); margin: 8px 0; white-space: pre-wrap; line-height: 1.45;
    max-height: 140px; overflow: auto; border-left: 2px solid var(--border); padding-left: 10px; }
  .meta { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
  .meta b { color: var(--text); font-family: var(--font-data); }

  .fb { width: 100%; margin-top: 10px; padding: 8px; font-size: 12px; resize: vertical; color: var(--text);
    background: rgba(0,0,0,.35); border: 1px solid var(--border); border-radius: 4px; font-family: inherit; }
  .fb:focus { outline: none; border-color: var(--gold, #d4af37); }
  .actions { display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap; }
  .btn { border: 0; border-radius: 4px; padding: 7px 14px; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit; }
  .btn:disabled { opacity: .5; cursor: default; }
  .approve { background: #14532d; color: #86efac; }
  .sendback { background: #0c4a6e; color: #bae6fd; }
  .decline { background: #4a1212; color: #ff8888; }
  .btn:not(:disabled):hover { filter: brightness(1.15); }
  .fbshown { font-size: 12px; color: #38bdf8; margin-top: 8px; font-style: italic; }
</style>
