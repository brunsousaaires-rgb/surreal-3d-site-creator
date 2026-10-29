// Service worker do Ninar: funciona offline depois da primeira visita.
// Nenhum dado do bebê passa por aqui — só os arquivos do app.
const SHELL = 'ninar-shell-v1'
const ASSETS = 'ninar-assets-v1'
const EXTERNAL = 'ninar-ai-v1' // modelo de IA e WASM (baixados uma vez)
const KEEP = [SHELL, ASSETS, EXTERNAL]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon.svg', '/worklets/tap.js']))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Navegação: rede primeiro (pega atualizações), cache se offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(SHELL).then((c) => c.put('/', copy))
          return res
        })
        .catch(() => caches.match('/').then((r) => r || Response.error())),
    )
    return
  }

  // Arquivos com hash no nome: imutáveis → cache primeiro.
  if (url.origin === location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(ASSETS, req))
    return
  }

  // IA de choro (jsDelivr + Google Storage): versão fixa → cache primeiro.
  if (url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'storage.googleapis.com') {
    event.respondWith(cacheFirst(EXTERNAL, req))
    return
  }

  if (url.origin === location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(SHELL).then((c) => c.put(req, copy))
          }
          return res
        })
        .catch(() => caches.match(req).then((r) => r || Response.error())),
    )
  }
})

async function cacheFirst(name, req) {
  const cached = await caches.match(req)
  if (cached) return cached
  const res = await fetch(req)
  if (res.ok) {
    const cache = await caches.open(name)
    cache.put(req, res.clone())
  }
  return res
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const client = list.find((c) => 'focus' in c)
      return client ? client.focus() : self.clients.openWindow('/')
    }),
  )
})
