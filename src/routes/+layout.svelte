<script>
  // Root app shell (§7d, §8 Phase 1).
  //
  // Replaces the Phase 0 passthrough with the real shared chrome every page
  // wears: the auth bar (sign in / account + sign out), the vessel selector,
  // the top nav (Sheet · Calendar · Deeds · Notes · Atlas), and the app-wide
  // toast stack. All auth/vessel state comes from lib/core; this component only
  // reads stores and calls actions — it never touches Supabase directly.
  // The one design system, imported once at the root so every route inherits it
  // (§6, §7c). tokens.css is the single source of truth for colour + type;
  // base.css is a tiny global baseline. Everything below references these tokens.
  import '$lib/styles/tokens.css'
  import '$lib/styles/base.css'
  import { onMount } from 'svelte'
  import { page } from '$app/stores'
  import { base } from '$app/paths'
  import { isSupabaseConfigured } from '$lib/core/supabase.js'
  import {
    session,
    user,
    isAdmin,
    vesselId,
    authReady,
    initAuth,
    signIn,
    signUp,
    signOut,
    changePassword,
  } from '$lib/core/session.js'
  import {
    vessels,
    loadVessels,
    createVessel,
    deleteVessel,
    selectVessel,
  } from '$lib/core/vessels.js'
  import { toasts, pushToast, dismissToast } from '$lib/core/toast.js'

  // Top-level sections. Only the ones with an `href` are routes that exist
  // today; the rest are honest placeholders until Phase 2 builds them.
  const NAV = [
    { name: 'Sheet', href: '/sheet' },
    { name: 'Calendar', href: '/calendar' },
    { name: 'Deeds', href: '/deeds' },
    { name: 'Notes', href: '/notes' },
    { name: 'Atlas', href: '/atlas' },
  ]

  // ---- local form state (never read out of the DOM) ----
  let email = ''
  let password = ''
  let busy = false
  let showPwPanel = false
  let newPw = ''
  let confirmPw = ''

  $: onAtlas = $page.url.pathname.startsWith(base + '/atlas')

  onMount(() => {
    initAuth()
  })

  // When a session appears (login or restored on refresh), load the vessel list.
  let loadedFor = null
  $: if ($session?.user?.id && $session.user.id !== loadedFor) {
    loadedFor = $session.user.id
    loadVessels()
  }
  $: if (!$session) loadedFor = null

  async function doSignIn() {
    busy = true
    const r = await signIn(email, password)
    busy = false
    if (r.error) pushToast({ msg: r.error, kind: 'error' })
    else password = ''
  }

  async function doSignUp() {
    busy = true
    const r = await signUp(email, password)
    busy = false
    if (r.error) pushToast({ msg: r.error, kind: 'error' })
    else pushToast('Account created — if email confirmation is on, confirm then sign in.')
  }

  async function doSignOut() {
    await signOut()
    pushToast('Disconnected.')
  }

  function onPickVessel(e) {
    const id = e.target.value
    selectVessel(id).then((r) => {
      if (r.error) pushToast({ msg: r.error, kind: 'error' })
    })
  }

  async function doCreateVessel() {
    const name = window.prompt('Designate character vessel name:', 'Unnamed Vessel')
    if (name === null) return
    busy = true
    const r = await createVessel(name)
    busy = false
    if (r.error) pushToast({ msg: r.error, kind: 'error' })
    else pushToast('New vessel summoned.')
  }

  async function doDeleteVessel() {
    if (!$vesselId) {
      pushToast({ msg: 'Select a vessel first.', kind: 'warn' })
      return
    }
    const label = $vessels.find((v) => v.id === $vesselId)?.character_name || 'this vessel'
    const ok = window.confirm(
      `Permanently sacrifice [ ${label} ] from the cloud? This cannot be undone.`,
    )
    if (!ok) return
    busy = true
    const r = await deleteVessel($vesselId)
    busy = false
    if (r.error) pushToast({ msg: r.error, kind: 'error' })
    else pushToast('Vessel scrubbed from the registry.')
  }

  async function doChangePassword() {
    if (newPw !== confirmPw) {
      pushToast({ msg: 'Passwords do not match.', kind: 'error' })
      return
    }
    busy = true
    const r = await changePassword(newPw)
    busy = false
    if (r.error) pushToast({ msg: r.error, kind: 'error' })
    else {
      pushToast('Password updated.')
      showPwPanel = false
      newPw = ''
      confirmPw = ''
    }
  }
</script>

<div class="codex">
  <header class="topbar">
    <a class="brand" href="{base}/">
      <span class="brand-t">Blood of the World</span>
      <span class="brand-s">The Codex</span>
    </a>

    <nav class="mainnav" aria-label="Sections">
      {#each NAV as item}
        {#if item.href}
          <a
            class="navlink"
            class:active={$page.url.pathname.startsWith(base + item.href)}
            href="{base}{item.href}">{item.name}</a>
        {:else}
          <span class="navlink disabled" aria-disabled="true" title="Coming in a later phase"
            >{item.name}</span>
        {/if}
      {/each}
    </nav>

    <div class="auth">
      {#if !isSupabaseConfigured}
        <span class="pill muted" title="Set VITE_SUPABASE_URL / _ANON_KEY in .env.local to enable login"
          >Demo / offline — no backend keys set</span>
      {:else if !$authReady}
        <span class="pill muted">Connecting…</span>
      {:else if !$session}
        <!-- logged out -->
        <input
          class="field"
          type="email"
          placeholder="Vessel account email"
          autocomplete="username"
          bind:value={email} />
        <input
          class="field"
          type="password"
          placeholder="Password"
          autocomplete="current-password"
          bind:value={password}
          on:keydown={(e) => e.key === 'Enter' && doSignIn()} />
        <button class="btn primary" disabled={busy} on:click={doSignIn}>Sign In</button>
        <button class="btn" disabled={busy} on:click={doSignUp}>Register</button>
      {:else}
        <!-- logged in -->
        <span class="pill">{$user?.email}</span>
        {#if $isAdmin}
          <span class="pill admin" title="This account has the admin role">⚔ ADMIN</span>
        {/if}

        <select
          class="field vessel"
          aria-label="Active vessel"
          value={$vesselId ?? ''}
          on:change={onPickVessel}>
          <option value="">— Summon assigned vessel —</option>
          {#each $vessels as v (v.id)}
            <option value={v.id}>{v.character_name}</option>
          {/each}
        </select>

        <button class="btn primary" disabled={busy} on:click={doCreateVessel}>+ Vessel</button>
        <button class="btn danger" disabled={busy} on:click={doDeleteVessel}>Sacrifice</button>
        <button class="btn" title="Change password" on:click={() => (showPwPanel = !showPwPanel)}
          >🔑</button>
        <button class="btn ghost" disabled={busy} on:click={doSignOut}>Disconnect</button>
      {/if}
    </div>
  </header>

  {#if $session && showPwPanel}
    <div class="pwpanel">
      <span class="pw-label">Change password</span>
      <input
        class="field"
        type="password"
        placeholder="New password (min 8)"
        autocomplete="new-password"
        bind:value={newPw} />
      <input
        class="field"
        type="password"
        placeholder="Confirm new password"
        autocomplete="new-password"
        bind:value={confirmPw} />
      <button class="btn primary" disabled={busy} on:click={doChangePassword}>Update</button>
      <button class="btn ghost" on:click={() => (showPwPanel = false)}>Cancel</button>
    </div>
  {/if}

  <main class="content" class:atlas={onAtlas}>
    <slot />
  </main>
</div>

<div class="toast-stack" aria-live="polite" aria-atomic="false">
  {#each $toasts as t (t.id)}
    <div class="toast {t.kind}">
      <span>{t.msg}</span>
      {#if t.action}
        <button
          class="t-act"
          on:click={() => {
            t.action.fn?.()
            dismissToast(t.id)
          }}>{t.action.label || 'Undo'}</button>
      {/if}
    </div>
  {/each}
</div>

<style>
  /* Palette + fonts now come from the shared tokens (src/lib/styles/tokens.css),
     imported app-wide at the top of this component. This shell only owns layout. */
  .codex {
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    background: var(--bg);
    color: var(--text);
  }

  .topbar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 8px 16px;
    background: linear-gradient(180deg, #101018, #0c0c11);
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
  }

  .brand {
    display: flex;
    flex-direction: column;
    line-height: 1.05;
    text-decoration: none;
    color: inherit;
  }
  .brand-t {
    font-family: var(--font-display);
    font-size: 16px;
    letter-spacing: 0.06em;
    color: var(--gold-bright);
  }
  .brand-s {
    font-family: var(--font-ui);
    font-size: 10px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: var(--muted);
  }

  .mainnav {
    display: flex;
    gap: 4px;
    align-items: center;
  }
  .navlink {
    font-family: var(--font-ui);
    font-size: 12px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    text-decoration: none;
    color: var(--muted);
    padding: 6px 10px;
    border-radius: 4px;
    border: 1px solid transparent;
  }
  .navlink:hover {
    color: var(--text);
    background: var(--panel-2);
  }
  .navlink.active {
    color: var(--gold-bright);
    border-color: var(--border);
    background: var(--panel);
  }
  .navlink.disabled {
    opacity: 0.4;
    cursor: default;
  }

  .auth {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    flex-wrap: wrap;
  }

  .pill {
    font-family: var(--font-ui);
    font-size: 11px;
    letter-spacing: 0.04em;
    color: var(--text);
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 5px 11px;
    white-space: nowrap;
  }
  .pill.muted {
    color: var(--muted);
  }
  .pill.admin {
    color: #f87171;
    background: rgba(153, 27, 27, 0.22);
    border-color: rgba(153, 27, 27, 0.5);
    font-weight: 700;
  }

  .field {
    font-family: var(--font-ui);
    font-size: 13px;
    color: var(--text);
    background: #0c0c11;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 6px 9px;
    min-width: 0;
  }
  .field::placeholder {
    color: #5b5b66;
  }
  .field.vessel {
    min-width: 190px;
  }
  .field:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: -1px;
  }

  .btn {
    font-family: var(--font-ui);
    font-size: 12px;
    letter-spacing: 0.03em;
    color: var(--text);
    background: var(--panel-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 6px 11px;
    cursor: pointer;
  }
  .btn:hover:not(:disabled) {
    border-color: #3a3a44;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .btn.primary {
    background: var(--gold);
    border-color: var(--gold);
    color: #1a1206;
    font-weight: 600;
  }
  .btn.danger {
    background: var(--crimson);
    border-color: var(--crimson);
    color: #fff;
    font-weight: 600;
  }
  .btn.ghost {
    background: transparent;
  }

  .pwpanel {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    flex-wrap: wrap;
  }
  .pw-label {
    font-family: var(--font-ui);
    font-size: 11px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted);
  }

  /* The content area is the height authority below the bar. Feature pages fill
     it; the atlas (which manages its own internal scrolling) gets overflow
     hidden, everything else scrolls normally. */
  .content {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }
  .content.atlas {
    overflow: hidden;
  }

  .toast-stack {
    position: fixed;
    left: 50%;
    bottom: 20px;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 10000;
    pointer-events: none;
  }
  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: var(--font-ui);
    font-size: 13px;
    color: var(--text);
    background: #16161e;
    border: 1px solid var(--border);
    border-left: 3px solid var(--gold);
    border-radius: 6px;
    padding: 10px 14px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    max-width: 90vw;
  }
  .toast.warn {
    border-left-color: var(--gold-bright);
  }
  .toast.error {
    border-left-color: var(--crimson);
  }
  .t-act {
    font-family: var(--font-ui);
    font-size: 12px;
    color: var(--gold-bright);
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 3px 9px;
    cursor: pointer;
  }
</style>
