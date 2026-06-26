import { ClipboardCheck, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  getApiErrorMessage,
  operationsApi,
  usersApi,
} from '../api/api'
import FeedbackMessage from '../components/FeedbackMessage'
import Loader from '../components/Loader'
import StatusBadge from '../components/StatusBadge'
import { getStoredRole } from '../utils/auth'

const initialForm = {
  nom_operation: '',
  date_operation: '',
  shift: 'Shift 1',
  vacation: 'Vacation 1',
  equipe: [],
}

const formatDate = (value) => {
  if (!value) return '-'

  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

function Operations() {
  const role = getStoredRole()
  const canCreateOperation = ['Responsable_Exploitation', 'Chef_Equipe'].includes(
    role,
  )
  const canCloseOperation = role === 'Chef_Services'
  const [operations, setOperations] = useState([])
  const [personnel, setPersonnel] = useState([])
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [closingId, setClosingId] = useState(null)
  const [pageError, setPageError] = useState('')
  const [feedback, setFeedback] = useState(null)

  const refreshOperations = async () => {
    const response = await operationsApi.list()
    setOperations(response.data.data || [])
  }

  useEffect(() => {
    const loadPage = async () => {
      try {
        const [operationsResponse, personnelResponse] = await Promise.all([
          operationsApi.list(),
          usersApi.personnel(),
        ])

        setOperations(operationsResponse.data.data || [])
        setPersonnel(personnelResponse.data.data || [])
      } catch (requestError) {
        setPageError(
          getApiErrorMessage(
            requestError,
            'Impossible de charger les donnees des operations.',
          ),
        )
      } finally {
        setLoading(false)
      }
    }

    loadPage()
  }, [])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const toggleMember = (userId) => {
    setForm((current) => ({
      ...current,
      equipe: current.equipe.includes(userId)
        ? current.equipe.filter((id) => id !== userId)
        : [...current.equipe, userId],
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setFeedback(null)

    try {
      await operationsApi.create(form)
      setForm(initialForm)
      await refreshOperations()
      setFeedback({
        type: 'success',
        message: 'Operation creee et equipe affectee avec succes.',
      })
    } catch (requestError) {
      setFeedback({
        type: 'error',
        message: getApiErrorMessage(
          requestError,
          'Impossible de creer l\'operation.',
        ),
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = async (id) => {
    setClosingId(id)
    setFeedback(null)

    try {
      await operationsApi.close(id)
      await refreshOperations()
      setFeedback({
        type: 'success',
        message: 'Operation cloturee avec succes.',
      })
    } catch (requestError) {
      setFeedback({
        type: 'error',
        message: getApiErrorMessage(
          requestError,
          'Impossible de cloturer l\'operation.',
        ),
      })
    } finally {
      setClosingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="mb-1 text-2xl font-bold text-marsa-royal">Operations</h2>
        <p className="text-sm text-marsa-muted">
          Creation, affectation des equipes et suivi des operations portuaires.
        </p>
      </header>

      {pageError && <FeedbackMessage>{pageError}</FeedbackMessage>}
      {feedback && (
        <FeedbackMessage type={feedback.type}>{feedback.message}</FeedbackMessage>
      )}

      {canCreateOperation ? (
        <section className="page-card">
        <div className="mb-5">
          <h3 className="font-bold text-marsa-royal">Nouvelle operation</h3>
          <p className="mt-1 text-sm text-marsa-muted">
            Renseignez la vacation et selectionnez le personnel terrain.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="md:col-span-2 xl:col-span-1">
              <label className="form-label" htmlFor="nom_operation">
                Nom de l'operation
              </label>
              <input
                id="nom_operation"
                name="nom_operation"
                value={form.nom_operation}
                onChange={handleChange}
                className="form-control"
                placeholder="Ex. Dechargement - Quai 5"
                required
              />
            </div>

            <div>
              <label className="form-label" htmlFor="date_operation">
                Date
              </label>
              <input
                id="date_operation"
                name="date_operation"
                type="date"
                value={form.date_operation}
                onChange={handleChange}
                className="form-control"
                required
              />
            </div>

            <div>
              <label className="form-label" htmlFor="shift">
                Shift
              </label>
              <select
                id="shift"
                name="shift"
                value={form.shift}
                onChange={handleChange}
                className="form-control"
              >
                <option>Shift 1</option>
                <option>Shift 2</option>
                <option>Shift 3</option>
              </select>
            </div>

            <div>
              <label className="form-label" htmlFor="vacation">
                Vacation
              </label>
              <select
                id="vacation"
                name="vacation"
                value={form.vacation}
                onChange={handleChange}
                className="form-control"
              >
                <option>Vacation 1</option>
                <option>Vacation 2</option>
              </select>
            </div>
          </div>

          <fieldset>
            <legend className="form-label">Equipe affectee</legend>
            {personnel.length === 0 ? (
              <div className="rounded-md border border-dashed border-[#c0d5e8] bg-[#f5f9fd] p-4 text-sm text-marsa-muted">
                Aucun personnel affectable n'est disponible.
              </div>
            ) : (
              <div className="grid max-h-52 gap-2 overflow-y-auto rounded-md border border-marsa-border bg-[#f8fbff] p-3 sm:grid-cols-2 xl:grid-cols-3">
                {personnel.map((member) => (
                  <label
                    key={member.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md border border-transparent bg-white px-3 py-2.5 text-sm transition hover:border-[#c8d8e8]"
                  >
                    <input
                      type="checkbox"
                      checked={form.equipe.includes(member.id)}
                      onChange={() => toggleMember(member.id)}
                      className="h-4 w-4 accent-marsa-royal"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-marsa-text">
                        {member.nom_complet}
                      </span>
                      <span className="text-xs text-marsa-muted">
                        {member.matricule} - {member.role}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting ? (
              <LoaderCircle size={18} className="animate-spin" />
            ) : (
              <ClipboardCheck size={18} />
            )}
            {submitting ? 'Creation...' : 'Creer l\'operation'}
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
          <h3 className="font-bold text-marsa-royal">Liste des operations</h3>
          <p className="mt-1 text-sm text-marsa-muted">
            {loading ? 'Chargement en cours' : `${operations.length} operation(s)`}
          </p>
        </div>

        {loading ? (
          <Loader label="Chargement des operations..." />
        ) : operations.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-marsa-muted">
            Aucune operation enregistree.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[900px]">
              <thead>
                <tr>
                  <th>Nom operation</th>
                  <th>Date</th>
                  <th>Shift</th>
                  <th>Vacation</th>
                  <th>Statut</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {operations.map((operation) => (
                  <tr key={operation.id}>
                    <td className="font-semibold text-marsa-text">
                      {operation.nom_operation}
                    </td>
                    <td>{formatDate(operation.date_operation)}</td>
                    <td>{operation.shift}</td>
                    <td>{operation.vacation}</td>
                    <td>
                      <StatusBadge value={operation.statut} />
                    </td>
                    <td>
                      {operation.statut === 'en cours' && canCloseOperation ? (
                        <button
                          type="button"
                          onClick={() => handleClose(operation.id)}
                          disabled={closingId === operation.id}
                          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#c8d8e8] px-3 text-xs font-bold text-marsa-royal transition hover:border-marsa-royal hover:bg-marsa-royal hover:text-white disabled:opacity-60"
                        >
                          {closingId === operation.id && (
                            <LoaderCircle size={15} className="animate-spin" />
                          )}
                          {closingId === operation.id ? 'Cloture...' : 'Cloturer'}
                        </button>
                      ) : operation.statut === 'en cours' ? (
                        <span className="text-xs text-marsa-muted">
                          Consultation
                        </span>
                      ) : (
                        <span className="text-xs text-marsa-muted">Terminee</span>
                      )}
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

export default Operations
