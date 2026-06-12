<script>
  // FeatureState.svelte — the shared empty / loading / error treatment for the
  // feature tabs (Sheet · Calendar · Deeds · Notes). One component so every tab
  // presents these states identically (task D), matching the Sheet's full-width,
  // centred look. Render it at the FEATURE ROOT — outside any max-width content
  // wrapper (the Calendar/Deeds/Notes wrappers are capped at ~1100px, which is
  // what used to narrow/reposition their empty state vs the full-width Sheet).
  //
  // Mirrors the Sheet's original `.empty` rules verbatim, so the Sheet's
  // appearance is the unchanged target and the others now match it.
  export let title = '' // big Cinzel heading (optional)
  export let message = '' // supporting line (optional)
</script>

<div class="feature-state">
  {#if title}<h2>{title}</h2>{/if}
  {#if message}<p>{message}</p>{/if}
  <slot />
</div>

<style>
  .feature-state {
    text-align: center;
    color: var(--text-muted);
    padding: 60px 20px;
    font-family: var(--font-ui);
  }
  .feature-state h2 {
    font-family: var(--font-display);
    color: var(--text);
  }
</style>
