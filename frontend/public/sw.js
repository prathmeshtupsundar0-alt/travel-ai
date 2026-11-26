const APP_SHELL_CACHE = 'travelai-app-shell-v1'

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => cache.add('/index.html'))
      .catch(() => {})
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// SPA Navigation Fallback: ensures refreshing /dashboard or /trips/:id always serves index.html even if static host returns 0 bytes
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate' || event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api')) return

  event.respondWith(
    (async () => {
      try {
        const indexRes = await fetch('/index.html', { cache: 'no-store' })
        if (indexRes && indexRes.ok) {
          const clone = indexRes.clone()
          caches
            .open(APP_SHELL_CACHE)
            .then((cache) => cache.put('/index.html', clone))
            .catch(() => {})
          return indexRes
        }
      } catch {
        // Fall back to cached app shell if offline
      }
      const cached = await caches.match('/index.html')
      if (cached) return cached
      return fetch(event.request)
    })()
  )
})

self.addEventListener('message', (event) => {
  const data = event.data
  if (!data || data.type !== 'SHOW_TRAVEL_REMINDER') return
  const payload = data.payload || {}
  const title = payload.title || 'TravelAI Reminder'
  const options = {
    body: payload.body || '',
    tag: payload.tag || `travelai-reminder-${payload.reminderId || Date.now()}`,
    renotify: false,
    requireInteraction: true,
    data: {
      url: payload.url || '/dashboard',
      tripId: payload.tripId || '',
      reminderId: payload.reminderId || '',
    },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    payload = { title: 'TravelAI Reminder', body: event.data ? event.data.text() : '' }
  }
  const title = payload.title || 'TravelAI Travel Reminder'
  const options = {
    body: payload.body || 'You have an upcoming travel reminder.',
    tag: payload.tag || `travelai-push-${payload.reminderId || Date.now()}`,
    renotify: false,
    requireInteraction: true,
    data: {
      url: payload.url || '/dashboard',
      tripId: payload.tripId || '',
      reminderId: payload.reminderId || '',
    },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = (event.notification.data && event.notification.data.url) || '/dashboard'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.focus()
          if ('navigate' in client) {
            return client.navigate(targetUrl)
          }
          return client
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
      return null
    })
  )
})
