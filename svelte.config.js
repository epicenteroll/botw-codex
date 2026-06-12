import adapter from '@sveltejs/adapter-static'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/**
 * Blood of the World — Codex.
 *
 * adapter-static in SPA mode: the whole app is rendered in the browser (after
 * login, content loads client-side from Supabase), so we ship a single fallback
 * HTML shell that every route boots from. This is the right shape for an app
 * like this and keeps GitHub Pages hosting free.
 *
 * `fallback: 'index.html'` makes `npm run build` succeed without prerendering
 * and lets client-side routes (e.g. /atlas, and later /atlas/[id]) resolve.
 * SSR is turned off globally in src/routes/+layout.js.
 *
 * Phase 4 note — GitHub Pages project sub-path (user.github.io/<repo>/):
 * the base path is read from the BASE_PATH environment variable at build time.
 *   • Local dev / `npm run build`      -> BASE_PATH unset  -> base '' (root).
 *   • The deploy workflow              -> BASE_PATH=/<repo> -> base '/<repo>'.
 * Because the value is supplied by the environment, nobody has to hand-edit this
 * file per deployment. The deploy workflow (.github/workflows/deploy.yml) sets
 * BASE_PATH from the repository name and also copies the fallback to 404.html
 * and writes .nojekyll. Internal links use `base` from `$app/paths` so they
 * resolve correctly whether base is '' or '/<repo>' (see routes/+layout.svelte
 * and routes/+page.svelte). `relative: false` keeps built asset URLs absolute
 * under the base, which is the robust shape for Pages deep links.
 *
 * @type {import('@sveltejs/kit').Config}
 */
const base = process.env.BASE_PATH || ''

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: 'index.html',
    }),
    paths: {
      base,
      relative: false,
    },
    // alias kept explicit so feature folders read clearly in imports
    alias: {
      $features: 'src/lib/features',
    },
  },
}

export default config
