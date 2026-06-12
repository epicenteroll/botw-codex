<script>
  // OracleRoll.svelte — the application's existing d100 Fate Oracle (Section 17).
  // The roll gates ACCESS to authored tiers; it never writes lore.
  import { entities, discoveries, grantDiscovery } from '../../lib/dataLayer.js'
  import { rawLevel, tierLabel } from '../../lib/domain.js'
  import { rollOracle, resolveOracleForLocation } from '../../lib/utils.js'

  export let entity
  let out = ''
  const ORDER = ['heard_of', 'visited', 'known']

  function roll() {
    const o = rollOracle()
    const effect = resolveOracleForLocation(o.key)
    const cur = rawLevel($discoveries, entity.id)
    let msg = ''
    if (effect === 'full_upgrade') {
      const next = !cur ? 'heard_of' : ORDER[Math.min(ORDER.indexOf(cur) + 1, 2)]
      grantDiscovery(entity.id, next)
      msg = `Discovery rises to <b>${tierLabel(entity, next)}</b>.`
    } else if (effect === 'text_only') {
      msg = 'You glimpse the next tier’s text, but the map does not change.'
    } else if (effect === 'hint') {
      msg = 'The GM offers a hint. No lore unlocked.'
    } else if (effect === 'complication') {
      msg = 'A complication follows. The place exacts a price.'
    } else {
      msg = 'Nothing changes.'
    }
    out = `<b>${o.label}</b> &nbsp;(d100 = ${o.n})<br/>${msg}`
  }
</script>

<button class="oracle-btn" on:click={roll}>⚄ Roll the Fate Oracle on this place</button>
{#if out}
  <div class="oracle-out">{@html out}</div>
{/if}
