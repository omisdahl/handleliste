// Minimal service worker: gjør appen installerbar. Ingen caching ennå, så lista er alltid fersk.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
