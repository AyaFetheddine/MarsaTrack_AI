import axios from 'axios'

const api = axios.create({
  baseURL: 'http://localhost:3001/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')

  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }

  return config
})

export const authApi = {
  login: (credentials) => api.post('/auth/login', credentials),
}

export const operationsApi = {
  list: () => api.get('/operations'),
  create: (payload) => api.post('/operations', payload),
  close: (id) => api.put(`/operations/${id}/cloturer`),
}

export const arretsApi = {
  list: () => api.get('/arrets'),
  create: (payload) => api.post('/arrets', payload),
  close: (id) => api.put(`/arrets/${id}/cloturer`),
  remove: (id) => api.delete(`/arrets/${id}`),
}

export const containersApi = {
  list: () => api.get('/containers'),
  create: (payload) => api.post('/containers', payload),
}

export const usersApi = {
  personnel: () => api.get('/users/personnel'),
}

export const personnelApi = {
  list: (params = {}) => api.get('/personnel', { params }),
  create: (payload) => api.post('/personnel', payload),
  update: (id, payload) => api.put(`/personnel/${id}`, payload),
  disable: (id) => api.patch(`/personnel/${id}/desactiver`),
  remove: (id) => api.delete(`/personnel/${id}`),
}

export const getApiErrorMessage = (
  error,
  fallback = 'Une erreur est survenue. Veuillez reessayer.',
) => error.response?.data?.message || fallback

export default api
