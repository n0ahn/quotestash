/// <reference lib="webworker" />
// Custom service worker, built with the `injectManifest` strategy of
// @vite-pwa/sveltekit (see vite.config.ts). Workbox still handles
// precaching of the app shell via `self.__WB_MANIFEST` below; we add
// our own `push` / `notificationclick` handlers on top for push
// notifications, since `generateSW` has no hook for custom event
// listeners like these.

import { precacheAndRoute } from 'workbox-precaching';

declare let self: ServiceWorkerGlobalScope;

precacheAndRoute(self.__WB_MANIFEST);

type PushPayload = {
  title: string;
  body: string;
  url: string;
  notificationId?: string;
};

self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;

  let payload: PushPayload;
  try {
    payload = event.data.json();
  } catch {
    // Fallback for plain-text push payloads.
    payload = { title: 'QuoteStash', body: event.data.text(), url: '/rooms' };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: payload.url, notificationId: payload.notificationId },
      tag: payload.notificationId // collapse duplicate pushes for the same notification
    })
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const targetUrl = (event.notification.data?.url as string) || '/rooms';

  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      // Focus an existing tab already on this room/quote if one is open,
      // rather than always opening a new one.
      for (const client of allClients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return (client as WindowClient).focus();
        }
      }

      return self.clients.openWindow(targetUrl);
    })()
  );
});

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});