import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardLayout from './layouts/DashboardLayout'
import Arrets from './pages/Arrets'
import Containers from './pages/Containers'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'
import Operations from './pages/Operations'
import Personnel from './pages/Personnel'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<DashboardLayout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/operations" element={<Operations />} />
          <Route path="/arrets" element={<Arrets />} />
          <Route path="/containers" element={<Containers />} />
          <Route path="/personnel" element={<Personnel />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}

export default App
