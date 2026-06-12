<script>
  // LocationPanel.svelte — the right-side detail panel (Sections 7, 8, 9, 12).
  // Renders the lore tiers a vessel has unlocked, the exploration % bar, the
  // faction-attributed deep lore, and (in admin mode) GM/Admin layers plus quick
  // discovery-grant + faction-access controls and the Oracle.
  import { createEventDispatcher } from 'svelte'
  import { isAdmin } from '$lib/core/session.js'
  import {
    entities,
    deepLore,
    discoveries,
    factionAccess,
    grantDiscovery,
    clearDiscovery,
    toggleFaction,
    upsertEntity,
  } from '../../lib/dataLayer.js'
  import {
    byId,
    childrenOf,
    allChildrenOf,
    deepFor,
    effectiveLevel,
    explorationPct,
    rawLevel,
    tierClass,
    tierLabel,
    unlocked,
    renderLore,
    chartStatus,
    backlinksFor,
    ENTITY_TYPE_NAMES,
  } from '../../lib/domain.js'
  import { TYPE_MAP } from '../../lib/locationTypes.js'
  import OracleRoll from './OracleRoll.svelte'

  export let selectedId = null
  const dispatch = createEventDispatcher()

  $: e = selectedId ? byId($entities, selectedId) : null
  $: lv = e ? effectiveLevel($entities, $discoveries, e.id) : null
  $: pct = e ? explorationPct($entities, $discoveries, e.id) : null
  $: u = e ? unlocked($entities, $discoveries, e, $isAdmin) : new Set()
  $: t = e && e.location_subtype ? TYPE_MAP[e.location_subtype] : null
  $: kids = e ? childrenOf($entities, e.id) : []
  $: dls = e ? deepFor($deepLore, e.id) : []
  $: showTier = $isAdmin ? lv || 'known' : lv || 'unknown'
  $: placeTag = e ? (e.tags || []).find((x) => x.startsWith('location:')) : null
  $: placeTarget = placeTag ? byId($entities, placeTag.split(':')[1]) : null

  // lore() returns {state, label, body} for a tier, honouring gating + admin
  const HINTS = {
    common: 'Visit this place to learn what most know.',
    uncommon: 'Explore more of this region (50%+) to uncover Uncommon Knowledge.',
    rare: 'Come to know this place fully to earn its Rare Knowledge.',
  }
  function loreState(key, text) {
    const open = u.has(key)
    const has = text && text.trim()
    if (!$isAdmin && !open) {
      if (HINTS[key]) return { mode: 'locked', body: HINTS[key] }
      return null
    }
    if (!has && !$isAdmin) return null
    return { mode: 'open', body: has ? renderLore(text, $entities, $discoveries, $isAdmin) : '<em style="color:#4f4f59">— empty —</em>' }
  }
  $: layers = e
    ? [
        { key: 'rumour', label: 'Rumour', icon: '“”', cls: '', st: loreState('rumour', e.rumour) },
        { key: 'common', label: 'Common Knowledge', icon: '◈', cls: '', st: loreState('common', e.common_knowledge) },
        { key: 'uncommon', label: 'Uncommon Knowledge', icon: '◆', cls: '', st: loreState('uncommon', e.uncommon_knowledge) },
        { key: 'rare', label: 'Rare Knowledge', icon: '✦', cls: '', st: loreState('rare', e.rare_knowledge) },
      ]
    : []
  $: gmLayers = e && $isAdmin
    ? [
        { key: 'gm', label: 'GM Lore', icon: '𝕴', cls: 'gm', st: loreState('gm', e.gm_lore) },
        { key: 'admin', label: 'Admin Notes', icon: '✎', cls: 'admin', st: loreState('admin', e.admin_notes) },
      ]
    : []

  $: enterView =
    e && kids.length && ($isAdmin || lv)
      ? { continent: 'continent', quadrant: 'quadrant', sector: 'sector', corridor: 'corridor' }[e.entity_type] || null
      : null

  // delegate clicks for name-links rendered via {@html}
  function onClick(ev) {
    const go = ev.target.closest('[data-go]')
    if (go) dispatch('go', go.dataset.go)
  }
  function grant(level) {
    if (level) grantDiscovery(e.id, level)
    else clearDiscovery(e.id)
    dispatch('toast', level ? 'Granted ' + level.replace('_', ' ') : 'Discovery cleared')
  }
  $: grantLevels = e
    ? [
        ['heard_of', 'Heard Of'],
        ['visited', e.entity_type === 'people' ? 'Met' : 'Visited'],
        ['known', 'Known'],
      ]
    : []

  // H2 — World-canon chart status (sectors only)
  $: isSector = e && e.entity_type === 'sector'
  $: charted = e ? chartStatus(e) === 'charted' : false
  async function setChart(status) {
    if (!e || chartStatus(e) === status) return
    if (status === 'uncharted') {
      const micro = allChildrenOf($entities, e.id).filter(
        (c) => c.entity_type === 'location' && (c.location_scale || 'micro') === 'micro'
      )
      if (micro.length && !confirm(
        `${e.name} has ${micro.length} micro location(s). They will stay in the data but hidden from players. Demote to uncharted anyway?`
      )) return
    }
    await upsertEntity({ ...e, chart_status: status })
    dispatch('toast', status === 'charted'
      ? `${e.name} is now charted — micro locations enabled.`
      : `${e.name} demoted to uncharted.`)
  }

  // E2 — backlinks ("Referenced by")
  $: backlinks = e ? backlinksFor($entities, $deepLore, e.id) : []
</script>

{#if !e}
  <div class="panel-empty">
    <div class="em">Select a place, person, or power<br />to read what is known of it.</div>
  </div>
{:else}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions a11y-no-noninteractive-element-interactions -->
  <div class="panel-scroll" on:click={onClick} role="region">
    <div class="ptype">
      {#if t}<span class="swatch" style="background:{t.marker_colour}"></span>{/if}
      {ENTITY_TYPE_NAMES[e.entity_type] || e.entity_type}{t ? ' · ' + t.display_name : ''}
    </div>
    <div class="pname">{e.name}</div>

    {#if placeTarget}
      <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions a11y-missing-attribute a11y-no-noninteractive-element-interactions a11y-invalid-attribute -->
      <div class="pmeta">at <a data-go={placeTarget.id}>{placeTarget.name}</a></div>
    {/if}

    <div class="disco">
      <span class="tier {tierClass(showTier)}">{tierLabel(e, showTier)}</span>
      {#if pct !== null && (showTier === 'visited' || showTier === 'known')}
        <span class="bar"><i style="width:{pct}%"></i></span><span class="pct">{pct}%</span>
      {/if}
    </div>

    {#if enterView}
      <button class="enter" on:click={() => dispatch('enter', { view: enterView, id: e.id })}>
        Enter {e.name.split(' — ')[0]} →
      </button>
    {/if}

    {#each layers as L}
      {#if L.st}
        <div class="layer {L.st.mode === 'locked' ? 'locked' : ''} {L.cls}">
          <div class="lh"><span class="ic">{L.icon}</span>{L.label}</div>
          <p>{@html L.st.body}</p>
        </div>
      {/if}
    {/each}

    {#if dls.length && ($isAdmin || u.has('deep'))}
      <div class="layer">
        <div class="lh"><span class="ic">⛧</span>Deep Lore</div>
        {#each dls as d}
          {@const access = $isAdmin || $factionAccess.has(d.origin_faction)}
          <div class="deep {access ? '' : 'locked'}">
            <div class="org">
              <span>{d.origin_faction}</span>
              {#if d.access_note}<span class="acc">{d.access_note}</span>{/if}
            </div>
            {#if access}
              <p>{@html renderLore(d.lore_text, $entities, $discoveries, $isAdmin)}</p>
            {:else}
              <p>You do not yet have this faction’s trust.</p>
            {/if}
          </div>
        {/each}
      </div>
    {/if}

    {#each gmLayers as L}
      {#if L.st}
        <div class="layer {L.cls}">
          <div class="lh"><span class="ic">{L.icon}</span>{L.label}</div>
          <p>{@html L.st.body}</p>
        </div>
      {/if}
    {/each}

    {#if $isAdmin}
      <div class="admin-box">
        <div class="ah">Admin · Discovery &amp; Oracle</div>
        {#if isSector}
          <div class="row grant chart-row">
            <span class="rl">World canon</span>
            <button class:chart-on={!charted} class:on={!charted} on:click={() => setChart('uncharted')}>Uncharted</button>
            <button class:chart-on={charted} class:on={charted} on:click={() => setChart('charted')}>Charted</button>
          </div>
        {/if}
        <div class="row grant">
          <span class="rl">{isSector ? 'This vessel' : 'Grant tier'}</span>
          <button class:on={!rawLevel($discoveries, e.id)} on:click={() => grant('')}>None</button>
          {#each grantLevels as [v, label]}
            <button class:on={rawLevel($discoveries, e.id) === v} on:click={() => grant(v)}>{label}</button>
          {/each}
        </div>
        {#if dls.length}
          <div class="row grant">
            <span class="rl">Faction access</span>
            {#each dls as d}
              <button class:on={$factionAccess.has(d.origin_faction)} title={d.origin_faction} on:click={() => toggleFaction(d.origin_faction)}>
                {d.origin_faction.split(' ').slice(0, 2).join(' ')}…
              </button>
            {/each}
          </div>
        {/if}
        <OracleRoll entity={e} />
        {#if backlinks.length}
          <div class="backlinks">
            <div class="bh">Referenced by</div>
            <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions a11y-missing-attribute a11y-no-noninteractive-element-interactions a11y-invalid-attribute -->
            {#each backlinks as b}
              <a data-go={b.id}>{b.name}</a>{#if b !== backlinks[backlinks.length - 1]}, {/if}
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}
