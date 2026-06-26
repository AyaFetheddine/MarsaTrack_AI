import { Navigate, Outlet } from 'react-router-dom'
import { getStoredRole } from '../utils/auth'

function RoleRoute({ allowedRoles }) {
  const role = getStoredRole()

  return allowedRoles.includes(role) ? (
    <Outlet />
  ) : (
    <Navigate to="/dashboard" replace />
  )
}

export default RoleRoute
