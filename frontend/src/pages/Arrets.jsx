import { LoaderCircle, OctagonAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  arretsApi,
  getApiErrorMessage,
  operationsApi,
} from '../api/api'
import FeedbackMessage from '../components/FeedbackMessage'
import Loader from '../components/Loader'
import StatusBadge from '../components/StatusBadge'

const initialForm = {
  operation_id: '',
  cause: 'panne grue',
}

const formatDateTime = (value) => {
  if (!value) return '-'

  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function Arrets() {
  const [operations, setOperations] = useState([])
  const [arrets, setArrets] = useState([])
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [closingId, setClosingId] = useState(null)
  const [feedback, setFeedback] = useState(null)

  const refreshArrets = async () => {
    const response = await arretsApi.list()
    setArrets(response.data.data || [])
  }

  useEffect(() => {
    const loadPage = async () => {
      try {
        const [operationsResponse, arretsResponse] = await Promise.all([
          operationsApi.list(),
          arretsApi.list(),
        ])

        setOperations(
          (operationsResponse.data.data || []).filter(
            (operation) => operation.statut === 'en cours',
          ),
        )
        setArrets(arretsResponse.data.data || [])
      } catch (requestError) {
        setFeedback({
          type: 'error',
          message: getApiErrorMessage(
            requestError,
            'Impossible de charger les arrets de travail.',
          ),
        })
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

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setFeedback(null)

    try {
      await arretsApi.create({
        operation_id: Number(form.operation_id),
        cause: form.cause,
      })
      setForm(initialForm)
      await refreshArrets()
      setFeedback({
        type: 'success',
        message: 'Arret de travail declare avec succes.',
      })
    } catch (requestError) {
      setFeedback({
        type: 'error',
        message: getApiErrorMessage(
          requestError,
          'Impossible de declarer l\'arret de travail.',
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
      await arretsApi.close(id)
      await refreshArrets()
      setFeedback({
        type: 'success',
        message: 'Arret de travail cloture avec succes.',
      })
    } catch (requestError) {
      setFeedback({
        type: 'error',
        message: getApiErrorMessage(
          requestError,
          'Impossible de cloturer l\'arret de travail.',
        ),
      })
    } finally {
      setClosingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="mb-1 text-2xl font-bold text-marsa-royal">
          Arrets de travail
        </h2>
        <p className="text-sm text-marsa-muted">
          Declaration et suivi des interruptions terrain.
        </p>
      </header>

      {feedback && (
        <FeedbackMessage type={feedback.type}>{feedback.message}</FeedbackMessage>
      )}

      <section className="page-card">
        <div className="mb-5">
          <h3 className="font-bold text-marsa-royal">Declarer un arret</h3>
          <p className="mt-1 text-sm text-marsa-muted">
            Associez l'incident a une operation en cours.
          </p>
        </div>

        {loading ? (
          <Loader label="Chargement des operations..." />
        ) : (
          <form
            className="grid items-end gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.7fr)_auto]"
            onSubmit={handleSubmit}
          >
            <div>
              <label className="form-label" htmlFor="arret-operation">
                Operation
              </label>
              <select
                id="arret-operation"
                name="operation_id"
                value={form.operation_id}
                onChange={handleChange}
                className="form-control"
                required
                disabled={operations.length === 0}
              >
                <option value="">Selectionner une operation</option>
                {operations.map((operation) => (
                  <option key={operation.id} value={operation.id}>
                    {operation.nom_operation} - {operation.shift}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label" htmlFor="cause">
                Cause
              </label>
              <select
                id="cause"
                name="cause"
                value={form.cause}
                onChange={handleChange}
                className="form-control"
              >
                <option value="panne grue">Panne grue</option>
                <option value="manque de matériel">Manque de materiel</option>
                <option value="attente camion">Attente camion</option>
              </select>
            </div>

            <button
              type="submit"
              className="primary-button"
              disabled={submitting || operations.length === 0}
            >
              {submitting ? (
                <LoaderCircle size={18} className="animate-spin" />
              ) : (
                <OctagonAlert size={18} />
              )}
              {submitting ? 'Declaration...' : 'Declarer'}
            </button>
          </form>
        )}

        {!loading && operations.length === 0 && (
          <p className="mt-4 rounded-md border border-dashed border-[#c0d5e8] bg-[#f5f9fd] p-3 text-sm text-marsa-muted">
            Aucune operation en cours n'est disponible.
          </p>
        )}
      </section>

      <section className="page-card overflow-hidden p-0 sm:p-0">
        <div className="border-b border-marsa-border px-5 py-4 sm:px-6">
          <h3 className="font-bold text-marsa-royal">Historique des arrets</h3>
          <p className="mt-1 text-sm text-marsa-muted">
            {loading ? 'Chargement en cours' : `${arrets.length} arret(s)`}
          </p>
        </div>

        {loading ? (
          <Loader label="Chargement des arrets..." />
        ) : arrets.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-marsa-muted">
            Aucun arret de travail enregistre.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[960px]">
              <thead>
                <tr>
                  <th>Operation</th>
                  <th>Cause</th>
                  <th>Debut</th>
                  <th>Fin</th>
                  <th>Statut</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {arrets.map((arret) => (
                  <tr key={arret.id}>
                    <td className="font-semibold text-marsa-text">
                      {arret.nom_operation}
                    </td>
                    <td>{arret.cause}</td>
                    <td>{formatDateTime(arret.heure_debut)}</td>
                    <td>{formatDateTime(arret.heure_fin)}</td>
                    <td>
                      <StatusBadge value={arret.statut} />
                    </td>
                    <td>
                      {arret.statut === 'en cours' ? (
                        <button
                          type="button"
                          onClick={() => handleClose(arret.id)}
                          disabled={closingId === arret.id}
                          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#c8d8e8] px-3 text-xs font-bold text-marsa-royal transition hover:border-marsa-royal hover:bg-marsa-royal hover:text-white disabled:opacity-60"
                        >
                          {closingId === arret.id && (
                            <LoaderCircle size={15} className="animate-spin" />
                          )}
                          {closingId === arret.id ? 'Cloture...' : 'Cloturer'}
                        </button>
                      ) : (
                        <span className="text-xs text-marsa-muted">Termine</span>
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

export default Arrets
