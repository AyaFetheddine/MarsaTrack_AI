import {
  Boxes,
  CircleCheck,
  ClipboardList,
  HardHat,
  OctagonAlert,
  Timer,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  arretsApi,
  containersApi,
  getApiErrorMessage,
  operationsApi,
  usersApi,
} from '../api/api'
import FeedbackMessage from '../components/FeedbackMessage'
import Loader from '../components/Loader'
import StatCard from '../components/StatCard'

function Dashboard() {
  const [operations, setOperations] = useState([])
  const [arrets, setArrets] = useState([])
  const [containers, setContainers] = useState([])
  const [personnelCount, setPersonnelCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const [
          operationsResponse,
          arretsResponse,
          containersResponse,
          personnelResponse,
        ] = await Promise.all([
          operationsApi.list(),
          arretsApi.list(),
          containersApi.list(),
          usersApi.personnel(),
        ])

        setOperations(operationsResponse.data.data || [])
        setArrets(arretsResponse.data.data || [])
        setContainers(containersResponse.data.data || [])
        setPersonnelCount((personnelResponse.data.data || []).length)
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
  }, [])

  const activeOperations = operations.filter(
    (operation) => operation.statut === 'en cours',
  ).length
  const closedOperations = operations.filter(
    (operation) => operation.statut === 'cloturee',
  ).length
  const activeArrets = arrets.filter(
    (arret) => arret.statut === 'en cours',
  ).length

  const stats = [
    {
      title: 'Total operations',
      value: operations.length,
      icon: ClipboardList,
      accentClass: 'bg-[#e8f1fb] text-marsa-royal',
    },
    {
      title: 'Operations en cours',
      value: activeOperations,
      icon: Timer,
      accentClass: 'bg-[#e5f7fb] text-marsa-ciel',
    },
    {
      title: 'Operations cloturees',
      value: closedOperations,
      icon: CircleCheck,
      accentClass: 'bg-[#e7f7ef] text-[#148354]',
    },
    {
      title: 'Arrets en cours',
      value: activeArrets,
      icon: OctagonAlert,
      accentClass: 'bg-[#fff1e8] text-[#c45a12]',
    },
    {
      title: 'Conteneurs saisis',
      value: containers.length,
      icon: Boxes,
      accentClass: 'bg-[#eef2f6] text-[#4a6582]',
    },
    {
      title: 'Personnel disponible',
      value: personnelCount,
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
          Suivi synthetique de l'activite operationnelle du terminal.
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

      <section className="page-card min-h-44">
        <h3 className="text-base font-bold text-marsa-royal">
          Synchronisation metier
        </h3>
        <p className="mt-1 text-sm text-marsa-muted">
          Tous les indicateurs affiches sont maintenant calcules depuis les
          donnees du backend MarsaTrack AI.
        </p>
      </section>
    </div>
  )
}

export default Dashboard
