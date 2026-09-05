import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import RoleRoute from './components/RoleRoute'
import DashboardLayout from './layouts/DashboardLayout'
import Arrets from './pages/Arrets'
import { BaseConnaissances, MesBots, ParametresBots } from './pages/Assistants'
import Containers from './pages/Containers'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Operations from './pages/Operations'
import Personnel from './pages/Personnel'

function App() {
  const allBusinessRoles = [
    'Admin',
    'Chef_Equipe',
    'Chef_Services',
    'Portiqueur',
    'Responsable_Exploitation',
  ]
  const arretsRoles = [
    'Admin',
    'Chef_Equipe',
    'Chef_Services',
    'Responsable_Exploitation',
  ]
  const containersRoles = [
    'Admin',
    'Chef_Services',
    'Portiqueur',
    'Responsable_Exploitation',
  ]
  const personnelRoles = [
    'Admin',
    'Chef_Equipe',
    'Chef_Services',
    'Responsable_Exploitation',
  ]
  // La console d'assistants est un outil d'administration : elle reste
  // reservee a l'Admin, comme la gestion des bots cote MarsaBot Factory.
  const assistantsRoles = ['Admin']

  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route element={<RoleRoute allowedRoles={allBusinessRoles} />}>
            <Route path="/operations" element={<Operations />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={arretsRoles} />}>
            <Route path="/arrets" element={<Arrets />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={containersRoles} />}>
            <Route path="/containers" element={<Containers />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={personnelRoles} />}>
            <Route path="/personnel" element={<Personnel />} />
          </Route>
          <Route element={<RoleRoute allowedRoles={assistantsRoles} />}>
            <Route path="/bots" element={<MesBots />} />
            <Route path="/bots/connaissances" element={<BaseConnaissances />} />
            <Route path="/bots/parametres" element={<ParametresBots />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
