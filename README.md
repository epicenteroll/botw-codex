# Blood of the World — Codex

The unified app. One SvelteKit project that will hold the character **Sheet**,
**Calendar**, **Deeds**, **Notes**, and the world **Atlas** — one login, one
database, one look. See `ARCHITECTURE_AND_MIGRATION_PLAN.md` for the full brief
and the phased migration sequence.

> **Status: Phases 0–3 complete; Phase 4 (cut over) is a staged hand-off.**
> The whole app is rebuilt (Sheet · Calendar · Deeds · Notes · Atlas), unified on
> one design-token file. The in-repo deploy scaffolding is committed and the build
> is green at the site root and under a project sub-path. The remaining Phase 4
> steps are manual (they need your GitHub + Supabase accounts) and are scripted
> below in **"Deploying & cutting over"**. Until the very last step, your live
> site stays up and untouched.

---

## Run it

One-time:

```bash
npm install
```

Daily (live preview with auto-reload):

```bash
npm run dev
```

Open the printed `localhost:5173` link. Visit `/` for the landing page and
`/atlas` for the world atlas.

Before deploying, always run the safety check:

```bash
npm run build
```

If it succeeds, the app compiles cleanly. If it errors, don't deploy — paste the
message to your assistant.

---

## What's here (Phase 0)

```
botw-codex/
├─ svelte.config.js          # adapter-static, SPA fallback (GitHub Pages-ready)
├─ vite.config.js
├─ .env.local                # Supabase keys (blank = offline mock) — gitignored
├─ .env.example              # template (committed)
├─ db/                       # ALL SQL in one place
│  ├─ schema.sql             #   the four atlas tables (additive, isolated)
│  ├─ seed_location_types.sql
│  ├─ seed_world.sql
│  └─ migrations/            #   001_geometry, 002_sector_state
├─ scripts/                  # SQL generators (npm run gen:sql / gen:world)
├─ static/                   # favicon, plain files served as-is
└─ src/
   ├─ app.html               # page wrapper (world fonts in the head)
   ├─ routes/                # URLs (file = page)
   │  ├─ +layout.svelte      #   app shell — passthrough for now (real nav = Phase 1)
   │  ├─ +layout.js          #   SPA mode: ssr off, client-rendered
   │  ├─ +page.svelte        #   / — landing
   │  └─ atlas/+page.svelte  #   /atlas — renders the atlas unchanged
   └─ lib/
      └─ features/
         └─ atlas/           # the encyclopedia, moved in ~as-is
            ├─ App.svelte     #   its prototype shell (still has the mock
            │                 #   Admin/Player toggle — removed in Phase 1)
            ├─ app.css        #   its design tokens + global styles
            ├─ components/encyclopedia/...
            └─ lib/...        #   dataLayer, domain, stores (mock), supabase, ...
```

The atlas was moved **without edits**: its internal folder structure is intact,
so every relative import still resolves. The only new code is the SvelteKit
plumbing (`routes/`, `app.html`, config) and a small landing page.

### Offline by default

With `.env.local` blank, the atlas runs against its bundled seed
(`src/lib/features/atlas/lib/seed.json`) — no backend needed. Fill in the
Supabase keys to query the real project instead; no code changes either way.

**Previewing the other tabs offline.** Sheet/Calendar/Deeds/Notes normally need a
logged-in vessel, so offline they'd show "No vessel summoned." To look at them
without a backend, click **"Preview sample vessel"** in the top-right while in
offline mode. It loads a read-only sample character entirely in memory — it never
writes anywhere and disappears the moment real Supabase keys are set. It's a
temporary dev aid (`src/lib/core/demoVessel.js`); see the architecture doc §13
for how to remove it. Click **"Exit sample vessel"** to clear it.

---

## The remaining Phase 0 step (do this in Supabase)

Phase 0's third checkpoint is a database step that runs in your Supabase
dashboard, not in this repo. It is safe: the four atlas tables are **additive
and isolated** — the live HTML site never queries them, so adding them cannot
break it.

In the Supabase **SQL Editor**, run, in order:

1. `db/schema.sql` — creates `world_encyclopedia`, `vessel_discoveries`,
   `deep_lore_entries`, `location_types` (they reference your existing
   `character_vessels`, `user_roles`, and `is_admin()` — read-only).
2. `db/migrations/001_geometry.sql`
3. `db/migrations/002_sector_state.sql`
4. `db/seed_location_types.sql` — the 62 location types.
5. `db/seed_world.sql` *(optional)* — the starter world content.

> **Checkpoint:** the live site still works (it ignores the new tables). The
> atlas can now read the real project once you add the keys to `.env.local`.

The SQL seeds are generated from the same source of truth the app uses, so they
never drift. Regenerate them with `npm run gen:sql` (location types) and
`npm run gen:world` (the seeded world).

---

## Deploying & cutting over (Phase 4 — the manual steps)

Everything the repo can carry is already in place (the deploy workflow, the
base-path config, the SPA `404.html`/`.nojekyll`, the committed `.env.example`,
the `legacy/` rollback slot). What's left needs your GitHub and Supabase
accounts, so it's done by hand, in this order. **Your live site is not touched
until Step 6.**

### Step 0 — Confirm three unknowns first

Don't proceed until you can answer these. If any is "unsure," here's how to find out:

- **Do you have the existing Supabase project's URL + anon key, and dashboard
  access?** Find out: sign in at `supabase.com` → your project → **Project
  Settings → API**. The **Project URL** and the **`anon` `public`** key are
  there. (These are the same pair already shipped in your old live HTML — open
  that file and search for `supabase.co` to cross-check.) The `anon` key is
  meant to be public; never use the `service_role` key.
- **Who hosts your live site, so you can do the final swap and keep a rollback?**
  Find out: open your live site, note the domain. If it's
  `something.github.io`, it's GitHub Pages — the swap is a commit to that repo.
  If it's a custom domain, check where its DNS/host points (Netlify, Cloudflare
  Pages, a plain static host, etc.). You need write access to whatever serves
  the live `index.html`.
- **Which GitHub account + repo name do you want?** e.g. account `yourname`,
  repo `botw-codex`. That makes your staging URL
  `https://yourname.github.io/botw-codex/`. The repo name decides the base path
  automatically — no config edit needed.

### Step 1 — Wire `.env.local` to the existing project (local)

> ⚠️ **A `.env.local` with credentials already exists in this project.** It was
> not created by you in offline mode, so treat it as unverified. Open it and
> confirm `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` exactly match your live
> project (compare against **Project Settings → API**, and against the old HTML).
> If they don't match, replace them. If the file were missing, you'd copy
> `.env.example` to `.env.local` and paste the two values in. It is gitignored —
> confirmed it will not be committed.

Then start the app pointed at the real backend:

```bash
npm install
npm run dev
```

The top-right of the shell should now show the **login form** (email + password),
*not* the "Demo / offline — no backend keys set" pill. If you still see that
pill, the keys aren't being read — stop and re-check `.env.local`.

### Step 2 — Local smoke-test against the REAL backend (before any deploy)

Do this on `localhost` with the real keys, signed in as a **normal player
account** first, then repeat the admin-only checks as an admin account. Tick
every box:

- [ ] **Login** with your real account succeeds; the email pill + vessel
      selector appear. Refresh the page — you stay logged in.
- [ ] **Vessel load:** pick an existing vessel from the selector. It loads
      without error.
- [ ] **`/sheet`** shows that vessel's real attributes/skills/inventory/taint
      from the live data (numbers match what the old site shows for the same
      vessel).
- [ ] **`/calendar`** shows the right age/crucible/month/day.
- [ ] **`/deeds`** shows personal deeds + AP, and the campaign triumphs.
- [ ] **`/notes`** shows the vessel's pages by book.
- [ ] **`/atlas`** loads the world (real data once the Phase 0 SQL in Step 3 is
      run; before that, the atlas may be empty/seed — that's expected).
- [ ] **Save + reload persistence:** make one small edit on `/sheet` (e.g. nudge
      a counter), wait for the autosave, **hard-refresh**, confirm it persisted.
- [ ] **Cross-check the old site (the real safety test):** open your **old live
      monolith** on the *same vessel*, confirm it reads the value the new app
      wrote, and that nothing else on that vessel changed. This proves the
      shared `sheet_data` shape round-trips both ways with no DB migration.
- [ ] **Admin vs non-admin:** as a **non-admin**, the campaign-triumph editing
      and the AP override on `/deeds` are read-only / disabled, and no `⚔ ADMIN`
      pill shows. As an **admin**, the pill shows and those controls are
      editable.
- [ ] **Deep link:** type a route URL straight into the address bar (e.g.
      `localhost:5173/sheet`) — it loads directly (this is what the SPA fallback
      guarantees in production too).

**Do-no-harm guardrails while testing:** test on a **throwaway/secondary vessel**
if you have one, so a mistake can't dirty a vessel you care about. The new app's
saves **merge** over the latest stored blob (calendar/deeds/notes keys survive),
but the safest proof is the cross-check bullet above. Do **not** click
**Sacrifice** on a real vessel — it deletes the row.

### Step 3 — Run the outstanding Phase 0 SQL (Supabase dashboard)

In the Supabase **SQL Editor**, run these **in order** (each is in this repo's
`db/`). They are **additive and isolated** — they only `CREATE`/`ALTER` the four
new atlas tables and `READ` your existing `character_vessels` / `user_roles` /
`is_admin()`; the live monolith never queries them, so adding them **cannot break
it**:

1. `db/schema.sql` — creates `world_encyclopedia`, `vessel_discoveries`,
   `deep_lore_entries`, `location_types`.
2. `db/migrations/001_geometry.sql` — additive columns + `updated_at` triggers
   (idempotent: `ADD COLUMN IF NOT EXISTS`, `CREATE OR REPLACE`).
3. `db/migrations/002_sector_state.sql` — adds `chart_status` (idempotent).
4. `db/seed_location_types.sql` — the 62 location types.
5. `db/seed_world.sql` *(optional)* — the starter world content.

> Checkpoint: reload your **live site** — it still works (it ignores the new
> tables). Reload `/atlas` in the new app — it now reads real world data.

### Step 4 — Create the repo, push, add Secrets, enable Pages (GitHub)

1. Create a **new** GitHub repo (e.g. `botw-codex`) — empty, no template.
2. Push this project to it (`main` branch). `.env.local` will **not** be pushed
   (gitignored); `.env.example` will.
3. Repo → **Settings → Secrets and variables → Actions → New repository secret**,
   add two, named **exactly**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Repo → **Settings → Pages → Build and deployment → Source = GitHub Actions**.

That's all the workflow needs. On the push (or via **Actions → Deploy Codex to
GitHub Pages → Run workflow**) it builds and publishes your **staging URL**:
`https://<account>.github.io/<repo>/`.

### Step 5 — Smoke-test the STAGING URL

Re-run the Step 2 checklist against the staging URL (especially the **deep
link** — visit `https://<account>.github.io/<repo>/sheet` directly; the
`404.html` fallback must serve the app, not a GitHub 404). Staging is a separate
site; testing it cannot affect the live monolith.

### Step 6 — Cut over last (the only step that touches the live site)

1. Copy your current live `index.html` into `legacy/index.live-pre-codex.html`
   and commit it (see `legacy/README.md`) — your rollback.
2. Replace the live site's `index.html` with the built app:
   - **If the live site is on GitHub Pages:** the cleanest path is to point that
     live repo's Pages at this app (same workflow), or copy the contents of
     `build/` into the live repo. Keep the archived monolith committed.
   - **If hosted elsewhere:** upload the contents of `build/` (the output of
     `npm run build`) to that host as the new site root.
3. Verify the live URL serves the new app and reads real vessel data. Keep the
   `legacy/` archive for one release. **Rollback if needed** = put
   `legacy/index.live-pre-codex.html` back as `index.html`; because the data
   shape and Supabase project are unchanged, it's a file swap, not a data
   restore.

---

## The four rules still hold (§5)

This phase changed **no** Supabase table schema and **no** live-monolith
behaviour. The UI-consistency work and the offline preview added alongside it
(atlas responsive scoping, the shared empty-state component, the landing copy,
and the removable `demoVessel` dev aid) are recorded in the architecture doc
§13; none touch the data model. The data is still an object the screen reflects;
components still don't touch the database; game maths stays pure; and
`npm run build` remains the safety net — green here, with only the known
`Sheet.svelte:368` a11y warnings.
