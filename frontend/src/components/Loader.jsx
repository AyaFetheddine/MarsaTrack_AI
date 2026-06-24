import { LoaderCircle } from 'lucide-react'

function Loader({ label = 'Chargement...' }) {
  return (
    <div className="flex min-h-36 items-center justify-center gap-2.5 text-sm text-marsa-muted">
      <LoaderCircle size={20} className="animate-spin text-marsa-ciel" />
      <span>{label}</span>
    </div>
  )
}

export default Loader
