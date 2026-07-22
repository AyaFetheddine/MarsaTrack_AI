import {
  Boxes,
  CircleCheck,
  ClipboardList,
  Download,
  HardHat,
  OctagonAlert,
  Timer,
  Upload,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  containersApi,
  dashboardApi,
  getApiErrorMessage,
  operationsApi,
} from '../api/api'
import FeedbackMessage from '../components/FeedbackMessage'
import Loader from '../components/Loader'
import StatCard from '../components/StatCard'
import useAutoClearMessage from '../hooks/useAutoClearMessage'
import { getStoredRole } from '../utils/auth'

function Dashboard() {
  const role = getStoredRole()
  // Les conteneurs restent limites aux roles qui ont acces a la page dediee.
  // Les compteurs « Arrets en cours » et « Personnel disponible » proviennent
  // desormais d'un endpoint agrege (/api/dashboard/stats) accessible a tous
  // les roles : on affiche le nombre reel sans exposer les listes detaillees.
  const canViewContainers = [
    'Admin',
    'Responsable_Exploitation',
    'Chef_Services',
    'Portiqueur',
  ].includes(role)

  const [operations, setOperations] = useState([])
  const [containers, setContainers] = useState([])
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useAutoClearMessage(error, setError, '')

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const [operationsResponse, containersResponse, statsResponse] =
          await Promise.all([
            operationsApi.list(),
            canViewContainers ? containersApi.list() : Promise.resolve(null),
            dashboardApi.stats(),
          ])

        setOperations(operationsResponse.data.data || [])
        setContainers(containersResponse?.data.data || [])
        setOverview(statsResponse.data.data || null)
      } catch (requestError) {
        setError(
          getApiErrorMessage(
            requestError,
            'Impossible de charger les indicateurs du dashboard.',
          ),
        )
      } finally {
        setLoading(false)
      }
    }

    loadDashboard()
  }, [canViewContainers])

  const activeOperations = operations.filter(
    (operation) => operation.statut === 'en cours',
  ).length
  const closedOperations = operations.filter(
    (operation) => operation.statut === 'cloturee',
  ).length
  const importContainers = canViewContainers
    ? containers.filter(
        (container) => (container.mouvement || 'IMPORT') === 'IMPORT',
      ).length
    : '-'
  const exportContainers = canViewContainers
    ? containers.filter((container) => container.mouvement === 'EXPORT').length
    : '-'

  const stats = [
    {
      title: 'Total opérations',
      value: operations.length,
      icon: ClipboardList,
      accentClass: 'bg-[#e8f1fb] text-marsa-royal',
    },
    {
      title: 'Opérations en cours',
      value: activeOperations,
      icon: Timer,
      accentClass: 'bg-[#e5f7fb] text-marsa-ciel',
    },
    {
      title: 'Opérations clôturées',
      value: closedOperations,
      icon: CircleCheck,
      accentClass: 'bg-[#e7f7ef] text-[#148354]',
    },
    {
      title: 'Arrêts en cours',
      value: overview?.arrets_en_cours ?? '-',
      icon: OctagonAlert,
      accentClass: 'bg-[#fff1e8] text-[#c45a12]',
    },
    {
      title: 'Conteneurs saisis',
      value: canViewContainers ? containers.length : '-',
      icon: Boxes,
      accentClass: 'bg-[#eef2f6] text-[#4a6582]',
    },
    {
      title: 'Conteneurs import',
      value: importContainers,
      icon: Download,
      accentClass: 'bg-[#e8f4fd] text-[#0055b3]',
    },
    {
      title: 'Conteneurs export',
      value: exportContainers,
      icon: Upload,
      accentClass: 'bg-[#fff6df] text-[#9c6500]',
    },
    {
      title: 'Personnel disponible',
      value: overview?.personnel_disponible ?? '-',
      icon: HardHat,
      accentClass: 'bg-[#e7f7ef] text-[#148354]',
    },
  ]

  return (
    <div className="space-y-6">
      <header>
        <h2 className="mb-1 text-2xl font-bold text-marsa-royal">
          Vue d'ensemble
        </h2>
        <p className="text-sm text-marsa-muted">
          Suivi synthétique de l'activité opérationnelle du terminal.
        </p>
      </header>

      {error && <FeedbackMessage>{error}</FeedbackMessage>}

      {loading ? (
        <section className="page-card">
          <Loader label="Chargement des indicateurs..." />
        </section>
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {stats.map((stat) => (
            <StatCard key={stat.title} {...stat} />
          ))}
        </section>
      )}
    </div>
  )
}

export default Dashboard
