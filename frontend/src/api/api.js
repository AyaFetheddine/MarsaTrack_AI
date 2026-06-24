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
  create: (payload) => api.post('/arrets', payload),
  close: (id) => api.put(`/arrets/${id}/cloturer`),
}

export const containersApi = {
  create: (payload) => api.post('/containers', payload),
}

export const usersApi = {
  personnel: () => api.get('/users/personnel'),
}

export const getApiErrorMessage = (
  error,
  fallback = 'Une erreur est survenue. Veuillez reessayer.',
) => error.response?.data?.message || fallback

export default api
