import { Boxes, ExternalLink, ImagePlus, LoaderCircle, Trash2, X } from 'lucide-react'
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
const BACKEND_BASE_URL = 'http://localhost:3001'
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']

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

const resolveImageUrl = (imageUrl) => {
  if (!imageUrl) return null
  if (imageUrl.startsWith('http')) return imageUrl
  return `${BACKEND_BASE_URL}${imageUrl}`
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
  const [selectedImage, setSelectedImage] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const operationRef = useRef(null)
  const mouvementRef = useRef(null)
  const matriculeIsoRef = useRef(null)
  const imageBlockRef = useRef(null)
  const imageInputRef = useRef(null)
  const imageUrlRef = useRef(null)

  useAutoClearMessage(feedback, setFeedback, null, {
    successDuration: 7000,
    errorDuration: 15000,
  })

  useEffect(
    () => () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    },
    [previewUrl],
  )

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

  const handleImageChange = (event) => {
    const file = event.target.files?.[0]

    if (!file) return

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setSelectedImage(null)
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
      setPreviewUrl('')
      event.target.value = ''
      setFormErrors((current) => ({
        ...current,
        image: 'Format image invalide. Formats acceptés : PNG, JPEG ou WebP.',
      }))
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setSelectedImage(null)
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
      setPreviewUrl('')
      event.target.value = ''
      setFormErrors((current) => ({
        ...current,
        image: 'Image trop lourde. Taille maximale autorisée : 5 MB.',
      }))
      return
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    setSelectedImage(file)
    setPreviewUrl(URL.createObjectURL(file))
    setFormErrors((current) => ({ ...current, image: '', image_url: '' }))
  }

  const removeSelectedImage = () => {
    setSelectedImage(null)
    setIsPreviewOpen(false)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setPreviewUrl('')
    setFormErrors((current) => ({ ...current, image: '' }))

    if (imageInputRef.current) {
      imageInputRef.current.value = ''
    }
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

    if (!selectedImage) {
      errors.image = 'Veuillez importer une image du conteneur.'
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
        image: imageBlockRef,
        image_url: imageUrlRef,
      })
      return
    }

    setSubmitting(true)

    try {
      const formData = new FormData()
      formData.append('operation_id', form.operation_id)
      formData.append('mouvement', form.mouvement)
      formData.append('matricule_iso', form.matricule_iso)

      formData.append('image', selectedImage)

      await containersApi.create(formData)
      setForm(initialForm)
      setFormErrors({})
      removeSelectedImage()
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
              className="space-y-5"
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

              <div ref={imageBlockRef}>
                <span className="form-label">Image du conteneur</span>
                <div
                  className={`relative min-h-[380px] overflow-hidden rounded-md border border-dashed transition ${
                    formErrors.image
                      ? 'border-[#ef9a9a] bg-[#fffafa] shadow-[0_0_0_4px_rgba(239,154,154,0.28)]'
                      : 'border-[#c0d5e8] bg-[#f8fbff] hover:border-marsa-ciel hover:bg-[#f0f8fd]'
                  }`}
                >
                  <input
                    ref={imageInputRef}
                    id="container-image"
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleImageChange}
                    className="sr-only"
                  />

                  {previewUrl ? (
                    <>
                      <img
                        src={previewUrl}
                        alt="Previsualisation du conteneur"
                        className="absolute inset-x-0 top-0 h-[calc(100%-4.5rem)] w-full object-contain bg-[#f8fbff]"
                      />
                      <div className="hidden" />
                      <div className="absolute inset-x-0 bottom-0 flex min-h-[4.5rem] flex-wrap items-center gap-2 border-t border-[#d8e6f3] bg-white/95 px-4 py-3 shadow-[0_-8px_18px_rgba(20,50,77,0.08)]">
                        <div className="min-w-0 flex-1">
                          <p className="max-w-full truncate text-sm font-bold text-marsa-royal">
                            {selectedImage.name}
                          </p>
                          <p className="mt-0.5 text-xs text-marsa-muted">
                            Image prête pour la future détection IA.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsPreviewOpen(true)}
                          className="inline-flex min-h-9 items-center rounded-md border border-[#c8d8e8] bg-white px-3 text-xs font-bold text-marsa-royal shadow-sm transition hover:border-marsa-royal hover:bg-[#eef5fb]"
                        >
                          Voir en grand
                        </button>
                        <label
                          htmlFor="container-image"
                          className="inline-flex min-h-9 cursor-pointer items-center rounded-md border border-[#c8d8e8] bg-white px-3 text-xs font-bold text-marsa-royal shadow-sm transition hover:border-marsa-royal hover:bg-[#eef5fb]"
                        >
                          Changer l'image
                        </label>
                        <button
                          type="button"
                          onClick={removeSelectedImage}
                          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#fecaca] bg-white px-3 text-xs font-bold text-[#b71c1c] shadow-sm transition hover:border-[#b91c1c] hover:bg-[#fff5f5]"
                        >
                          <X size={15} />
                          Retirer
                        </button>
                      </div>
                      <div className="hidden">
                        <p className="max-w-full truncate text-sm font-bold">
                          {selectedImage.name}
                        </p>
                        <p className="mt-1 text-xs text-white/80">
                          Image prête pour la future détection IA.
                        </p>
                      </div>
                    </>
                  ) : (
                    <label
                      htmlFor="container-image"
                      className="flex min-h-[320px] cursor-pointer flex-col items-center justify-center px-4 py-8 text-center"
                    >
                      <ImagePlus size={36} className="mb-4 text-marsa-ciel" />
                      <span className="text-base font-bold text-marsa-royal">
                        Importer une image
                      </span>
                      <span className="mt-2 text-sm text-marsa-muted">
                        PNG, JPEG ou WebP, 5 MB maximum
                      </span>
                      <span className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-semibold text-marsa-muted shadow-sm">
                        Cliquez pour sélectionner une image du conteneur
                      </span>
                    </label>
                  )}
                </div>
                <div className="hidden">
                  <label
                    htmlFor="container-image"
                    className={`flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-md border border-dashed bg-[#f8fbff] px-4 py-6 text-center transition hover:border-marsa-ciel hover:bg-[#f0f8fd] ${
                      formErrors.image ? 'border-[#ef9a9a] bg-[#fffafa]' : 'border-[#c0d5e8]'
                    }`}
                  >
                    <ImagePlus size={28} className="mb-3 text-marsa-ciel" />
                    <span className="text-sm font-bold text-marsa-royal">
                      Importer une image
                    </span>
                    <span className="mt-1 text-xs text-marsa-muted">
                      PNG, JPEG ou WebP, 5 MB maximum
                    </span>
                    {selectedImage && (
                      <span className="mt-3 max-w-full truncate rounded-full bg-white px-3 py-1 text-xs font-semibold text-marsa-text">
                        {selectedImage.name}
                      </span>
                    )}
                    <input
                      id="container-image-legacy"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleImageChange}
                      className="sr-only"
                    />
                  </label>

                  <div className="rounded-md border border-marsa-border bg-white p-3">
                    {previewUrl ? (
                      <div className="space-y-3">
                        <img
                          src={previewUrl}
                          alt="Prévisualisation du conteneur"
                          className="h-40 w-full rounded-md object-contain bg-[#f8fbff]"
                        />
                        <button
                          type="button"
                          onClick={removeSelectedImage}
                          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#c8d8e8] px-3 text-xs font-bold text-marsa-royal transition hover:border-marsa-royal hover:bg-[#eef5fb]"
                        >
                          <X size={15} />
                          Retirer
                        </button>
                      </div>
                    ) : (
                      <div className="flex h-full min-h-40 items-center justify-center rounded-md bg-[#f8fbff] px-4 text-center text-sm text-marsa-muted">
                        La prévisualisation apparaîtra ici après sélection.
                      </div>
                    )}
                  </div>
                </div>
                {formErrors.image && (
                  <p className="mt-1.5 text-xs font-semibold text-[#b71c1c]">
                    {formErrors.image}
                  </p>
                )}
              </div>

              <div className="hidden">
                <label className="form-label" htmlFor="image_url">
                  URL image (optionnel)
                </label>
                <p className="mb-2 text-xs text-marsa-muted">
                  Option temporaire utilisée seulement si aucune image n'est uploadée.
                </p>
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

              <div className="rounded-md border border-[#d8e6f3] bg-white px-4 py-3 text-sm text-marsa-muted">
                <span className="font-bold text-marsa-royal">Détection IA : à venir.</span>{' '}
                YOLO/OCR sera utilisé plus tard pour proposer automatiquement l'ID du conteneur à partir de l'image.
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
                      {resolveImageUrl(container.image_url) ? (
                        <a
                          href={resolveImageUrl(container.image_url)}
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

      {isPreviewOpen && previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#14324d]/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-6xl overflow-hidden rounded-md bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-marsa-border px-5 py-4">
              <div className="min-w-0">
                <h3 className="font-bold text-marsa-royal">
                  Prévisualisation du conteneur
                </h3>
                <p className="mt-1 max-w-full truncate text-xs text-marsa-muted">
                  {selectedImage?.name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#c8d8e8] px-3 text-xs font-bold text-marsa-royal transition hover:border-marsa-royal hover:bg-[#eef5fb]"
              >
                <X size={15} />
                Fermer
              </button>
            </div>
            <div className="flex max-h-[78vh] items-center justify-center bg-[#f8fbff] p-4">
              <img
                src={previewUrl}
                alt="Image du conteneur en grand"
                className="max-h-[74vh] max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}

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
