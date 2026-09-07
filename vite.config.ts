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
      // Switched from 'generateSW' to 'injectManifest': push notifications
      // need custom `push` / `notificationclick` listeners in the service
      // worker (src/service-worker.ts), which generateSW has no hook for.
      // injectManifest still precaches the app shell (via
      // self.__WB_MANIFEST inside our own SW file) but lets us own the
      // rest of the worker's code.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'service-worker.ts',
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
      injectManifest: {
        // Same intent as the old workbox.globPatterns: only precache the
        // app shell's static assets, never API/auth-sensitive routes —
        // this is a live, multiplayer app, not content to serve stale.
        globPatterns: ['**/*.{js,css,ico,png,svg,webmanifest}']
      },
      devOptions: {
        // Enable the service worker in `vite dev` too, so installability
        // and push can be tested locally without a production build.
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