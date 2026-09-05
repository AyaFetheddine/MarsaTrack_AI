import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Sidebar from '../components/Sidebar'

function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { pathname } = useLocation()

  // Le module d'assistants apporte sa propre mise en page interieure : lui
  // ajouter la marge du portail creerait une page dans la page.
  const sansMarge = pathname.startsWith('/bots')

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="min-h-screen lg:pl-60">
        <Navbar onMenuOpen={() => setSidebarOpen(true)} />
        <main className={sansMarge ? '' : 'p-4 sm:p-6 lg:p-7'}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default DashboardLayout
