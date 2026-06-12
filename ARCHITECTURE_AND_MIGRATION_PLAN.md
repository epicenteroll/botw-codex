# Blood of the World — Architecture & Migration Plan

*How to turn the monolithic HTML character sheet and the Svelte world atlas into
one stable, modular application you can grow piece by piece without breaking the
whole.*

This document is written so you can read it yourself **and** hand it to an AI
assistant (or a developer) as a working brief. It is the single source of truth
for the rebuild. Start a new chat by uploading this file plus the project zips.

> **Status:** **Phase 4 IN PROGRESS — deploy scaffolding landed in-repo;
> awaiting the operator's manual GitHub + Supabase steps.**
> Phases 0–3 are complete (shared auth core; Sheet + Calendar + Deeds + Notes all
> rebuilt the three-layer way; the whole app unified onto one token file). Phase
> 1 (shared auth core) remains live. `lib/features/sheet/` holds the rebuilt character
> sheet (see §9). `lib/features/calendar/` holds the rebuilt Temporal Horizon,
> built to the same pattern: `rules.js` (the Dynamic Progression Orbital Engine
> — `archonOrbitOrder`, crucible-registry construction, blood-moon pillar
> arithmetic, the random-weeks/transition-duration dice, the date badge — ported
> verbatim from the live HTML as pure functions), `calendarData.js` (the only
> calendar file touching Supabase — it maps the same `sheet_data` blob to/from a
> real `calendar` object and **merges** on save so sheet/deeds/notes keys
> survive), and `Calendar.svelte` (fully reactive: `bind:`/`$:`, zero
> `getElementById`/`innerHTML`/DOM scraping; clickable days and accordions are
> real `<button>`s). It writes the live site's six calendar keys
> (`currentAge`, `currentCrucible`, `calendarCurrentMonth`, `calendarCurrentDay`,
> `manualTransitionDuration`, `cruciblesData`) in the same shape, so old and new
> coexist with no database change. The one deliberate fix over the live quirk:
> the manual transition text is stored in the per-crucible registry (where the
> renderer reads it) and mirrored to the top-level key, so it actually
> round-trips.
>
> `lib/features/deeds/` now holds the rebuilt Registry of Deeds, same three-layer
> shape: `rules.js` (the AP apparatus — the 0–57 override clamp, the 0-floored
> per-deed reward clamp, the `p_`/`g_` composite claim keys, and the claim-toggle
> arithmetic that caps additions at 57 and floors removals at 0 — all ported
> verbatim as pure functions), `deedsData.js` (the only deeds file touching
> Supabase), and `Deeds.svelte` (fully reactive; the claim checkboxes, delete,
> add, and apply controls are all real `<button>`s — no DOM scraping). Deeds
> uniquely straddle **two** blobs (§8): personal deeds, the claim ledger
> (`unlockedAchievements`), and the AP total (`advancementPoints`) live in the
> vessel's own `sheet_data`; campaign-wide triumphs live in the shared
> `__GLOBAL_CAMPAIGN__` magic row's `sheet_data.dynamicAchievementsList`. Both
> save paths **merge** their keys over the re-fetched blob, so the sheet's /
> calendar's / notes' keys (and, on the global row, anything else stored there)
> survive untouched. `isAdmin` (from `$lib/core`) gates editing the global
> triumphs and the AP override; non-admins see triumphs read-only. The shared
> `advancementPoints` key is written as a number (matching the live deeds code);
> the Sheet's loader tolerates both string and number, so they coexist. The
> personal slice autosaves via the house serialize-watch; the shared global row
> is written only by the admin-only triumph mutators, so mere viewing never
> touches it. The `/deeds` route is wired and its top-nav link is enabled.
>
> `lib/features/notes/` now holds the rebuilt World Chronicles ("World Memory
> Archives"), same three-layer shape: `rules.js` (the book-and-page logic — the
> four book/category keys (`personal` / `quest` / `knowledge` / `campaign`) and
> their volume labels, the active-book page filter, the per-book page counts, the
> virtual-index ↔ real-array mapping (the live `targetCounter` walk), the loader's
> pointer clamp, the `pageLabel`/`blankPage` factories — all ported verbatim as
> pure functions; a 27-case check confirms parity with the live semantics),
> `notesData.js` (the only notes file touching Supabase), and `Notes.svelte`
> (fully reactive; the book tabs, page-index entries, "+ Inscribe Page" and
> "Incinerate Page" are all real `<button>`s — no DOM scraping). Notes are
> SINGLE-BLOB like the calendar — no global/shared row: they live in the vessel's
> own `sheet_data.dynamicVesselNotes` as an array of `{ title, category,
> content }`. Every save RE-FETCHES the latest blob and MERGES only that one key
> over it, so the sheet's / calendar's / deeds' keys (and any unknown-category
> notes) survive untouched. **§5 rule 1 / safety is the headline here:** page
> titles and content are entirely author-entered free text, and the live site
> built its page-index list via `innerHTML` (a stored-XSS path). The rebuild has
> NO innerHTML path at all — every piece of author text renders through Svelte
> interpolation (`pageLabel`, badges) or `bind:value` (title + body), both of
> which auto-escape; `utils` `s()` remains the escape for any hand-built HTML
> string, of which there are deliberately none. The `/notes` route is wired and
> its top-nav link is enabled (flipped from `null` to `/notes`). `npm run build`
> passes (only the pre-existing Sheet a11y warnings remain; Notes adds none).
>
> **Phase 3 is complete.** The whole app now wears one design system. A single
> source of truth, `src/lib/styles/tokens.css`, holds §6's tokens in one `:root`:
> the four fonts (`--font-display` Cinzel, `--font-body` EB Garamond, `--font-ui`
> system sans, `--font-data` mono), the core dark palette (`--bg`, `--panel`,
> `--panel-2`, `--panel-3`, `--border`, `--text`, `--text-muted`) and the
> fixed-meaning accents (`--gold`, `--gold-bright`, `--blood`, `--crimson`,
> `--taint`, `--blue`, `--green`). It is imported once, app-wide, from
> `routes/+layout.svelte` (alongside a tiny `base.css`), so every route inherits
> it. The **three naming dialects** that were in the tree were reconciled onto the
> canonical names via a deliberate **alias layer** in the same file
> (`--muted`→`--text-muted`; `--accent-gold/blood/blue/green/taint`→the canonical
> accents; `--text-main`→`--text`, `--border-color`→`--border`, `--bg-main`→`--bg`;
> `--void` kept verbatim as it has no canonical equal), so legacy references keep
> resolving without a tree-wide rename. The layout's inlined palette block is
> gone; each feature's component-local CSS-var **fallbacks** and one-letter
> shorthands (`--b/--p/--p2/--p3/--tx/--mut/--gd/--taint-c`) were repointed
> straight at the shared tokens (no hard-coded fallbacks, no self-referential
> cycles), and the colour names `--blood/--blue/--green/--taint` now resolve from
> the canonical tokens directly. The atlas folded its **duplicate GLOBAL palette**
> up into `tokens.css` but **kept its map-specific tokens** (`--region-*`,
> `--sector-*`, `--map-bg`, `--sheet-bg`, `--safe-bottom`) in its own `app.css` —
> it renders as before, the one intended unification being that its body/muted
> text now take §6's canonical parchment values (`#e8e3d6`/`#8e8e9f`) in place of
> the old cool-slate (`#e2e8f0`/`#94a3b8`), per the `--text-main`→`--text` alias.
> §6's typography rule is applied across the rebuilt surfaces: serif
> (`--font-display`/`--font-body`) only at ≥16px (the Sheet's lone 14px Cinzel
> card-title was bumped to 16px to match the others; the shell wordmark 15→16px),
> all small UI text on `--font-ui`, all numbers on `--font-data`. `npm run build`
> passes with only the pre-existing Sheet a11y warnings at `Sheet.svelte:368`
> (Phase 3 adds none).
>
> **Phase 4 — cut over (§8): what is DONE in-repo (verified by local build).**
> The deploy scaffolding the repo can carry is now committed and the build is
> green at both the site root and under a project sub-path:
> • `svelte.config.js` reads `paths.base` from a `BASE_PATH` env var (empty for
>   local dev / root, `/<repo>` for a project page) with `relative: false`, so
>   nobody hand-edits the config per deploy; the three internal SvelteKit links
>   (the shell brand + top-nav, the landing's Atlas link) and the layout's
>   `active`/`onAtlas` `pathname` checks now resolve through `base` from
>   `$app/paths`, so nav works under a sub-path (verified: `BASE_PATH=/botw-codex`
>   bakes `/botw-codex/_app/...` asset URLs and the base into the client bundle;
>   a root build bakes neither).
> • `.github/workflows/deploy.yml` builds with `adapter-static`, injects the
>   Supabase secrets at build time from repo Secrets, computes the base path from
>   the repo name, writes the SPA `404.html` (copy of the fallback) and
>   `.nojekyll`, and publishes to the repo's OWN GitHub Pages — i.e. a **staging
>   URL** that cannot touch the live monolith.
> • `static/.nojekyll` is committed (so even local `build/` carries it);
>   `.env.example` is committed and now also points at the GitHub Secrets path
>   for deploys; `.env.local` stays gitignored (verified it is NOT staged).
> • `legacy/README.md` scaffolds the one-release rollback slot
>   (`legacy/index.live-pre-codex.html`) — the operator drops the real old
>   monolith file in just before cut-over (it was not in the project zip).
> `npm run build` stays green with only the known `Sheet.svelte:368` a11y
> warnings.
>
> **Phase 4 — what is LEFT for the operator (manual; cannot be done from in-repo
> or from this chat — needs GitHub/Supabase accounts).** In order:
> (1) **Confirm the unknowns** — existing Supabase URL+anon key + dashboard
>   access; who hosts the live site (for the final swap + rollback); the GitHub
>   account/repo name. (2) **Wire `.env.local`** to the existing project and run
>   the **local smoke-test** against the real backend (login, every route,
>   save+reload, admin-vs-player, a deep link). (3) **Run the outstanding Phase 0
>   SQL** in the Supabase SQL Editor (`schema.sql` → `migrations/001` → `002` →
>   `seed_location_types.sql` → optional `seed_world.sql`) — additive/isolated,
>   the live monolith ignores it. (4) **Create the GitHub repo, push, add the two
>   repo Secrets, set Pages source = GitHub Actions**, let the workflow deploy the
>   **staging** site, and smoke-test that URL. (5) **Cut over last:** archive the
>   old monolith into `legacy/`, then swap the live `index.html` for the built
>   app, keeping the archive one release as rollback. Step-by-step runbooks for
>   all of this are in the README's "Deploying & cutting over" section.

---

## 0. The one-paragraph version

You actually have three things, not two. (1) The **live site** is a single
3,263-line HTML file that *is* a character-sheet manager — it works, but its
"database" is literally whatever is currently typed into the page. (2)
**`botw-svelte`** is an earlier attempt to fix that, but it only *moved the
furniture*: it split the file into Svelte components while keeping the old
fragile internals (51 `getElementById` calls in the sheet, zero reactive
bindings). (3) **`botw-encyclopedia`** (the world atlas) is the one that was
built *correctly* — clean data layer, separated logic, reactive state, and it
was explicitly designed to be merged into a bigger app. **The plan: do not
follow `botw-svelte`. Adopt the encyclopedia's architecture as the house style,
rebuild the character sheet to match it, and merge both into one SvelteKit app on
one Supabase project.** The good architecture already exists — we extend it to
the rest of the app instead of bolting two different worlds together.

---

## 1. Decisions locked in (settled during planning)

These are final and should be treated as constraints by the executing chat.

1. **One unified app.** The Atlas is a tab/section alongside the character sheet,
   calendar, deeds, and notes — not a separate site. One login, one database, one
   look. (The sheet and atlas are only the first two of *many* planned functions;
   the structure must make adding more easy.)
2. **SvelteKit, with real per-page URLs.** Chosen deliberately over a simple tab
   switch because the world will hold a lot of data that must be findable and
   shareable — each page gets its own web address (e.g. `/atlas/dust-gullets`),
   the browser back button works naturally, and the app loads only the section
   being viewed. We do the routing work now rather than retrofitting later.
3. **Design direction: "atmospheric world, legible instrument."** The whole app
   wears the atlas's atmospheric identity (deep near-black ground, Cinzel titles,
   EB Garamond lore, gold/blood accents); dense data surfaces (the sheet's
   numbers) use a clean monospace so figures stay sharp. Serif is used **only at
   16px and larger**; all small UI text uses a system sans. Full tokens in §6.
   (Approved, with the note that small/thin serif is avoided by design.)
4. **Keep the existing Supabase project and the live site running** until the new
   app is fully tested and cut over. No risky database changes during the merge.

---

## 2. Plain-language toolchain primer (you have zero coding background)

None of these require writing code from scratch. In practice you will *direct an
assistant* to make changes and your job is to run the project and check the
result.

- **Node.js** — an engine you install on your computer **once**. You never open
  it or look at it; it just has to be present so the build commands work. Like a
  printer driver.
- **VS Code** — the one program you actually open and work in. Think Microsoft
  Word, but it shows the whole project's folders on the left and a file's
  contents on the right. It has a small built-in **terminal** panel where you type
  the one or two commands — so you don't juggle multiple apps.
- **The terminal** — the box inside VS Code where you type commands. Two cover
  almost everything: `npm run dev` (start the live preview) and `npm run build`
  (the safety check before publishing).
- **Vite / SvelteKit dev server** — the "live preview." After `npm run dev` you
  get a link like `localhost:5173`; open it in your browser and there's your app.
  While it runs, **saving a file updates the browser by itself** within a second.
- **GitHub** — a safe online backup of all your code (with full history) **and**
  the thing that publishes your live site for free. You already use it.
- **Supabase** — your database in the cloud (vessels, lore, discoveries). You
  already use it. It does not change in the merge.

**"Which program, which file?"** Open **VS Code** → open the project folder. The
folder names tell you where to go: change the calendar → open its feature folder;
change colours/fonts everywhere → open `src/lib/styles/tokens.css`; add a whole
new function later → add a new folder + a new route. The shared "grand structure"
(login, database connection) sits apart and you rarely touch it. The folder you
open *is* the feature you're changing, and the walls between folders keep mistakes
local.

**Your realistic loop:** describe the change → assistant edits the relevant
file(s) in that one feature folder → you save → the live preview shows it
instantly → if it's right, publish via GitHub. Use a Git **branch** to try
changes on a copy so the working site is never at risk. If `npm run build`
complains, paste the message to your assistant.

---

## 3. Honest diagnosis of what you have

### 3a. The live site (`HTML_live.txt`) — the monolith
- **What it is:** the whole app — login, character vessels, the sheet
  (attributes, skills, combat, inventory, corruption/taint), the calendar
  ("Temporal Horizon"), deeds ("Registry of Deeds"), and notes ("World
  Chronicles") — in one file: ~900 lines of CSS, ~800 of HTML, ~1,500 of JS.
- **Why it's fragile (the core problem):** there is no data model. When it
  saves, it runs `document.querySelectorAll('input, select, textarea')` and dumps
  every element's value into a flat dictionary keyed by the element's HTML `id`,
  then writes that blob to Supabase. **The page is the database.** Change a
  field's id or move it and saving/loading silently breaks. Every feature shares
  one global namespace, so a change in one corner can ripple anywhere.
- **Data storage today:** only **two** Supabase tables — `character_vessels`
  (each row = one character, with a `sheet_data` JSON blob) and `user_roles`.
  Shared campaign data (deeds everyone sees) lives in a *magic row* named
  `__GLOBAL_CAMPAIGN__` in the same table. Clever, but brittle.

### 3b. `botw-svelte` — the lift-and-shift (do not continue this)
- **Good:** correct toolchain, files split by feature, a real `App.svelte` shell,
  a GitHub Pages deploy workflow, a tiny shared `utils.js`/`stores.js`.
- **Wrong:** it kept the monolith's internals. Components still drive the page
  with `getElementById` / `innerHTML` / `classList` instead of Svelte's reactive
  bindings (`Sheet.svelte`: **51** `getElementById`, **0** `bind:value`;
  `Notes.svelte`: **67**). Better *foldering*, not better *architecture* — the
  internals are still the part that breaks.

### 3c. `botw-encyclopedia` — the one built right (the template)
- Genuinely well-architected Svelte, separated into layers:
  - `lib/dataLayer.js` — all state in stores; one `init()` loads from Supabase
    **or** a bundled mock; components never talk to the database directly.
  - `lib/domain.js` — pure rules (discovery tiers, visibility, link parsing) with
    no side effects — easy to reason about and test.
  - focused helpers (`mapEdit`, `navHistory`, `viewport`, `utils`,
    `locationTypes`) — each does one job.
  - components that read stores and render reactively.
- **Designed to merge.** Its `stores.js` *mocks* `session`, `vesselId`,
  `isAdmin` — the same names the main app provides — with a note to delete it at
  merge time. Its `db/schema.sql` adds isolated tables (`world_encyclopedia`,
  `vessel_discoveries`, `deep_lore_entries`, `location_types`) that **reference**
  `character_vessels`, `user_roles`, and `is_admin()` — the two halves were always
  meant to share one Supabase project.

**Conclusion:** the architectural decision is already made. The encyclopedia is
the target shape. The work is to bring the character sheet up to that shape and
join them — inside SvelteKit.

---

## 4. The target architecture (SvelteKit)

One SvelteKit application — the **Codex** — with a shared core, self-contained
feature modules, and real URLs. SvelteKit is Svelte plus a built-in system for
pages/addresses and faster loading; deployment to GitHub Pages stays free via the
**static adapter** in SPA mode (right for an app whose content loads client-side
from Supabase after login).

```
botw-codex/
├─ svelte.config.js          # uses @sveltejs/adapter-static (SPA fallback)
├─ vite.config.js
├─ package.json
├─ .env.local                # VITE_SUPABASE_URL / _ANON_KEY (never committed)
├─ static/                   # favicons, fonts, plain files served as-is
├─ db/                       # ALL SQL in one place (schema, migrations, seeds)
│   ├─ schema.sql
│   ├─ migrations/
│   └─ seed_*.sql
└─ src/
    ├─ app.html              # the page wrapper
    ├─ routes/               # URLs live here (file = page)
    │   ├─ +layout.svelte    # the app shell: auth bar + top nav (every page)
    │   ├─ +page.svelte      # home / landing
    │   ├─ sheet/+page.svelte
    │   ├─ calendar/+page.svelte
    │   ├─ deeds/+page.svelte
    │   ├─ notes/+page.svelte
    │   └─ atlas/
    │       ├─ +page.svelte          # the map / index   ->  /atlas
    │       └─ [id]/+page.svelte     # one entry, deep-linkable -> /atlas/dust-gullets
    └─ lib/                  # importable anywhere as $lib/...
        ├─ styles/
        │   ├─ tokens.css    # ONE design-token file (colours, fonts) — see §6
        │   └─ base.css
        ├─ core/             # SHARED CORE — used by every feature
        │   ├─ supabase.js   # one client for the whole app
        │   ├─ session.js    # auth: session, vesselId, isAdmin stores + actions
        │   ├─ vessels.js    # vessel library: list/create/delete/switch
        │   ├─ toast.js      # one notification system
        │   └─ utils.js      # sanitise, helpers
        └─ features/         # one folder per part of the app (logic + components)
            ├─ sheet/        # Sheet.svelte, sheetData.js, rules.js
            ├─ calendar/
            ├─ deeds/
            ├─ notes/
            └─ atlas/        # the encyclopedia, moved here ~as-is
                ├─ Encyclopedia.svelte, components/...
                ├─ dataLayer.js, domain.js
```

Mental model: **`routes/` decides the URL and which page shows; `lib/features/`
holds what each page is made of; `lib/core/` is the shared plumbing.**

### Why this shape meets the goal — "grow it without affecting the grand structure"
- **Features are islands.** `features/sheet` knows nothing about `features/atlas`.
  Rework the calendar without ever opening a sheet file. A mistake stays local
  because features don't share global ids or functions.
- **The shared core is small and stable.** `lib/core/` (auth, the database client,
  the vessel list) plus `tokens.css` is the "grand structure." It changes rarely;
  features depend on it, not the reverse.
- **One data layer per feature** (the encyclopedia's pattern). Components render;
  the data layer talks to Supabase. Change how something is stored = edit one
  file, not fifty components.
- **Real data models, not the DOM.** Each feature owns a plain object/array that
  is the source of truth; the screen reflects it. Biggest upgrade over both the
  monolith and `botw-svelte`.
- **New functions are cheap.** A future bestiary/faction tracker/item compendium
  is a new `features/` folder + a new route — never tangled into what works.

---

## 5. The four rules that make it "smart and stable"

Enforce these everywhere and tell any AI assistant to follow them.

1. **The data is an object; the screen reflects it.** Never read state out of the
   page. Hold a `sheet` object (or `notes` array, etc.); let Svelte render it.
   Saving = write the object; loading = set the object. No DOM scraping.
2. **Components don't touch the database.** Only a feature's data-layer file
   imports `supabase`. Components call functions like `saveSheet()` /
   `loadVessel(id)`. (This is why the atlas runs identically on a mock or the real
   backend — and why the live site can keep running during migration.)
3. **Game maths is pure and separate.** Skill %, payload weight, corruption,
   oracle rolls — in `rules.js` files that take inputs and return outputs with no
   side effects. Easy to verify, impossible to break by editing the UI.
4. **`npm run build` is your safety net.** It compiles the whole app and fails
   loudly on most mistakes. Run it before every deploy.

---

## 6. The unified design system — "atmospheric world, legible instrument"

One `src/lib/styles/tokens.css` defines everything below; every component
references these tokens (never hard-coded colours/fonts). Approved direction.

**Principle:** atmospheric chrome, legible data. Serif gives the world its essence
but is used **only where it can be big** (titles, lore prose, 16px+). Every small
piece of text uses a clean sans or mono so nothing turns thin or fuzzy.

**Fonts (four, each with one job):**
- `--font-display` : `'Cinzel', serif` — section/entity titles, the brand.
- `--font-body`    : `'EB Garamond', Georgia, serif` — lore, descriptions, prose.
  Use the **medium (500)** weight for body so it never goes spindly.
- `--font-ui`      : `system-ui, 'Segoe UI', sans-serif` — buttons, form labels,
  nav, table headers, all small UI text.
- `--font-data`    : `ui-monospace, 'JetBrains Mono', monospace` — all numbers
  (skill %, weights, counters, dice).

**Rule of thumb:** serif ≥ 16px only; anything smaller uses `--font-ui` or
`--font-data`.

**Core palette (dark):**
- `--bg: #0a0a0f` (base, with a faint radial glow + subtle film grain),
  `--panel: #101017`, `--panel-2: #15151d`, `--panel-3: #1e1e24` (nested),
  `--border: #2a2a32`, `--text: #e8e3d6`, `--text-muted: #8e8e9f`.

**Accents (fixed meanings):**
- `--gold: #d97706`, `--gold-bright: #d4af37` — identity / favor / admin-positive.
- `--blood: #991b1b`, `--crimson: #c01f2f` — danger / destructive / the "blood"
  theme.
- `--taint: #7c3aed` — magic / atlas / secondary.
- `--blue: #0369a1` — info / notes.
- `--green: #166534` — success.

**Surfaces:** layered panels on the textured ground; gold hairline dividers;
dotted-gold underline for in-lore `[[links]]`. The sheet uses tighter spacing +
`--font-data` for numbers; the atlas uses generous spacing + serif for lore — same
tokens, different density per surface.

---

## 7. The merge mechanics (how the two halves actually join)

Four things unify; all four are low-friction because the encyclopedia anticipated
them.

### 7a. One Supabase project (already designed)
Keep the existing project. Final table set:

| Owner | Tables |
|---|---|
| Shared/core | `character_vessels`, `user_roles`, `is_admin()` |
| Atlas | `world_encyclopedia`, `vessel_discoveries`, `deep_lore_entries`, `location_types` |

Run the encyclopedia's `db/schema.sql` + seeds once. The live site never queries
those tables, so **adding them cannot break it** — a safe early step.

### 7b. One set of auth/session stores
Delete the encyclopedia's mock `stores.js`. Create `lib/core/session.js`
exporting the same names (`session`, `vesselId`, `isAdmin`) plus the auth actions
from the live app. Both halves import these names — atlas components keep working
unchanged; the sheet reads the same logged-in vessel.

### 7c. One design system
Merge into `lib/styles/tokens.css` per §6; delete duplicate `:root` blocks. The
two halves already share most accents — only fonts and background treatment
differ, and §6 resolves that.

### 7d. One navigation model — SvelteKit routes
Top-level sections (**Sheet · Calendar · Deeds · Notes · Atlas**) are **routes**,
not a tab switch. The shell (`routes/+layout.svelte`) holds the auth bar and nav;
clicking a section changes the URL. Deep links like `/atlas/dust-gullets` open one
entry directly — shareable with players. This replaces the atlas's hand-written
`navHistory.js`.

---

## 8. The migration sequence (ordered, low-risk, always-working)

Principle: **the live site stays up and untouched until the final step.** Each
phase ends with something that runs.

### Phase 0 — Scaffold (½–1 day) ✅ DONE
- ~~Create the SvelteKit project; configure `adapter-static` (SPA fallback) for
  GitHub Pages.~~ Done — `botw-codex`, `svelte.config.js` uses `adapter-static`
  with `fallback: 'index.html'`; SSR off in `routes/+layout.js` (SPA).
- ~~Move the encyclopedia in under `src/lib/features/atlas/` and wire a
  `routes/atlas/+page.svelte` that renders it **unchanged**.~~ Done — moved with
  its internal structure intact (all relative imports still resolve); the route
  renders the atlas's own `App.svelte`. `npm run dev` shows the atlas as before;
  `npm run build` succeeds. *Checkpoint met: atlas works at `/atlas`.*
- **TODO (manual, in Supabase):** Run the encyclopedia SQL against the live
  Supabase project — `db/schema.sql`, `db/migrations/00{1,2}_*.sql`,
  `db/seed_location_types.sql`, and optionally `db/seed_world.sql` (order and
  details in the README). *Checkpoint: live site still works — it ignores the
  new tables.*

### Phase 1 — Real auth core (½–1 day) ✅ DONE
- ~~Build `lib/core/{supabase,session,vessels,toast,utils}.js` from the live
  app's auth/vessel logic (sound logic; drop only its DOM-coupling).~~ Done.
- ~~Delete the atlas's mock `stores.js`; point its imports at
  `lib/core/session.js`.~~ Done — all atlas components + the headerless
  `App.svelte` now read the real stores; `lib/features/atlas/lib/supabase.js`
  re-exports the one core client.
- ~~The shell shows the real auth bar + vessel selector + nav.~~ Done in
  `routes/+layout.svelte`, plus a shared toast stack. *Checkpoint met: real
  login; the atlas re-loads the logged-in vessel's discoveries on switch.*

### Phase 2 — Rebuild the character features, one at a time (the bulk)
Each fully working before the next. For each: build the data model + `rules.js`,
then a reactive component (§9). Reuse the live app's Supabase calls and formulas
verbatim; throw away its DOM code.
1. **Sheet** (attributes, skills, combat, inventory, corruption). ✅ DONE
2. **Calendar** (epoch/months/weeks/crucibles). ✅ DONE
3. **Deeds** (incl. the shared `__GLOBAL_CAMPAIGN__` data). ✅ DONE — personal
   deeds + claim ledger + AP in the vessel's `sheet_data`; campaign triumphs in
   the `__GLOBAL_CAMPAIGN__` row's `sheet_data.dynamicAchievementsList`. Both
   save paths merge so the other features' keys survive; `isAdmin` gates the
   global-triumph editing and the AP override.
4. **Notes** (books/pages; sanitise all user text through `utils` `s()`). ✅ DONE
   — single-blob like the calendar (no global/shared row): pages live in the
   vessel's `sheet_data.dynamicVesselNotes` as `{ title, category, content }`.
   `rules.js` ports the four book keys, the active-book filter, per-book counts,
   the virtual↔real index mapping and pointer clamp verbatim as pure functions;
   `notesData.js` is the only notes file touching Supabase and MERGES the one key
   over the re-fetched blob; `Notes.svelte` is fully reactive (book tabs, page
   index, "+ Inscribe Page", "Incinerate Page" all real `<button>`s). §5 rule 1
   met structurally: all author text renders through interpolation / `bind:value`
   (auto-escaped) — no `innerHTML` path, unlike the live site. ← **Phase 2
   complete; Phase 3 (unify the look, §6 tokens) now also done — see the status
   block and §8.**

*Checkpoint after each: that route works, saving to the same Supabase rows the
live site uses.*

### Phase 3 — Unify the look (½ day) ✅ DONE
Authored `src/lib/styles/tokens.css` per §6 — one `:root` with the four fonts,
the core dark palette and the fixed-meaning accents — plus a small legacy
**alias layer** that maps the three older naming dialects onto the canonical
names (so the build stays green without a tree-wide rename), and a tiny
`base.css`. Imported both app-wide from `routes/+layout.svelte`, so every route
inherits them. Walked the shell and each rebuilt feature (sheet, calendar,
deeds, notes) once: deleted the layout's inlined palette block, repointed every
component-local CSS-var fallback / one-letter shorthand straight at the shared
tokens (no hard-coded fallbacks, no self-referential cycles), and applied §6's
type rule (serif only at ≥16px; small UI on `--font-ui`; numbers on
`--font-data`). The atlas folded its **duplicate GLOBAL palette** into
`tokens.css` and **kept its map-specific tokens** (`--region-*`, `--sector-*`,
`--map-bg`, `--sheet-bg`, `--safe-bottom`) in `app.css`; it renders as before
save for its body/muted text taking §6's canonical parchment values. The home
landing was folded too (identical values → zero visual change). `npm run build`
passes with only the pre-existing Sheet a11y warnings (Phase 3 adds none).
← **Phase 3 complete; next: Phase 4 — cut over (below).**

### Phase 4 — Cut over (½ day) ← **IN PROGRESS (staged hand-off)**

**Done in-repo (committed; verified by local build at root and sub-path):**
- `svelte.config.js` `paths.base` is env-driven (`BASE_PATH`), `relative: false`;
  internal links + `pathname` checks go through `base` from `$app/paths` so the
  app works both at root and under `user.github.io/<repo>/`.
- `.github/workflows/deploy.yml` — builds with `adapter-static`, injects the
  Supabase secrets from repo Secrets at build time, computes the base path from
  the repo name, writes the SPA `404.html` + `.nojekyll`, and deploys to the
  repo's own GitHub Pages (a **staging URL**, isolated from the live site).
- `static/.nojekyll` committed; `.env.example` committed (now also names the
  GitHub Secrets for deploys); `.env.local` confirmed gitignored.
- `legacy/README.md` — the one-release rollback slot for the old monolith.
- `npm run build` green; only the known `Sheet.svelte:368` a11y warnings remain.

**Left for the operator (manual — needs GitHub/Supabase; runbooks in the README):**
1. Confirm the unknowns (Supabase URL+anon key & dashboard; live-site host; the
   GitHub account/repo name).
2. Wire `.env.local` to the existing project and run the local smoke-test against
   the real backend (login · every route · save+reload · admin-vs-player · a deep
   link).
3. Run the outstanding **Phase 0** SQL in the Supabase SQL Editor (additive,
   isolated — the live monolith ignores it).
4. Create the GitHub repo, push, add the two repo Secrets, set Pages source =
   GitHub Actions; let the workflow publish the **staging** site; smoke-test it.
5. **Cut over last:** archive the old monolith into `legacy/`, then replace the
   live `index.html` with the built app — keeping the archived HTML one release as
   a rollback. The live site stays up and untouched until this final step.

> **Data-model note during migration.** Keep writing to
> `character_vessels.sheet_data` in the *same JSON shape* at first (including the
> `__GLOBAL_CAMPAIGN__` magic row). Old and new coexist; Phase 2 stays a pure
> front-end rebuild with **no database migration risk**. *Later*, as a separate
> optional improvement, normalise (real `deeds`/`note_pages` tables, an inventory
> array instead of `saved_item_name_1..24`). Don't couple cleanup to the merge —
> one risky change at a time.

---

## 9. Rebuilding the sheet the right way (the key technique)

The exact thing `botw-svelte` skipped.

**Old way (monolith and `botw-svelte`)** — the page is the data:
```js
const str = document.getElementById('val_str').value;            // read from DOM
document.getElementById('base_endurance').innerText = pct + '%'; // write to DOM
querySelectorAll('input,select').forEach(n => packet[n.id]=n.value); // save = scrape
```

**New way** — a data object, a pure rule, a reactive view:
```svelte
<script>
  import { conversionTable } from './rules.js';
  let sheet = { val_str: 7, alloc_endurance: 0 /* ...all fields... */ }; // source of truth
  $: baseEndurance  = conversionTable[sheet.val_str];   // recompute automatically
  $: totalEndurance = baseEndurance + sheet.alloc_endurance;
  $: if (ready) saveSoon(sheet);                        // save = write the object
</script>

<input type="number" bind:value={sheet.val_str} min="2" max="18" />
<span>Endurance base: {baseEndurance}%</span>
<span>Total: {totalEndurance}%</span>
```
Maths lives in `rules.js` (verifiable); data is one object (save/load trivial);
the screen updates itself. Inventory becomes a real array:
```svelte
{#each sheet.inventory as item, i}
  <input bind:value={item.name} />
  <input type="number" bind:value={item.weight} />
{/each}
$: payloadWeight = sheet.inventory.reduce((t, x) => t + (+x.weight || 0), 0);
```

Instruction to the assistant: *"port the formulas and Supabase calls from the live
HTML, but express the UI as a Svelte data model with `bind:` and reactive `$:`
statements — no `getElementById`, no `innerHTML`, no DOM scraping."*

---

## 10. What SvelteKit gives you (and what it means for you)

- **Real addresses per page** — `/atlas`, `/sheet`, `/atlas/dust-gullets`. Send a
  player a link straight to one location or rule.
- **Natural back button + bookmarks**, and **faster loads** as the world grows
  (only the viewed section loads).
- **Retires hand-written navigation** — the atlas's `navHistory.js` goes away.
- **What it asks of you:** nothing extra day-to-day. Same VS Code, same
  `npm run dev` / `npm run build`. The only new ideas are "a file under
  `routes/` is a page" and a one-time GitHub Pages adapter setting — both handled
  in Phase 0 by the assistant.

---

## 11. How you'll actually work (Windows · VS Code · Node)

- **One-time:** install Node LTS; open the project in VS Code; `npm install`.
- **Daily:** `npm run dev` → a localhost URL with live reload as files change.
- **Before deploying, always:** `npm run build`. Succeeds → safe to deploy;
  errors → don't deploy, paste the message to your assistant.
- **Work in branches.** `git checkout -b sheet-rebuild`; if it goes wrong, discard
  the branch and `main` is untouched. The practical version of "don't affect the
  grand structure."
- **Change one feature per session.** The structure makes this possible — lean in.
- **You direct, the assistant edits.** Describe the change → it edits files in the
  one feature folder → you save → preview updates → publish when right.
- **Keep this file current.** When something changes materially, have the
  assistant update it. Starting each new chat with this file keeps work coherent.
- **Secrets:** Supabase URL/key in `.env.local` (gitignored) for local dev, and in
  GitHub repo *Secrets* for deploys — never pasted into code.

---

## 12. The plan in one picture

```
TODAY                              TARGET (SvelteKit, one app, real URLs)
────────────────                   ──────────────────────────────────────
live HTML monolith   ─┐            botw-codex
(character sheet)     │  rebuild     src/routes/         -> the URLs (/sheet, /atlas/[id])
                      ├─ as ───────▶ src/lib/core/       -> shared plumbing (auth, db, tokens)
botw-svelte           │  reactive    src/lib/features/sheet     (rebuilt, reactive)
(lift-and-shift)     ─┘  features    src/lib/features/calendar  (rebuilt, reactive)
                                     src/lib/features/deeds     (rebuilt, reactive)
botw-encyclopedia ──── move in ────▶ src/lib/features/notes     (rebuilt, reactive)
(world atlas, good)    ~as-is        src/lib/features/atlas     (already good)
                                   one Supabase project · one login · one design
```

*Bring the character sheet up to the atlas's standard, share one core, ship one
app with real page-addresses. Grow each new function on its own island from then
on.*

---

*Living handoff. Decisions in §1 are settled. Phases 0–3 are complete (Sheet,
Calendar, Deeds, Notes all rebuilt; the look unified onto one token file). Phase
4 (cut over) is a staged hand-off: the in-repo deploy scaffolding is committed
and the build is green at root and under a sub-path; the remaining steps are
manual (GitHub repo + Secrets + Pages, the Supabase SQL, the local smoke-test,
and the final live `index.html` swap) and are scripted as runbooks in the
README's "Deploying & cutting over" section.*

---

## 13. Addendum — Phase 4 session (UI consistency + offline preview)

Small, non-feature changes made alongside the cut-over hand-off. None touch the
Supabase schema, the live monolith, or the four rules (§5).

- **Atlas responsive fix (the desktop "squished to the left" bug).** The atlas's
  `app.css` used bare element selectors (`main`, `header`, `aside`) from when it
  owned the whole page. In the unified Codex the shell also renders
  `<main class="content">` and `<header class="topbar">`, so the global
  `main{display:flex}` leaked onto the shell's content area and turned it into a
  horizontal flex row — collapsing the atlas into a narrow left column. Those
  selectors are now **scoped under `.atlas-host`** (the atlas's own wrapper), and
  the shell's `.content.atlas` is an explicit flex column. Result: proper
  desktop two-pane, plus the tablet/phone (`≤880`/`≤600`) and bottom-sheet paths
  now fill the content area. Atlas-domain map tokens (§6) unchanged.

- **Unified empty/loading/error states.** New shared component
  `src/lib/components/FeatureState.svelte` mirrors the Sheet's empty look. Sheet,
  Calendar, Deeds, and Notes now render those states at the component root
  (outside the max-width content wrappers that previously narrowed Calendar/
  Deeds/Notes), so every tab presents them identically. Per-feature dead `.empty`
  CSS removed.

- **Landing page copy.** `src/routes/+page.svelte` now reflects reality: all five
  sections are live and linked (was the Phase 0 "Being bound" placeholder).

- **Offline sample-vessel preview (TEMPORARY, dev-only aid).**
  `src/lib/core/demoVessel.js` lets you click through Sheet/Calendar/Deeds/Notes
  locally with no backend. It is **only active when `isSupabaseConfigured` is
  false**, it **never writes** (offline saves already no-op), and it is inert the
  moment real keys are set. It is intentionally easy to delete: the file plus
  five tagged `DEMO-PREVIEW` spots (one per feature data layer's offline branch,
  and the button in `routes/+layout.svelte`). Remove it before/after cut-over at
  your leisure — leaving it in is harmless online.
