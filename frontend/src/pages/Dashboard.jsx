import { Boxes, ClipboardList, HardHat, OctagonAlert } from 'lucide-react'
import StatCard from '../components/StatCard'

const stats = [
  {
    title: 'Operations actives',
    value: '08',
    icon: ClipboardList,
    accentClass: 'bg-[#e8f1fb] text-marsa-royal',
  },
  {
    title: 'Arrets en cours',
    value: '02',
    icon: OctagonAlert,
    accentClass: 'bg-[#fff1e8] text-[#c45a12]',
  },
  {
    title: 'Conteneurs saisis',
    value: '146',
    icon: Boxes,
    accentClass: 'bg-[#e5f7fb] text-marsa-ciel',
  },
  {
    title: 'Personnel disponible',
    value: '24',
    icon: HardHat,
    accentClass: 'bg-[#e7f7ef] text-[#148354]',
  },
]

function Dashboard() {
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

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.title} {...stat} />
        ))}
      </section>

      <section className="page-card min-h-64">
        <h3 className="text-base font-bold text-marsa-royal">
          Activite recente
        </h3>
        <p className="mt-1 text-sm text-marsa-muted">
          Les donnees operationnelles seront affichees ici.
        </p>
      </section>
    </div>
  )
}

export default Dashboard
