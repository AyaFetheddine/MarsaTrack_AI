import { LoaderCircle, UserPlus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getApiErrorMessage, personnelApi } from '../api/api'
import FeedbackMessage from '../components/FeedbackMessage'
import Loader from '../components/Loader'
import StatusBadge from '../components/StatusBadge'
import { getStoredRole } from '../utils/auth'

const fonctions = [
  'Portiqueur',
  'Equipage',
  'Conducteur',
  'Pointeur',
  'Agent_Terrain',
  'Sous_Traitant',
  'Autre',
]

const disponibilites = ['disponible', 'affecte', 'indisponible']

const initialForm = {
  matricule: '',
  nom_complet: '',
  fonction: 'Equipage',
  disponibilite: 'disponible',
}

function Personnel() {
  const role = getStoredRole()
  const canCreatePersonnel = ['Admin', 'Responsable_Exploitation'].includes(role)
  const [personnel, setPersonnel] = useState([])
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState(null)

  const refreshPersonnel = async () => {
    const response = await personnelApi.list()
    setPersonnel(response.data.data || [])
  }

  useEffect(() => {
    const loadPersonnel = async () => {
      try {
        await refreshPersonnel()
      } catch (requestError) {
        setError(
          getApiErrorMessage(
            requestError,
            'Impossible de charger la liste du personnel.',
          ),
        )
      } finally {
        setLoading(false)
      }
    }

    loadPersonnel()
  }, [])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setFeedback(null)

    try {
      await personnelApi.create(form)
      setForm(initialForm)
      await refreshPersonnel()
      setFeedback({
        type: 'success',
        message: 'Personnel ajoute avec succes.',
      })
    } catch (requestError) {
      setFeedback({
        type: 'error',
        message: getApiErrorMessage(
          requestError,
          'Impossible d\'ajouter ce personnel.',
        ),
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="mb-1 text-2xl font-bold text-marsa-royal">Personnel</h2>
        <p className="text-sm text-marsa-muted">
          Gestion du personnel operationnel affectable aux operations.
        </p>
      </header>

      {error && <FeedbackMessage>{error}</FeedbackMessage>}
      {feedback && (
        <FeedbackMessage type={feedback.type}>{feedback.message}</FeedbackMessage>
      )}

      {canCreatePersonnel ? (
        <section className="page-card">
          <div className="mb-5">
            <h3 className="font-bold text-marsa-royal">Ajouter du personnel</h3>
            <p className="mt-1 text-sm text-marsa-muted">
              Creez une ressource terrain affectable sans compte de connexion.
            </p>
          </div>

          <form
            className="grid items-end gap-4 lg:grid-cols-[minmax(150px,0.7fr)_minmax(220px,1fr)_minmax(160px,0.7fr)_minmax(160px,0.7fr)_auto]"
            onSubmit={handleSubmit}
          >
            <div>
              <label className="form-label" htmlFor="matricule">
                Matricule
              </label>
              <input
                id="matricule"
                name="matricule"
                value={form.matricule}
                onChange={handleChange}
                className="form-control"
                placeholder="Ex. EQP-003"
                required
              />
            </div>

            <div>
              <label className="form-label" htmlFor="nom_complet">
                Nom complet
              </label>
              <input
                id="nom_complet"
                name="nom_complet"
                value={form.nom_complet}
                onChange={handleChange}
                className="form-control"
                placeholder="Nom du personnel"
                required
              />
            </div>

            <div>
              <label className="form-label" htmlFor="fonction">
                Fonction
              </label>
              <select
                id="fonction"
                name="fonction"
                value={form.fonction}
                onChange={handleChange}
                className="form-control"
              >
                {fonctions.map((fonction) => (
                  <option key={fonction} value={fonction}>
                    {fonction}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label" htmlFor="disponibilite">
                Disponibilite
              </label>
              <select
                id="disponibilite"
                name="disponibilite"
                value={form.disponibilite}
                onChange={handleChange}
                className="form-control"
              >
                {disponibilites.map((disponibilite) => (
                  <option key={disponibilite} value={disponibilite}>
                    {disponibilite}
                  </option>
                ))}
              </select>
            </div>

            <button type="submit" className="primary-button" disabled={submitting}>
              {submitting ? (
                <LoaderCircle size={18} className="animate-spin" />
              ) : (
                <UserPlus size={18} />
              )}
              {submitting ? 'Ajout...' : 'Ajouter'}
            </button>
          </form>
        </section>
      ) : (
        <section className="page-card border-dashed">
          <h3 className="font-bold text-marsa-royal">Consultation uniquement</h3>
          <p className="mt-1 text-sm text-marsa-muted">
            Votre role permet la consultation, mais pas cette action.
          </p>
        </section>
      )}

      <section className="page-card overflow-hidden p-0 sm:p-0">
        <div className="border-b border-marsa-border px-5 py-4 sm:px-6">
          <h3 className="font-bold text-marsa-royal">Personnel affectable</h3>
          <p className="mt-1 text-sm text-marsa-muted">
            {loading ? 'Chargement en cours' : `${personnel.length} membre(s)`}
          </p>
        </div>

        {loading ? (
          <Loader label="Chargement du personnel..." />
        ) : personnel.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-marsa-muted">
            Aucun personnel disponible pour l'instant.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[760px]">
              <thead>
                <tr>
                  <th>Matricule</th>
                  <th>Nom complet</th>
                  <th>Fonction</th>
                  <th>Disponibilite</th>
                </tr>
              </thead>
              <tbody>
                {personnel.map((member) => (
                  <tr key={member.id}>
                    <td className="font-semibold text-marsa-text">
                      {member.matricule}
                    </td>
                    <td>{member.nom_complet}</td>
                    <td>
                      <StatusBadge value={member.fonction} />
                    </td>
                    <td>
                      <StatusBadge value={member.disponibilite} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

export default Personnel
