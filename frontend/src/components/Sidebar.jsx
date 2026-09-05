import {
  BookOpen,
  Bot,
  Boxes,
  ClipboardList,
  Gauge,
  HardHat,
  OctagonAlert,
  Settings,
  X,
} from 'lucide-react'
import { NavLink } from 'react-router-dom'
import logo from '../assets/Marsamaroc-logo.png'
import { getStoredRole } from '../utils/auth'

// MarsaPort AI regroupe deux modules. Le libelle de chaque module est affiche
// au-dessus de ses entrees, pour que le portail se lise comme un seul produit.
const navigation = [
  { to: '/dashboard', label: 'Tableau de bord', icon: Gauge, module: 'MarsaTrack AI' },
  { to: '/operations', label: 'Opérations', icon: ClipboardList, module: 'MarsaTrack AI' },
  { to: '/arrets', label: 'Arrêts de travail', icon: OctagonAlert, module: 'MarsaTrack AI' },
  { to: '/containers', label: 'Conteneurs', icon: Boxes, module: 'MarsaTrack AI' },
  { to: '/personnel', label: 'Personnel', icon: HardHat, module: 'MarsaTrack AI' },
  // `end` : sans cela, "Mes Bots" resterait surligne sur ses sous-pages.
  { to: '/bots', label: 'Mes Bots', icon: Bot, module: 'MarsaBot Factory', end: true },
  {
    to: '/bots/connaissances',
    label: 'Base de Connaissances',
    icon: BookOpen,
    module: 'MarsaBot Factory',
  },
  {
    to: '/bots/parametres',
    label: 'Paramètres',
    icon: Settings,
    module: 'MarsaBot Factory',
  },
]

const navigationByRole = {
  Admin: [
    '/dashboard',
    '/operations',
    '/arrets',
    '/containers',
    '/personnel',
    '/bots',
    '/bots/connaissances',
    '/bots/parametres',
  ],
  Chef_Equipe: ['/dashboard', '/operations', '/arrets', '/personnel'],
  Chef_Services: [
    '/dashboard',
    '/operations',
    '/arrets',
    '/containers',
    '/personnel',
  ],
  Portiqueur: ['/dashboard', '/containers', '/operations'],
  Responsable_Exploitation: [
    '/dashboard',
    '/operations',
    '/arrets',
    '/containers',
    '/personnel',
  ],
}

function Sidebar({ open, onClose }) {
  const role = getStoredRole()
  const allowedPaths = navigationByRole[role] || ['/dashboard']
  const visibleNavigation = navigation.filter((item) =>
    allowedPaths.includes(item.to),
  )

  return (
    <>
      {open && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-[#001d43]/45 lg:hidden"
          aria-label="Fermer le menu"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col bg-marsa-royal px-3 pb-6 pt-7 transition-transform duration-200 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <button
          type="button"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white lg:hidden"
          aria-label="Fermer la navigation"
          onClick={onClose}
        >
          <X size={20} />
        </button>

        <div className="px-3">
          <img
            src={logo}
            alt="Marsa Maroc"
            className="h-auto w-40 brightness-0 invert"
          />
          <p className="mb-7 mt-2 text-xs font-bold uppercase text-white/55">
            MarsaPort AI
          </p>
        </div>

        <nav className="flex flex-col gap-1" aria-label="Navigation principale">
          {visibleNavigation.map(({ to, label, icon: Icon, module, end }, index) => (
            <div key={to}>
              {module !== visibleNavigation[index - 1]?.module && (
                <p className="mb-1.5 mt-4 px-3.5 text-[11px] font-bold uppercase tracking-wider text-white/40 first:mt-0">
                  {module}
                </p>
              )}
              <NavLink
                to={to}
                end={end}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex min-h-11 items-center gap-3 rounded-lg px-3.5 text-sm font-medium transition ${
                    isActive
                      ? 'bg-marsa-ciel font-bold text-white'
                      : 'text-white/80 hover:bg-marsa-ciel/25 hover:text-white'
                  }`
                }
              >
                <Icon size={19} strokeWidth={2} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            </div>
          ))}
        </nav>

        <div className="mt-auto border-t border-white/15 px-3 pt-5">
          <p className="text-xs leading-5 text-white/50">
            Gestion opérationnelle
            <br />
            Marsa Maroc
          </p>
        </div>
      </aside>
    </>
  )
}

export default Sidebar
