<script>
  // Wielded Armaments + Backpack. Rarity bands gate the mod; rare/epic may be
  // Named with a growing Unique. On-style gives full bonus, off-style is capped
  // low (min(base,2)), broken gives none. Backpack capacity = STR + DEX (cap 24).
  import { getSheetCtx, RARITIES } from './context.js'
  import {
    RARITY_BANDS, weaponFullBonus, weaponEffectiveBonus, weaponModInBand,
    weaponNamedAllowed, inventoryMax, COMBAT_STYLES,
  } from '../rules.js'
  const { sheet, actions } = getSheetCtx()

  $: cap = Math.min(inventoryMax($sheet.val_str, $sheet.val_dex), 24)
  $: used = $sheet.inventory.reduce((t, it) => t + (parseInt(it.weight, 10) || 0), 0)
  $: over = used > cap
  $: profOpts = ['—', ...$sheet.profs.map((p) => (p.combat ? (p.style + ' (Combat)') : p.title))]
  // off-style effective bonus for a hypothetical mismatched style
  const offBonus = (w) => weaponEffectiveBonus(w, '__none__')
</script>

<div class="card">
  <div class="card-title">Wielded Armaments <small>rarity + style → combat modifier</small></div>
  <p class="hint" style="margin:0 0 8px">Common 0–2 · Uncommon 3–5 · Rare 6–9 · Epic 10–14. Rare+ may be <b>Named</b> with a growing <b>Unique</b>. A weapon used <b>off its combat style</b> gives a reduced bonus (capped at +2); a <b>broken</b> weapon gives none.</p>

  {#each $sheet.weapons as w, i}
    {@const full = weaponFullBonus(w)}
    {@const off = offBonus(w)}
    {@const namedOk = weaponNamedAllowed(w)}
    {@const inBand = weaponModInBand(w)}
    <div class="weap" class:named={w.named}>
      <div class="weap-top r4">
        <button class="chk" class:on={w.equipped} on:click={() => actions.toggleWeap(i)} title="Equipped → adds to a matching combat proficiency" aria-label="Equipped"></button>
        <input type="text" value={w.named ? w.namedTitle : w.name} on:input={(e) => actions.setWeap(i, w.named ? 'namedTitle' : 'name', e.target.value)} placeholder="Armament name" />
        <input class="num" type="number" value={w.mod} on:input={(e) => actions.setWeap(i, 'mod', e.target.value)} title="Rarity modifier" />
        <button class="rm-btn" on:click={() => actions.removeWeapon(i)} title="Remove">✕</button>
      </div>
      <div class="weap-mid">
        <label><span class="lab">Rarity</span>
          <select on:change={(e) => actions.setWeap(i, 'rarity', e.target.value)}>
            {#each RARITIES as r}<option value={r} selected={w.rarity === r}>{r[0].toUpperCase() + r.slice(1)} ({RARITY_BANDS[r][0]}–{RARITY_BANDS[r][1]})</option>{/each}
          </select></label>
        <label><span class="lab">Combat style</span>
          <select on:change={(e) => actions.setWeap(i, 'combatType', e.target.value)}>
            {#each COMBAT_STYLES as st}<option value={st} selected={w.combatType === st}>{st}</option>{/each}
          </select></label>
      </div>
      <div class="weap-bot">
        <label style="display:flex; align-items:center; gap:6px; font-size:11px; flex-wrap:wrap">
          <button class="chk" class:on={w.named} on:click={() => namedOk && actions.toggleNamed(i)} disabled={!namedOk} style={namedOk ? '' : 'opacity:.4'} aria-label="Named"></button>Named {namedOk ? '' : '(Rare+)'}
          {#if w.named}<input type="number" value={w.unique} on:input={(e) => actions.setWeap(i, 'unique', e.target.value)} style="width:48px" title="Unique modifier" /><span class="lab">unique</span>{/if}
          <button class="brk-chk" class:on={w.broken} on:click={() => actions.toggleWeapBroken(i)} title="Broken — gives no bonus" aria-label="Broken"></button><span class="lab">{w.broken ? 'broken' : 'intact'}</span>
        </label>
        <span class="totmod">{w.broken ? 'broken · +0' : `+${full} on-style · +${off} off`}</span>
      </div>
      <div class="hint" style="margin-top:4px">{inBand ? 'mod in band ✓' : '⚠ mod outside ' + w.rarity + ' band'}</div>
    </div>
  {/each}
  <button class="add-btn" on:click={actions.addWeapon}>+ Add armament</button>

  <div class="card-title sub" style="font-size:13px">Backpack / Equipment <small class={over ? 'over' : ''}>Slots {used} / {cap}{over ? ' — overloaded' : ''}</small></div>
  <p class="hint" style="margin:0 0 6px">Capacity = STR + DEX (cap 24). Mark an item <b>broken</b> (it stops working) and tag <b>which proficiency</b> it serves.
    <span class="tip asm" data-tip="Names/weights map to the live saved_item_*_N keys; broken + proficiency tag are stored in vesselV2.backpack.">QUICK ACCESS</span></p>
  <div class="bp-head"><span>Item</span><span>Weight</span><span>Used with prof.</span><span>Broke</span><span></span></div>
  {#each $sheet.inventory as it, i}
    <div class="bp-row" class:broken={it.broken}>
      <input type="text" value={it.name} on:input={(e) => actions.setItem(i, 'name', e.target.value)} placeholder={`Item ${i + 1}`} />
      <select on:change={(e) => actions.setItem(i, 'weight', e.target.value)}>
        {#each [[0, 'Empty'], [1, 'Normal (1)'], [2, 'Large (2)']] as [v, l]}<option value={v} selected={it.weight === v}>{l}</option>{/each}
      </select>
      <select on:change={(e) => actions.setItem(i, 'prof', e.target.value)}>
        {#each profOpts as o}<option value={o} selected={it.prof === o}>{o}</option>{/each}
      </select>
      <button class="brk-chk" class:on={it.broken} on:click={() => actions.toggleItemBroken(i)} title="Broken" aria-label="Item broken"></button>
      <button class="rm-btn" on:click={() => actions.removeItem(i)} title="Remove">✕</button>
    </div>
  {/each}
  <button class="add-btn" on:click={actions.addItem}>+ Add item</button>
</div>
