import { Boxes, Info, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  containersApi,
  getApiErrorMessage,
  operationsApi,
} from '../api/api'
import FeedbackMessage from '../components/FeedbackMessage'
import Loader from '../components/Loader'

const ISO_6346_REGEX = /^[A-Z]{4}\d{7}$/

const initialForm = {
  operation_id: '',
  matricule_iso: '',
  image_url: '',
}

function Containers() {
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
    setForm((current) => ({
      ...current,
      [name]: name === 'matricule_iso' ? value.toUpperCase() : value,
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFeedback(null)

    if (!ISO_6346_REGEX.test(form.matricule_iso)) {
      setFeedback({
        type: 'error',
        message:
          'Matricule ISO invalide : 4 lettres majuscules suivies de 7 chiffres sont attendues.',
      })
      return
    }

    setSubmitting(true)

    try {
      await containersApi.create({
        operation_id: Number(form.operation_id),
        matricule_iso: form.matricule_iso,
        image_url: form.image_url,
      })
      setForm(initialForm)
      setFeedback({
        type: 'success',
        message: 'Conteneur saisi avec succes.',
      })
    } catch (requestError) {
      setFeedback({
        type: 'error',
        message: getApiErrorMessage(
          requestError,
          'Impossible d\'enregistrer le conteneur.',
        ),
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="mb-1 text-2xl font-bold text-marsa-royal">Conteneurs</h2>
        <p className="text-sm text-marsa-muted">
          Saisie terrain et preparation du flux de detection YOLOv11.
        </p>
      </header>

      {feedback && (
        <FeedbackMessage type={feedback.type}>{feedback.message}</FeedbackMessage>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(340px,500px)_minmax(0,1fr)]">
        <section className="page-card">
          <div className="mb-5">
            <h3 className="font-bold text-marsa-royal">Saisir un conteneur</h3>
            <p className="mt-1 text-sm text-marsa-muted">
              Renseignez le matricule ISO et l'image source.
            </p>
          </div>

          {loading ? (
            <Loader label="Chargement des operations..." />
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="form-label" htmlFor="container-operation">
                  Operation
                </label>
                <select
                  id="container-operation"
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
                <label className="form-label" htmlFor="matricule_iso">
                  Matricule ISO 6346
                </label>
                <input
                  id="matricule_iso"
                  name="matricule_iso"
                  value={form.matricule_iso}
                  onChange={handleChange}
                  className="form-control uppercase"
                  placeholder="MSCU1234567"
                  maxLength={11}
                  pattern="[A-Z]{4}[0-9]{7}"
                  required
                />
                <p className="mt-1.5 text-xs text-marsa-muted">
                  Format attendu : 4 lettres majuscules + 7 chiffres.
                </p>
              </div>

              <div>
                <label className="form-label" htmlFor="image_url">
                  URL de l'image
                </label>
                <input
                  id="image_url"
                  name="image_url"
                  type="url"
                  value={form.image_url}
                  onChange={handleChange}
                  className="form-control"
                  placeholder="https://exemple.ma/conteneur.jpg"
                  required
                />
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
                  <Boxes size={18} />
                )}
                {submitting ? 'Enregistrement...' : 'Enregistrer le conteneur'}
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
              Historique des conteneurs
            </h3>
            <p className="mt-2 max-w-md text-sm leading-6 text-marsa-muted">
              L'historique sera affiche ici apres l'ajout de l'endpoint GET de
              consultation des conteneurs dans le backend.
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}

export default Containers
