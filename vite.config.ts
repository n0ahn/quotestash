import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit(),
    SvelteKitPWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      strategies: 'generateSW',
      manifest: {
        name: 'QuoteStash',
        short_name: 'QuoteStash',
        description: 'Save funny quotes with your group.',
        theme_color: '#7C6FF7',
        background_color: '#09090B',
        display: 'standalone',
        start_url: '/rooms',
        scope: '/',
        orientation: 'portrait-primary',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      },
      workbox: {
        // Don't try to precache/serve API or auth-sensitive routes offline —
        // this is a live, multiplayer app (rooms/quotes/quiz), not content
        // that should be served stale. We only precache the app shell.
        navigateFallback: null,
        globPatterns: ['**/*.{js,css,ico,png,svg,webmanifest}'],
        runtimeCaching: [
          {
            // Cache the app's own static assets (icons, fonts, etc.) —
            // never Supabase API calls, which must always hit the network.
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/icon-'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'quotestash-icons',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 }
            }
          }
        ]
      },
      devOptions: {
        // Enable the service worker in `vite dev` too, so installability
        // can be tested locally without a production build.
        enabled: true,
        type: 'module'
      },
      kit: {
        // adapter-vercel serves prerendered/static output from a CDN,
        // this makes sure the generated manifest/sw are treated as such.
      }
    })
  ]
});