// Memòria cau de l'aplicació. Les dades d'usuari viuen a IndexedDB i mai no s'esborren des d'aquest fitxer.
const CACHE = 'rebost-v3'
const CACHE_PREFIX = 'rebost-'
const ROOT = self.registration.scope
const APP_ASSETS = [ROOT, ROOT + 'favicon.svg', ROOT + 'manifest.webmanifest', ROOT + 'icon-192.png', ROOT + 'icon-512.png', ROOT + 'icon-maskable-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_ASSETS)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  // Per a navegació, prioritza la versió publicada i recorre a la memòria cau fora de línia.
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone()
        caches.open(CACHE).then((cache) => cache.put(request, copy))
      }
      return response
    }).catch(async () => (await caches.match(request)) || (await caches.match(ROOT)))
    )
    return
  }
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
      return cached || network
    })
  )
})
