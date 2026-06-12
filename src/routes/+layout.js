// Root layout load config — applies to every route.
//
// SPA mode: the app renders entirely in the browser (data loads client-side
// from Supabase after login). Turning SSR off means feature code that touches
// browser APIs — the atlas's onMount/init, viewport listeners, etc. — runs the
// same way it did as a standalone Vite app. This is what lets the atlas render
// "unchanged" under SvelteKit.
//
// prerender is off because there's no static content to bake; the adapter's
// fallback shell (svelte.config.js) serves all routes.
export const ssr = false
export const prerender = false
