<script>
  // WorldMap — the top level: one charted continent.
  import { createEventDispatcher } from 'svelte'
  import { isAdmin } from '$lib/core/session.js'
  import { entities, discoveries } from '../../lib/dataLayer.js'
  import { byId, displayLevel, tierClass, tierLabel } from '../../lib/domain.js'
  import { blobPath } from '../../lib/utils.js'

  export let selectedId = null
  const dispatch = createEventDispatcher()

  $: cont = byId($entities, 'impure-fracta')
  $: lv = tierClass(displayLevel($entities, $discoveries, 'impure-fracta', $isAdmin))
  $: d = blobPath(470, 360, 235, cont ? (cont.blob_seed || 'impure-fracta') : 'impure-fracta')

  function enter() {
    dispatch('select', { id: 'impure-fracta' })
    dispatch('enter', { view: 'continent', id: 'impure-fracta' })
  }
  function keyActivate(evt) {
    if (evt.key === 'Enter' || evt.key === ' ') {
      evt.preventDefault()
      enter()
    }
  }
</script>

<svg class="map" viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid meet"
  role="img" aria-label="The Known World">
  <defs>
    <pattern id="botw-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="8" stroke="#e8e3d6" stroke-width="1" opacity=".35" />
    </pattern>
  </defs>
  <text x="858" y="120" class="water-label">Mushroom Expanse</text>
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <g class="map-region {lv} can-enter"
    class:selected={selectedId === 'impure-fracta'}
    role="button" tabindex="0"
    aria-label="The Impure Fracta, {tierLabel(cont, displayLevel($entities, $discoveries, 'impure-fracta', $isAdmin))}"
    on:click={enter} on:keydown={keyActivate}>
    <path class="region-glow" d={d} />
    <path class="region-fill" d={d} />
    <path class="region-inner" d={d} />
    <path class="region-edge" d={d} />
    <path class="region-hatch" d={d} />
    <text x="470" y="360" class="region-label">The Impure Fracta</text>
    <text x="470" y="384" class="region-sub">— the broken continent —</text>
  </g>
</svg>
<div class="placard">
  <div class="pt">The Known World</div>
  <div class="pd">One charted continent. Beyond it, only rumour.</div>
</div>
<div class="hint">Click the continent to descend.</div>
