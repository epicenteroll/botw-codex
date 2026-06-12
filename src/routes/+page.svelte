<script>
  // Home / landing.
  //
  // Phase 0 placeholder: the unified shell, auth, and most sections don't exist
  // yet. Atlas is the one live section; the rest are listed as forthcoming so
  // the scaffold reads honestly. Styles are component-scoped (the atlas's global
  // app.css only loads on /atlas) and use the world's tokens directly.
  import { base } from '$app/paths'
  const sections = [
    { name: 'Atlas', href: '/atlas', blurb: 'The world map and encyclopedia.', live: true },
    { name: 'Sheet', href: null, blurb: 'Attributes, skills, combat, inventory, corruption.', live: false },
    { name: 'Calendar', href: null, blurb: 'Epoch, months, weeks, crucibles.', live: false },
    { name: 'Deeds', href: null, blurb: 'The registry of deeds.', live: false },
    { name: 'Notes', href: null, blurb: 'World chronicles.', live: false },
  ]
</script>

<svelte:head>
  <title>Blood of the World — Codex</title>
</svelte:head>

<main>
  <header class="masthead">
    <p class="eyebrow">The Codex</p>
    <h1>Blood of the World</h1>
    <p class="lede">
      One book for the world and the people who walk it. The atlas is charted;
      the rest of the codex is being bound.
    </p>
  </header>

  <nav class="sections" aria-label="Codex sections">
    {#each sections as s}
      {#if s.live}
        <a class="section live" href="{base}{s.href}">
          <span class="name">{s.name}</span>
          <span class="blurb">{s.blurb}</span>
          <span class="state">Open &rarr;</span>
        </a>
      {:else}
        <div class="section" aria-disabled="true">
          <span class="name">{s.name}</span>
          <span class="blurb">{s.blurb}</span>
          <span class="state muted">Being bound</span>
        </div>
      {/if}
    {/each}
  </nav>

  <footer>
    <span>Phase 0 — scaffold</span>
  </footer>
</main>

<style>
  :global(html, body) {
    margin: 0;
    background: var(--bg-main);
  }

  main {
    /* Palette + fonts come from the shared tokens (src/lib/styles/tokens.css),
       imported app-wide from routes/+layout.svelte. */
    min-height: 100vh;
    min-height: 100dvh;
    box-sizing: border-box;
    padding: clamp(32px, 8vh, 96px) clamp(20px, 6vw, 64px);
    background:
      radial-gradient(1200px 700px at 70% -10%, #16121d 0%, transparent 60%),
      radial-gradient(900px 600px at 0% 110%, #1a1010 0%, transparent 55%),
      var(--bg-main);
    color: var(--text-main);
    font-family: var(--font-body);
    display: flex;
    flex-direction: column;
    gap: clamp(28px, 5vh, 56px);
  }

  .masthead {
    max-width: 60ch;
  }
  .eyebrow {
    margin: 0 0 14px;
    font-family: var(--font-ui);
    font-size: 12px;
    letter-spacing: 0.32em;
    text-transform: uppercase;
    color: var(--accent-gold);
  }
  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: clamp(34px, 7vw, 64px);
    letter-spacing: 0.04em;
    line-height: 1.04;
    color: var(--gold-bright);
    text-transform: uppercase;
  }
  .lede {
    margin: 20px 0 0;
    font-size: clamp(17px, 2vw, 20px);
    font-weight: 500;
    line-height: 1.5;
    color: var(--text-muted);
    max-width: 48ch;
  }

  .sections {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 1px;
    background: var(--border-color); /* hairline grid lines show through gaps */
    border: 1px solid var(--border-color);
    max-width: 1000px;
  }
  .section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 22px 22px 18px;
    background: var(--panel);
    text-decoration: none;
    color: inherit;
  }
  .section .name {
    font-family: var(--font-display);
    font-size: 19px;
    letter-spacing: 0.06em;
    color: var(--text-main);
  }
  .section .blurb {
    font-size: 15px;
    line-height: 1.4;
    color: var(--text-muted);
    flex: 1;
  }
  .section .state {
    font-family: var(--font-ui);
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .section .state.muted {
    color: #5b5b66;
  }

  .section.live {
    transition:
      background 0.15s ease,
      transform 0.15s ease;
  }
  .section.live .name {
    color: var(--gold-bright);
  }
  .section.live .state {
    color: var(--accent-gold);
  }
  .section.live:hover {
    background: #15151d;
  }
  .section.live:focus-visible {
    outline: 2px solid var(--gold-bright);
    outline-offset: -2px;
  }
  .section[aria-disabled='true'] {
    opacity: 0.62;
  }

  footer {
    font-family: var(--font-ui);
    font-size: 12px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #4d4d57;
  }

  @media (prefers-reduced-motion: reduce) {
    .section.live {
      transition: none;
    }
  }
</style>
