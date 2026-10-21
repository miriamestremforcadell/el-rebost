// Service worker: memòria cau de l'aplicació perquè s'obri sense connexió (funciona sota qualsevol subruta).
const CACHE = 'rebost-v2'
const ROOT = self.registration.scope
self.addEventListener('install', (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll([ROOT, ROOT + 'favicon.svg', ROOT + 'manifest.webmanifest']))) })
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())) })
self.addEventListener('fetch', (e) => {
  const r = e.request
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return
  e.respondWith(fetch(r).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); return res }).catch(() => caches.match(r).then((m) => m || caches.match(ROOT))))
})
