self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
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
