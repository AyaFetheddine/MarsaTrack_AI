import { Info, LoaderCircle, OctagonAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  arretsApi,
  getApiErrorMessage,
  operationsApi,
} from '../api/api'
import FeedbackMessage from '../components/FeedbackMessage'
import Loader from '../components/Loader'

const initialForm = {
  operation_id: '',
  cause: 'panne grue',
}

function Arrets() {
  const [operations, setOperations] = useState([])
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState(null)

  useEffect(() => {
    const loadOperations = async () => {
      try {
        const response = await operationsApi.list()
        const activeOperations = (response.data.data || []).filter(
          (operation) => operation.statut === 'en cours',
        )

        setOperations(activeOperations)
      } catch (requestError) {
        setFeedback({
          type: 'error',
          message: getApiErrorMessage(
            requestError,
            'Impossible de charger les operations.',
          ),
        })
      } finally {
        setLoading(false)
      }
    }

    loadOperations()
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

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,460px)_minmax(0,1fr)]">
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
            <form className="space-y-4" onSubmit={handleSubmit}>
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
                  <option value="manque de matériel">
                    Manque de materiel
                  </option>
                  <option value="attente camion">Attente camion</option>
                </select>
              </div>

              {operations.length === 0 && (
                <p className="rounded-md border border-dashed border-[#c0d5e8] bg-[#f5f9fd] p-3 text-sm text-marsa-muted">
                  Aucune operation en cours n'est disponible.
                </p>
              )}

              <button
                type="submit"
                className="primary-button w-full"
                disabled={submitting || operations.length === 0}
              >
                {submitting ? (
                  <LoaderCircle size={18} className="animate-spin" />
                ) : (
                  <OctagonAlert size={18} />
                )}
                {submitting ? 'Declaration...' : 'Declarer l\'arret'}
              </button>
            </form>
          )}
        </section>

        <section className="page-card min-h-64">
          <div className="flex h-full min-h-52 flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-[#e8f4fd] text-marsa-ciel">
              <Info size={22} />
            </div>
            <h3 className="font-bold text-marsa-royal">
              Historique des arrets
            </h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-marsa-muted">
              L'historique sera affiche ici des que l'endpoint de consultation
              GET des arrets sera disponible dans le backend.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}

export default Arrets
