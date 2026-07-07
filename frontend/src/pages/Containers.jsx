import { Boxes, ExternalLink, LoaderCircle, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  containersApi,
  getApiErrorMessage,
  operationsApi,
} from '../api/api'
import ConfirmDialog from '../components/ConfirmDialog'
import CustomSelect from '../components/CustomSelect'
import Loader from '../components/Loader'
import StatusBadge from '../components/StatusBadge'
import ToastMessage from '../components/ToastMessage'
import useAutoClearMessage from '../hooks/useAutoClearMessage'
import { getStoredRole } from '../utils/auth'
import { fieldErrorClass, scrollToFirstError } from '../utils/formValidation'

const ISO_6346_REGEX = /^[A-Z]{4}\d{7}$/

const initialForm = {
  operation_id: '',
  mouvement: 'IMPORT',
  matricule_iso: '',
  image_url: '',
}

const mouvementOptions = [
  { value: 'IMPORT', label: 'Import' },
  { value: 'EXPORT', label: 'Export' },
]

const formatDateTime = (value) => {
  if (!value) return '-'

  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function Containers() {
  const role = getStoredRole()
  const canCreateContainer = ['Admin', 'Portiqueur'].includes(role)
  const canDeleteContainer = role === 'Admin'
  const [operations, setOperations] = useState([])
  const [containers, setContainers] = useState([])
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [pendingDeleteContainer, setPendingDeleteContainer] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [formErrors, setFormErrors] = useState({})
  const operationRef = useRef(null)
  const mouvementRef = useRef(null)
  const matriculeIsoRef = useRef(null)
  const imageUrlRef = useRef(null)

  useAutoClearMessage(feedback, setFeedback, null, {
    successDuration: 7000,
    errorDuration: 15000,
  })

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
    setFormErrors((current) => ({ ...current, [name]: '' }))
  }

  const handleCustomChange = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }))
    setFormErrors((current) => ({ ...current, [name]: '' }))
  }

  const validateContainerForm = () => {
    const errors = {}

    if (!form.operation_id) {
      errors.operation_id = 'Sélectionnez une opération.'
    }

    if (!form.mouvement) {
      errors.mouvement = 'Sélectionnez le mouvement du conteneur.'
    }

    if (!form.matricule_iso.trim()) {
      errors.matricule_iso = 'Le matricule ISO est obligatoire.'
    } else if (!ISO_6346_REGEX.test(form.matricule_iso)) {
      errors.matricule_iso =
        'Format attendu : 4 lettres majuscules suivies de 7 chiffres, ex. MSCU1234567.'
    }

    if (!form.image_url.trim()) {
      errors.image_url = "L'URL de l'image est obligatoire."
    } else {
      try {
        new URL(form.image_url)
      } catch {
        errors.image_url =
          'Renseignez une URL valide, ex. https://exemple.ma/conteneur.jpg.'
      }
    }

    return errors
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFeedback(null)

    const errors = validateContainerForm()
    setFormErrors(errors)

    if (Object.keys(errors).length > 0) {
      scrollToFirstError(errors, {
        operation_id: operationRef,
        mouvement: mouvementRef,
        matricule_iso: matriculeIsoRef,
        image_url: imageUrlRef,
      })
      return
    }

    setSubmitting(true)

    try {
      await containersApi.create({
        operation_id: Number(form.operation_id),
        matricule_iso: form.matricule_iso,
        image_url: form.image_url,
        mouvement: form.mouvement,
      })
      setForm(initialForm)
      setFormErrors({})
      await refreshContainers()
      setFeedback({
        type: 'success',
        message: 'Conteneur saisi avec succès.',
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

  const confirmDelete = async () => {
    if (!pendingDeleteContainer) return

    setDeletingId(pendingDeleteContainer.id)
    setFeedback(null)

    try {
      await containersApi.remove(pendingDeleteContainer.id)
      await refreshContainers()
      setFeedback({
        type: 'success',
        message: 'Conteneur supprimé avec succès.',
      })
      setPendingDeleteContainer(null)
    } catch (requestError) {
      setPendingDeleteContainer(null)
      setFeedback({
        type: 'error',
        message: getApiErrorMessage(
          requestError,
          'Impossible de supprimer le conteneur.',
        ),
      })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="mb-1 text-2xl font-bold text-marsa-royal">Conteneurs</h2>
        <p className="text-sm text-marsa-muted">
          Saisie terrain et préparation du flux de détection YOLOv11.
        </p>
      </header>

      {feedback && (
        <ToastMessage
          message={feedback}
          onClose={() => setFeedback(null)}
          placement="center"
        />
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
            <Loader label="Chargement des opérations..." />
          ) : (
            <form
              className="grid items-end gap-4 xl:grid-cols-[minmax(220px,0.8fr)_minmax(150px,0.45fr)_minmax(190px,0.55fr)_minmax(260px,1fr)_auto]"
              onSubmit={handleSubmit}
              noValidate
            >
              <div ref={operationRef}>
                <CustomSelect
                  label="Opération"
                  value={form.operation_id}
                  onChange={(value) => handleCustomChange('operation_id', value)}
                  options={operations.map((operation) => ({
                    value: String(operation.id),
                    label: `${operation.nom_operation} - ${operation.shift}`,
                  }))}
                  placeholder="Sélectionner une opération"
                  disabled={operations.length === 0}
                  error={formErrors.operation_id}
                />
              </div>

              <div ref={mouvementRef}>
                <CustomSelect
                  label="Mouvement"
                  value={form.mouvement}
                  onChange={(value) => handleCustomChange('mouvement', value)}
                  options={mouvementOptions}
                  error={formErrors.mouvement}
                />
              </div>

              <div>
                <label className="form-label" htmlFor="matricule_iso">
                  Matricule ISO
                </label>
                <input
                  ref={matriculeIsoRef}
                  id="matricule_iso"
                  name="matricule_iso"
                  value={form.matricule_iso}
                  onChange={handleChange}
                  className={`form-control uppercase ${fieldErrorClass(formErrors.matricule_iso)}`}
                  placeholder="MSCU1234567"
                  maxLength={11}
                />
                {formErrors.matricule_iso && (
                  <p className="mt-1.5 text-xs font-semibold text-[#b71c1c]">
                    {formErrors.matricule_iso}
                  </p>
                )}
              </div>

              <div>
                <label className="form-label" htmlFor="image_url">
                  URL de l'image
                </label>
                <input
                  ref={imageUrlRef}
                  id="image_url"
                  name="image_url"
                  type="text"
                  value={form.image_url}
                  onChange={handleChange}
                  className={`form-control ${fieldErrorClass(formErrors.image_url)}`}
                  placeholder="https://exemple.ma/conteneur.jpg"
                />
                {formErrors.image_url && (
                  <p className="mt-1.5 text-xs font-semibold text-[#b71c1c]">
                    {formErrors.image_url}
                  </p>
                )}
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
              Aucune opération en cours n'est disponible.
            </p>
          )}
        </section>
      ) : (
        <section className="page-card border-dashed">
          <h3 className="font-bold text-marsa-royal">Consultation uniquement</h3>
          <p className="mt-1 text-sm text-marsa-muted">
            Votre rôle permet la consultation, mais pas cette action.
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
            Aucun conteneur enregistré.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[1180px]">
              <thead>
                <tr>
                  <th>Matricule ISO</th>
                  <th>Mouvement</th>
                  <th>Opération</th>
                  <th>Image</th>
                  <th>Confiance IA</th>
                  <th>Saisi par</th>
                  <th>Date</th>
                  {canDeleteContainer && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {containers.map((container) => (
                  <tr key={container.id}>
                    <td className="font-bold text-marsa-royal">
                      {container.matricule_iso}
                    </td>
                    <td>
                      <StatusBadge value={container.mouvement || 'IMPORT'} />
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
                        'Non renseigné'}
                    </td>
                    <td>{formatDateTime(container.created_at)}</td>
                    {canDeleteContainer && (
                      <td>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteContainer(container)}
                          disabled={deletingId === container.id}
                          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#fecaca] px-3 text-xs font-bold text-[#b91c1c] transition hover:border-[#b91c1c] hover:bg-[#b91c1c] hover:text-white disabled:opacity-60"
                        >
                          {deletingId === container.id ? (
                            <LoaderCircle size={15} className="animate-spin" />
                          ) : (
                            <Trash2 size={15} />
                          )}
                          Supprimer
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pendingDeleteContainer && (
        <ConfirmDialog
          title="Supprimer ce conteneur ?"
          description="Cette action est utile pour nettoyer les données de test. Elle est irréversible."
          confirmLabel="Supprimer"
          tone="danger"
          isLoading={deletingId === pendingDeleteContainer.id}
          onCancel={() => setPendingDeleteContainer(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  )
}

export default Containers
