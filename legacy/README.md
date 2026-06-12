# `legacy/` — the old live monolith, kept as a one-release rollback

This folder exists so the **previous live site** (the single-file monolith HTML
character sheet) is archived alongside the new Codex for exactly one release
after cut-over, per `ARCHITECTURE_AND_MIGRATION_PLAN.md` §8 Phase 4 and the cut-
over runbook in the README.

## What to put here (one manual step, just before you cut over)

Copy your **current live `index.html`** (the monolith that is serving players
today) into this folder, renamed so it's unmistakable:

```
legacy/index.live-pre-codex.html
```

Then commit it:

```bash
git add legacy/index.live-pre-codex.html
git commit -m "Archive pre-Codex live monolith for rollback"
```

Why renamed and not left as `index.html`: so it can never be mistaken for, or
accidentally served as, the site's real entry point. It is a frozen snapshot,
nothing more.

## Why keep it

If anything goes wrong after the production swap, rollback is: take this exact
file back to wherever the live site is hosted as `index.html`. Because the new
Codex writes the **same `sheet_data` shape** to the **same Supabase project**
(no database migration — §8 data-model note, §5 rule 2), the old monolith will
read player data written by the new app and vice-versa. The rollback is a file
swap, not a data restore.

## When to delete it

After the new Codex has run in production for one release without issue, you can
remove this archived file in a later commit. Keeping it longer does no harm; it
is never loaded by the app.

> Note: this snapshot was **not** included in the project zip handed to the
> assistant, so the assistant could not place the file for you — only this slot
> and these instructions. Dropping the real file in is the one manual step.
