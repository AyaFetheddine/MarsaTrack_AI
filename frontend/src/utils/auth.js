const decodeJwtPayload = (token) => {
  if (!token) return null

  try {
    const payload = token.split('.')[1]
    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decodedPayload = JSON.parse(atob(normalizedPayload))

    return decodedPayload
  } catch {
    return null
  }
}

export const getStoredUser = () => {
  const storedUser = localStorage.getItem('user')

  if (storedUser) {
    try {
      return JSON.parse(storedUser)
    } catch {
      localStorage.removeItem('user')
    }
  }

  const tokenPayload = decodeJwtPayload(localStorage.getItem('token'))

  if (!tokenPayload) return null

  return {
    id: tokenPayload.id,
    matricule: tokenPayload.matricule,
    role: tokenPayload.role,
  }
}

export const storeAuthSession = ({ token, user }) => {
  localStorage.setItem('token', token)

  if (user) {
    localStorage.setItem('user', JSON.stringify(user))
    localStorage.setItem('role', user.role || '')
    localStorage.setItem('matricule', user.matricule || '')
    localStorage.setItem('nom_complet', user.nom_complet || '')
  }
}

export const clearAuthSession = () => {
  localStorage.removeItem('token')
  localStorage.removeItem('user')
  localStorage.removeItem('role')
  localStorage.removeItem('matricule')
  localStorage.removeItem('nom_complet')
}

export const getStoredRole = () =>
  getStoredUser()?.role || localStorage.getItem('role') || ''

export const hasRole = (...roles) => roles.includes(getStoredRole())

export const roleLabels = {
  Admin: 'Admin',
  Responsable_Exploitation: 'Responsable Exploitation',
  Chef_Services: 'Chef Services',
  Chef_Escale: 'Chef Escale',
  Chef_Equipe: 'Chef Équipe',
  Portiqueur: 'Portiqueur',
  Equipage: 'Équipage',
}

export const formatRoleLabel = (role) => roleLabels[role] || role || ''
