import { LogOut, Menu } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { clearAuthSession, formatRoleLabel, getStoredUser } from '../utils/auth'

const pageTitles = {
  '/dashboard': 'Dashboard',
  '/operations': 'Operations',
  '/arrets': 'Arrets de travail',
  '/containers': 'Conteneurs',
  '/personnel': 'Personnel',
}

function Navbar({ onMenuOpen }) {
  const location = useLocation()
  const navigate = useNavigate()
  const user = getStoredUser()

  const handleLogout = () => {
    clearAuthSession()
    navigate('/login', { replace: true })
  }

  return (
    <header className="sticky top-0 z-20 flex h-[60px] items-center justify-between border-b border-[#e2eaf3] bg-white px-4 shadow-[0_1px_4px_rgba(0,56,130,0.06)] sm:px-7">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-marsa-royal hover:bg-marsa-bg lg:hidden"
          aria-label="Ouvrir la navigation"
          onClick={onMenuOpen}
        >
          <Menu size={21} />
        </button>
        <h1 className="truncate text-[15px] font-bold text-marsa-royal">
          {pageTitles[location.pathname] || 'MarsaTrack AI'}
        </h1>
      </div>

      <div className="flex min-w-0 items-center gap-3">
        {user && (
          <div className="hidden min-w-0 text-right md:block">
            <p className="truncate text-sm font-bold text-marsa-royal">
              {user.nom_complet || user.matricule}
            </p>
            <div className="mt-0.5 flex items-center justify-end gap-2">
              <span className="text-xs text-marsa-muted">{user.matricule}</span>
              <span className="rounded-full bg-[#e8f4fb] px-2 py-0.5 text-[11px] font-bold text-marsa-royal">
                {formatRoleLabel(user.role)}
              </span>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleLogout}
          className="flex h-9 items-center gap-2 rounded-md border border-[#c8d8e8] px-3 text-sm font-semibold text-marsa-royal transition hover:border-marsa-royal hover:bg-marsa-royal hover:text-white sm:px-4"
        >
          <LogOut size={17} aria-hidden="true" />
          <span className="hidden sm:inline">Deconnexion</span>
        </button>
      </div>
    </header>
  )
}

export default Navbar
