import {
  Boxes,
  CircleCheck,
  ClipboardList,
  Download,
  HardHat,
  OctagonAlert,
  ScanSearch,
  Timer,
  Upload,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { dashboardApi, getApiErrorMessage } from '../api/api'
import FeedbackMessage from '../components/FeedbackMessage'
import Loader from '../components/Loader'
import StatCard from '../components/StatCard'
import useAutoClearMessage from '../hooks/useAutoClearMessage'

function Dashboard() {
  // Tous les indicateurs viennent de /api/dashboard/stats, accessible a tout
  // utilisateur authentifie. Ce sont des compteurs agreges, sans donnee
  // nominative ni detail d'enregistrement : chaque role voit donc les memes
  // chiffres. Les recalculer depuis les listes detaillees obligeait a masquer
  // certaines cases pour les roles sans acces a ces listes, ce qui affichait
  // des tirets sans raison.
  const [overview, setOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useAutoClearMessage(error, setError, '')

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const response = await dashboardApi.stats()
        setOverview(response.data.data || null)
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

  const compteur = (cle) => overview?.[cle] ?? 0

  const stats = [
    {
      title: 'Total opérations',
      value: compteur('operations_total'),
      icon: ClipboardList,
      accentClass: 'bg-[#e8f1fb] text-marsa-royal',
    },
    {
      title: 'Opérations en cours',
      value: compteur('operations_en_cours'),
      icon: Timer,
      accentClass: 'bg-[#e5f7fb] text-marsa-ciel',
    },
    {
      title: 'Opérations clôturées',
      value: compteur('operations_cloturees'),
      icon: CircleCheck,
      accentClass: 'bg-[#e7f7ef] text-[#148354]',
    },
    {
      title: 'Arrêts en cours',
      value: compteur('arrets_en_cours'),
      icon: OctagonAlert,
      accentClass: 'bg-[#fff1e8] text-[#c45a12]',
    },
    {
      title: 'Conteneurs saisis',
      value: compteur('conteneurs_total'),
      icon: Boxes,
      accentClass: 'bg-[#eef2f6] text-[#4a6582]',
    },
    {
      title: 'Conteneurs reconnus par l’IA',
      value: compteur('conteneurs_reconnus_ia'),
      icon: ScanSearch,
      accentClass: 'bg-[#ede9fe] text-[#5b3fbe]',
    },
    {
      title: 'Conteneurs import',
      value: compteur('conteneurs_import'),
      icon: Download,
      accentClass: 'bg-[#e8f4fd] text-[#0055b3]',
    },
    {
      title: 'Conteneurs export',
      value: compteur('conteneurs_export'),
      icon: Upload,
      accentClass: 'bg-[#fff6df] text-[#9c6500]',
    },
    {
      title: 'Personnel disponible',
      value: compteur('personnel_disponible'),
      icon: HardHat,
      accentClass: 'bg-[#e7f7ef] text-[#148354]',
    },
  ]

  return (
    <div className="space-y-6">
      <header>
        <h2 className="mb-1 text-2xl font-bold text-marsa-royal">
          Tableau de bord
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
