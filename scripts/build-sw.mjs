// Generates dist/sw.js with Workbox after `expo export`: precaches the app shell, fonts and icons so the
// app opens offline. Push handlers come from public/sw-push.js.
import { generateSW } from 'workbox-build';

const { count, size, warnings } = await generateSW({
  globDirectory: 'dist',
  globPatterns: ['**/*.{js,css,html,ttf,otf,woff,woff2,ico,png,svg,json}'],
  // Splash screens are only used by iOS at launch; don't precache ~100 KB of them. The demo backend chunk
  // (~1 MB of seed data) is only ever loaded with EXPO_PUBLIC_DEMO=1.
  // SEO pages are for search engines and first visits; they never need to be offline.
  globIgnores: [
    'splash/**',
    'sw-push.js',
    'calories/**',
    'sitemap.xml',
    'robots.txt',
    ...(process.env.EXPO_PUBLIC_DEMO === '1' ? [] : ['_expo/static/js/web/backend-*.js']),
  ],
  swDest: 'dist/sw.js',
  importScripts: ['/sw-push.js'],
  navigateFallback: '/index.html',
  navigateFallbackDenylist: [/^\/sw\.js$/, /^\/manifest\.json$/, /^\/calories(\/|$)/, /^\/(sitemap\.xml|robots\.txt)$/],
  maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  skipWaiting: true,
  // API calls always go to the network. Offline data comes from the persisted query cache, which is
  // cleared on sign-out (an SW cache keyed by URL could leak one user's rows to the next on a shared phone).
  runtimeCaching: [{ urlPattern: ({ url }) => url.hostname.endsWith('.supabase.co'), handler: 'NetworkOnly' }],
});
for (const w of warnings) console.warn(w);
console.log(`service worker: precached ${count} files (${(size / 1024).toFixed(0)} KB)`);
