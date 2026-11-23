import axios from 'axios'

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:5000/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
})
api.interceptors.request.use((config) => { const token = localStorage.getItem('travelai_token'); if (token) config.headers.Authorization = `Bearer ${token}`; return config })

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
}
export const aiApi = { generate: (tripId: string) => api.post('/ai/generate-itinerary', { tripId }) }
export const expensesApi = { list: (tripId: string) => api.get(`/expenses/${tripId}`), create: (tripId: string, data: unknown) => api.post(`/expenses/${tripId}`, data), update: (id: string, data: unknown) => api.put(`/expenses/item/${id}`, data), remove: (id: string) => api.delete(`/expenses/item/${id}`) }
export const tripDataApi = { weather: (tripId: string) => api.get(`/trip-data/${tripId}/weather`), route: (tripId: string) => api.get(`/trip-data/${tripId}/route`) }
export const usersApi = { lookup: (email: string) => api.get('/users/lookup', { params: { email } }) }
