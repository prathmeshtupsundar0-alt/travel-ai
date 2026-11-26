import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('travelai_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

export const authApi = {
  register: (data: { name: string; email: string; password: string }) => api.post('/auth/register', data),
  login: (data: { email: string; password: string }) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
}

export const tripsApi = {
  list: () => api.get('/trips'),
  create: (data: unknown) => api.post('/trips', data),
  get: (id: string) => api.get(`/trips/${id}`),
  update: (id: string, data: unknown) => api.put(`/trips/${id}`, data),
  remove: (id: string) => api.delete(`/trips/${id}`),

  // Editable Itinerary Operations
  addActivity: (tripId: string, data: unknown) => api.post(`/trips/${tripId}/itinerary/activities`, data),
  updateActivity: (tripId: string, activityId: string, data: unknown) =>
    api.put(`/trips/${tripId}/itinerary/activities/${activityId}`, data),
  deleteActivity: (tripId: string, activityId: string) =>
    api.delete(`/trips/${tripId}/itinerary/activities/${activityId}`),
  moveActivity: (tripId: string, activityId: string, data: { targetDay: number; targetIndex?: number }) =>
    api.post(`/trips/${tripId}/itinerary/activities/${activityId}/move`, data),
  reorderActivities: (
    tripId: string,
    dayNumber: number,
    data: { activityId?: string; direction?: 'up' | 'down'; orderedActivityIds?: string[] }
  ) => api.post(`/trips/${tripId}/itinerary/days/${dayNumber}/reorder`, data),
  undoItineraryChange: (tripId: string) => api.post(`/trips/${tripId}/itinerary/undo`),
  updatePreferences: (tripId: string, data: unknown) => api.put(`/trips/${tripId}/preferences`, data),

  // Smart Packing Checklist Operations
  generatePackingList: (tripId: string) => api.post(`/trips/${tripId}/packing/generate`),
  addPackingItem: (tripId: string, data: { item: string; category?: string }) =>
    api.post(`/trips/${tripId}/packing`, data),
  updatePackingItem: (tripId: string, itemId: string, data: { packed?: boolean; item?: string; category?: string }) =>
    api.put(`/trips/${tripId}/packing/${itemId}`, data),
  deletePackingItem: (tripId: string, itemId: string) => api.delete(`/trips/${tripId}/packing/${itemId}`),

  // Travel Reminders & Alarm Notification Operations
  checkDueReminders: (tripId: string) => api.get(`/trips/${tripId}/reminders/check`),
  addReminder: (tripId: string, data: unknown) => api.post(`/trips/${tripId}/reminders`, data),
  updateReminder: (tripId: string, reminderId: string, data: unknown) =>
    api.put(`/trips/${tripId}/reminders/${reminderId}`, data),
  deleteReminder: (tripId: string, reminderId: string) => api.delete(`/trips/${tripId}/reminders/${reminderId}`),
  triggerReminderNotification: (tripId: string, reminderId: string, data?: { channel?: string }) =>
    api.post(`/trips/${tripId}/reminders/${reminderId}/trigger`, data ?? {}),
  dismissReminderAlarm: (tripId: string, reminderId: string) =>
    api.post(`/trips/${tripId}/reminders/${reminderId}/dismiss`),
  updateReminderSettings: (tripId: string, data: unknown) => api.put(`/trips/${tripId}/reminder-settings`, data),
  clearNotificationHistory: (tripId: string) => api.delete(`/trips/${tripId}/notification-history`),

  // Trip Notes & Journal Operations
  addNote: (tripId: string, data: unknown) => api.post(`/trips/${tripId}/notes`, data),
  updateNote: (tripId: string, noteId: string, data: unknown) => api.put(`/trips/${tripId}/notes/${noteId}`, data),
  deleteNote: (tripId: string, noteId: string) => api.delete(`/trips/${tripId}/notes/${noteId}`),
}

export const aiApi = {
  generate: (tripId: string) => api.post('/ai/generate-itinerary', { tripId }),
  suggestAlternatives: (data: { tripId: string; dayNumber: number; activityId: string; userReason?: string }) =>
    api.post('/ai/activity-alternatives', data),
  optimizeBudget: (tripId: string) => api.post('/ai/budget-optimization', { tripId }),
  generateLocalTips: (tripId: string) => api.post('/ai/local-tips', { tripId }),
}

export const expensesApi = {
  list: (tripId: string) => api.get(`/expenses/${tripId}`),
  create: (tripId: string, data: unknown) => api.post(`/expenses/${tripId}`, data),
  update: (id: string, data: unknown) => api.put(`/expenses/item/${id}`, data),
  remove: (id: string) => api.delete(`/expenses/item/${id}`),
}

export const tripDataApi = {
  weather: (tripId: string) => api.get(`/trip-data/${tripId}/weather`),
  route: (tripId: string) => api.get(`/trip-data/${tripId}/route`),
}

export const usersApi = {
  lookup: (email: string) => api.get('/users/lookup', { params: { email } }),
}
