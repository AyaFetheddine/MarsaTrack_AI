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

  if (config.data instanceof FormData) {
    if (typeof config.headers.delete === 'function') {
      config.headers.delete('Content-Type')
    } else {
      delete config.headers['Content-Type']
    }
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
  cancel: (id) => api.put(`/operations/${id}/annuler`),
  remove: (id) => api.delete(`/operations/${id}`),
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
  remove: (id) => api.delete(`/containers/${id}`),
}

export const visionApi = {
  detectContainer: (formData) => api.post('/vision/detect-container', formData),
}

export const dashboardApi = {
  stats: () => api.get('/dashboard/stats'),
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
