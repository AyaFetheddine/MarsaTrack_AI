import { Boxes, ExternalLink, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import {
  containersApi,
  getApiErrorMessage,
  operationsApi,
} from '../api/api'
import FeedbackMessage from '../components/FeedbackMessage'
import Loader from '../components/Loader'
import { getStoredRole } from '../utils/auth'

const ISO_6346_REGEX = /^[A-Z]{4}\d{7}$/

const initialForm = {
  operation_id: '',
  matricule_iso: '',
  image_url: '',
}

const formatDateTime = (value) => {
  if (!value) return '-'

  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function Containers() {
  const role = getStoredRole()
  const canCreateContainer = role === 'Portiqueur'
  const [operations, setOperations] = useState([])
  const [containers, setContainers] = useState([])
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState(null)

  const refreshContainers = async () => {
    const response = await containersApi.list()
    setContainers(response.data.data || [])
  }

  useEffect(() => {
    const loadPage = async () => {
      try {
        const [operationsResponse, containersResponse] = await Promise.all([
          operationsApi.list(),
          containersApi.list(),
        ])

        setOperations(
          (operationsResponse.data.data || []).filter(
            (operation) => operation.statut === 'en cours',
          ),
        )
        setContainers(containersResponse.data.data || [])
      } catch (requestError) {
        setFeedback({
          type: 'error',
          message: getApiErrorMessage(
            requestError,
            'Impossible de charger les conteneurs.',
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
      await refreshContainers()
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

      {canCreateContainer ? (
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
          <form
            className="grid items-end gap-4 lg:grid-cols-[minmax(220px,0.8fr)_minmax(190px,0.6fr)_minmax(260px,1fr)_auto]"
            onSubmit={handleSubmit}
          >
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
                Matricule ISO
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

            <button
              type="submit"
              className="primary-button"
              disabled={submitting || operations.length === 0}
            >
              {submitting ? (
                <LoaderCircle size={18} className="animate-spin" />
              ) : (
                <Boxes size={18} />
              )}
              {submitting ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </form>
        )}

        {!loading && operations.length === 0 && (
          <p className="mt-4 rounded-md border border-dashed border-[#c0d5e8] bg-[#f5f9fd] p-3 text-sm text-marsa-muted">
            Aucune operation en cours n'est disponible.
          </p>
        )}
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
          <h3 className="font-bold text-marsa-royal">
            Historique des conteneurs
          </h3>
          <p className="mt-1 text-sm text-marsa-muted">
            {loading
              ? 'Chargement en cours'
              : `${containers.length} conteneur(s)`}
          </p>
        </div>

        {loading ? (
          <Loader label="Chargement des conteneurs..." />
        ) : containers.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-marsa-muted">
            Aucun conteneur enregistre.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[980px]">
              <thead>
                <tr>
                  <th>Matricule ISO</th>
                  <th>Operation</th>
                  <th>Image</th>
                  <th>Confiance IA</th>
                  <th>Saisi par</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {containers.map((container) => (
                  <tr key={container.id}>
                    <td className="font-bold text-marsa-royal">
                      {container.matricule_iso}
                    </td>
                    <td>{container.nom_operation}</td>
                    <td>
                      {container.image_url ? (
                        <a
                          href={container.image_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 font-semibold text-marsa-ciel hover:text-marsa-royal"
                        >
                          Voir image
                          <ExternalLink size={14} />
                        </a>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      {container.ai_confidence === null
                        ? 'Saisie manuelle'
                        : `${Math.round(container.ai_confidence * 100)} %`}
                    </td>
                    <td>
                      {container.auteur_nom_complet ||
                        container.auteur_matricule ||
                        'Non renseigne'}
                    </td>
                    <td>{formatDateTime(container.created_at)}</td>
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

export default Containers
