import {
  AlertCircle,
  Boxes,
  Camera,
  CheckCircle2,
  ImagePlus,
  LoaderCircle,
  ScanLine,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import {
  containersApi,
  getApiErrorMessage,
  operationsApi,
  visionApi,
} from '../api/api'
import ConfirmDialog from '../components/ConfirmDialog'
import CameraCapture from '../components/CameraCapture'
import ContainerImageViewer from '../components/ContainerImageViewer'
import CustomSelect from '../components/CustomSelect'
import Loader from '../components/Loader'
import StatusBadge from '../components/StatusBadge'
import ToastMessage from '../components/ToastMessage'
import VisionResultBoundary from '../components/VisionResultBoundary'
import useAutoClearMessage from '../hooks/useAutoClearMessage'
import { getStoredRole } from '../utils/auth'
import { fieldErrorClass, scrollToFirstError } from '../utils/formValidation'

const ISO_6346_REGEX = /^[A-Z]{4}\d{7}$/
const ISO_6346_WITHOUT_CHECK_DIGIT_REGEX = /^[A-Z]{4}\d{6}$/
const BACKEND_BASE_URL = 'http://localhost:3001'
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const ISO_6346_LETTER_VALUES = {
  A: 10,
  B: 12,
  C: 13,
  D: 14,
  E: 15,
  F: 16,
  G: 17,
  H: 18,
  I: 19,
  J: 20,
  K: 21,
  L: 23,
  M: 24,
  N: 25,
  O: 26,
  P: 27,
  Q: 28,
  R: 29,
  S: 30,
  T: 31,
  U: 32,
  V: 34,
  W: 35,
  X: 36,
  Y: 37,
  Z: 38,
}

const initialForm = {
  operation_id: '',
  mouvement: 'IMPORT',
  matricule_iso: '',
  iso_type_code: '',
  image_url: '',
}

const ISO_TYPE_CODE_REGEX = /^[0-9A-Z]{2}[A-Z][0-9A-Z]$/

const normalizeIsoTypeCode = (value = '') =>
  String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4)

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

const normalizeIso = (value = '') => String(value ?? '').replace(/[\s-]/g, '').toUpperCase()

const normalizeContainerCode = (value = '') =>
  String(value ?? '').replace(/[\s-]/g, '').toUpperCase()

const normalizeVisionResult = (result) => {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    throw new Error('Le service Vision IA a retourne une reponse invalide.')
  }

  const numericFields = [
    'confidence',
    'yolo_confidence',
    'ocr_confidence',
    'iso_type_confidence',
    'iso_type_yolo_confidence',
    'iso_type_ocr_confidence',
  ]
  const normalizedResult = { ...result }

  numericFields.forEach((field) => {
    if (normalizedResult[field] == null || normalizedResult[field] === '') return

    const numericValue = Number(normalizedResult[field])
    normalizedResult[field] = Number.isFinite(numericValue) ? numericValue : null
  })

  ;[
    'detected_iso',
    'raw_ocr_text',
    'owner_code',
    'category',
    'serial_number',
    'check_digit',
    'expected_check_digit',
    'detection_mode',
    'ocr_variant',
    'iso_type',
    'raw_iso_type_ocr_text',
    'iso_type_ocr_variant',
    'iso_type_warning',
    'message',
    'warning',
  ].forEach((field) => {
    if (normalizedResult[field] != null && typeof normalizedResult[field] !== 'string') {
      normalizedResult[field] = String(normalizedResult[field])
    }
  })

  return normalizedResult
}

const calculateIsoCheckDigit = (codeWithoutCheckDigit) => {
  const normalized = normalizeContainerCode(codeWithoutCheckDigit)

  if (!ISO_6346_WITHOUT_CHECK_DIGIT_REGEX.test(normalized)) return null

  const total = normalized.split('').reduce((sum, character, index) => {
    const value = /^\d$/.test(character)
      ? Number(character)
      : ISO_6346_LETTER_VALUES[character]

    return sum + value * 2 ** index
  }, 0)

  const remainder = total % 11
  return String(remainder === 10 ? 0 : remainder)
}

const validateIso6346 = (value) => {
  const normalized = normalizeContainerCode(value)

  if (!ISO_6346_REGEX.test(normalized)) {
    return {
      normalized,
      isValidFormat: false,
      isValidCheckDigit: false,
      isValid: false,
    }
  }

  const expectedCheckDigit = calculateIsoCheckDigit(normalized.slice(0, 10))
  const isValidCheckDigit = normalized.slice(10) === expectedCheckDigit

  return {
    normalized,
    isValidFormat: true,
    isValidCheckDigit,
    isValid: isValidCheckDigit,
    expectedCheckDigit,
  }
}

// Un resultat de secours simule (service Vision indisponible) ne doit JAMAIS
// preremplir un matricule ni etre enregistre comme une detection IA : c'est une
// valeur fictive, pas une lecture reelle.
const isSimulatedResult = (result) =>
  result?.detection_mode === 'fallback_mock' || result?.detection_mode === 'mock'

const getDetectionTrace = (matriculeIso, visionResult) => {
  if (!visionResult?.detected_iso || isSimulatedResult(visionResult)) {
    return {
      source: 'MANUELLE',
      detectedIso: null,
      confidence: null,
      isCorrection: false,
    }
  }

  const detectedIso = normalizeIso(visionResult.detected_iso)
  const finalIso = normalizeIso(matriculeIso)
  const isCorrection = Boolean(finalIso && finalIso !== detectedIso)

  return {
    source: isCorrection ? 'IA_CORRIGEE' : 'IA_VALIDEE',
    detectedIso,
    confidence: visionResult.confidence ?? null,
    isCorrection,
  }
}

const detectionSourceLabels = {
  MANUELLE: 'Manuelle',
  IA_VALIDEE: 'IA validée',
  IA_CORRIGEE: 'IA corrigée',
}

const detectionSourceClasses = {
  MANUELLE: 'bg-[#eef2f7] text-[#486581]',
  IA_VALIDEE: 'bg-[#dcfce7] text-[#047857]',
  IA_CORRIGEE: 'bg-[#fef3c7] text-[#a16207]',
}

const getDetectionSourceLabel = (source) =>
  detectionSourceLabels[source] || detectionSourceLabels.MANUELLE

const getDetectionSourceClass = (source) =>
  detectionSourceClasses[source] || detectionSourceClasses.MANUELLE

const getVisionValidationLabel = (result) => {
  if (!result?.detected_iso) return 'Aucun code validé'
  if (!result?.is_valid_format) return 'Format ISO invalide'
  if (!result?.is_valid_check_digit) return 'Chiffre de contrôle invalide'
  return 'Code ISO valide'
}

const getVisionValidationClass = (result) => {
  if (result?.is_valid_format && result?.is_valid_check_digit) {
    return 'bg-[#dcfce7] text-[#047857]'
  }

  return 'bg-[#fee2e2] text-[#b91c1c]'
}

// Libellés métier : l'utilisateur terrain n'a pas à connaître le nom ni la
// version des modèles utilisés. Les détails techniques restent disponibles
// côté service (/health, logs, tests, documentation).
const getDetectionModeLabel = (mode) => {
  const labels = {
    mock: 'Mode de démonstration',
    fallback_mock: 'Service IA indisponible - résultat de secours',
    yolo_ocr: 'Analyse automatique',
    yolo_paddleocr: 'Analyse automatique',
    yolo_v2_paddleocr: 'Analyse automatique',
    yolo_no_valid_iso: 'Lecture à vérifier',
    yolo_only: 'Zone détectée, lecture incomplète',
    no_detection: 'Aucune zone détectée',
    ocr_disabled: 'Lecture automatique désactivée',
    ocr_error: 'Lecture automatique indisponible',
    model_unavailable: 'Analyse automatique indisponible',
  }
  return labels[mode] || 'Vision IA'
}

// Traduit le nom technique de la variante OCR ("reflow_inverted", "upscaled"...)
// en langage metier lisible. Affiche la technique dominante ; les valeurs
// brutes restent dans l'API et les logs pour le debug.
const PROCESSING_LABELS = [
  ['reflow', 'Reconstruction avancée'],
  ['context', 'Analyse en zone élargie'],
  ['clean', 'Nettoyage du bruit'],
  ['column', 'Lecture par colonnes'],
  ['combined', 'Recomposition des fragments'],
  ['invert', 'Couleurs inversées'],
  ['rotate', 'Rotation de l’image'],
  ['threshold', 'Binarisation'],
  ['sharpen', 'Netteté renforcée'],
  ['contrast', 'Contraste renforcé'],
  ['gray', 'Niveaux de gris'],
  ['upscal', 'Agrandissement'],
  ['original', 'Image d’origine'],
]

const getProcessingLabel = (variant) => {
  if (!variant) return '-'
  const key = String(variant).toLowerCase()
  const match = PROCESSING_LABELS.find(([token]) => key.includes(token))
  return match ? match[1] : 'Traitement standard'
}

const getDetectionModeClass = (mode) => {
  if (mode === 'fallback_mock') return 'border-[#facc15] bg-[#fffbeb] text-[#a16207]'
  if (['yolo_ocr', 'yolo_paddleocr', 'yolo_v2_paddleocr'].includes(mode)) {
    return 'border-[#bbf7d0] bg-[#f0fdf4] text-[#047857]'
  }
  if (['no_detection', 'yolo_no_valid_iso', 'ocr_error', 'ocr_disabled'].includes(mode)) {
    return 'border-[#facc15] bg-[#fffbeb] text-[#a16207]'
  }
  return 'border-[#d8e6f3] bg-white text-marsa-muted'
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
  const [isCameraOpen, setIsCameraOpen] = useState(false)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [visionResult, setVisionResult] = useState(null)
  const [analyzingImage, setAnalyzingImage] = useState(false)
  const operationRef = useRef(null)
  const mouvementRef = useRef(null)
  const matriculeIsoRef = useRef(null)
  const isoTypeCodeRef = useRef(null)
  const formSectionRef = useRef(null)
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
    let nextValue = value
    if (name === 'matricule_iso') nextValue = normalizeContainerCode(value)
    else if (name === 'iso_type_code') nextValue = normalizeIsoTypeCode(value)
    setForm((current) => ({
      ...current,
      [name]: nextValue,
    }))
    setFormErrors((current) => ({ ...current, [name]: '' }))
  }

  const handleCustomChange = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }))
    setFormErrors((current) => ({ ...current, [name]: '' }))
  }

  const selectImage = (file, input) => {
    if (!file) return false

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setSelectedImage(null)
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
      setPreviewUrl('')
      if (input) input.value = ''
      setFormErrors((current) => ({
        ...current,
        image: 'Format image invalide. Formats acceptés : PNG, JPEG ou WebP.',
      }))
      return false
    }

    if (file.size > 5 * 1024 * 1024) {
      setSelectedImage(null)
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
      setPreviewUrl('')
      if (input) input.value = ''
      setFormErrors((current) => ({
        ...current,
        image: 'Image trop lourde. Taille maximale autorisée : 5 MB.',
      }))
      return false
    }

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }

    setSelectedImage(file)
    setPreviewUrl(URL.createObjectURL(file))
    setVisionResult(null)
    // Nouvelle image : on vide les champs remplis par l'IA precedente pour
    // qu'ils ne restent pas affiches pendant l'analyse de la nouvelle image.
    setForm((current) => ({ ...current, matricule_iso: '', iso_type_code: '' }))
    setFormErrors((current) => ({
      ...current,
      image: '',
      image_url: '',
      matricule_iso: '',
      iso_type_code: '',
    }))
    return true
  }

  const handleImageChange = (event) => {
    selectImage(event.target.files?.[0], event.target)
  }

  const handleCameraCapture = (file) => {
    if (selectImage(file)) {
      setIsCameraOpen(false)
    }
  }

  const removeSelectedImage = () => {
    setSelectedImage(null)
    setIsPreviewOpen(false)
    setVisionResult(null)
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl)
    }
    setPreviewUrl('')
    // Retirer l'image vide aussi les champs remplis par l'IA (matricule + type).
    setForm((current) => ({ ...current, matricule_iso: '', iso_type_code: '' }))
    setFormErrors((current) => ({
      ...current,
      image: '',
      matricule_iso: '',
      iso_type_code: '',
    }))

    if (imageInputRef.current) {
      imageInputRef.current.value = ''
    }
  }

  const handleAnalyzeImage = async () => {
    if (!selectedImage) return

    setFeedback(null)
    setAnalyzingImage(true)

    try {
      const formData = new FormData()
      formData.append('image', selectedImage)

      const response = await visionApi.detectContainer(formData)
      const result = normalizeVisionResult(response.data?.data ?? response.data)

      setVisionResult(result)
      // Un resultat simule de secours n'est jamais preremplissable : on affiche
      // l'avertissement mais on laisse l'utilisateur saisir manuellement.
      if (!isSimulatedResult(result)) {
        setForm((current) => ({
          ...current,
          matricule_iso: result.detected_iso || current.matricule_iso,
          iso_type_code: result.iso_type
            ? normalizeIsoTypeCode(result.iso_type)
            : current.iso_type_code,
        }))
        setFormErrors((current) => ({
          ...current,
          matricule_iso: '',
          iso_type_code: '',
        }))
      }
    } catch (requestError) {
      setVisionResult(null)
      setFeedback({
        type: 'error',
        message: getApiErrorMessage(
          requestError,
          'Impossible d analyser l image. Vous pouvez saisir le matricule manuellement.',
        ),
      })
    } finally {
      setAnalyzingImage(false)
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
    } else {
      const isoValidation = validateIso6346(form.matricule_iso)

      if (!isoValidation.isValidFormat) {
        errors.matricule_iso =
          'Format attendu : 4 lettres + 7 chiffres avec chiffre de contrôle ISO 6346 valide.'
      } else if (!isoValidation.isValidCheckDigit) {
        errors.matricule_iso = `Chiffre de contrôle ISO 6346 incorrect. Chiffre attendu : ${isoValidation.expectedCheckDigit}.`
      }
    }

    const isoTypeValue = form.iso_type_code.trim()
    if (isoTypeValue && !ISO_TYPE_CODE_REGEX.test(isoTypeValue)) {
      errors.iso_type_code =
        'Code taille/type invalide : 4 caractères, ex : 22G1 (le 3ᵉ est une lettre).'
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
        iso_type_code: isoTypeCodeRef,
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
      formData.append('matricule_iso', normalizeContainerCode(form.matricule_iso))
      if (form.iso_type_code.trim()) {
        formData.append('iso_type_code', normalizeIsoTypeCode(form.iso_type_code))
      }
      const detectionTrace = getDetectionTrace(form.matricule_iso, visionResult)
      formData.append('detection_source', detectionTrace.source)

      if (detectionTrace.detectedIso) {
        formData.append('detected_iso', detectionTrace.detectedIso)
      }

      if (detectionTrace.confidence !== null) {
        formData.append('ai_confidence', detectionTrace.confidence)
      }

      formData.append('image', selectedImage)

      await containersApi.create(formData)
      setForm(initialForm)
      setFormErrors({})
      removeSelectedImage()
      await refreshContainers()
      setTimeout(() => {
        formSectionRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        })
        window.scrollTo({
          top: 0,
          behavior: 'smooth',
        })
      }, 80)
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

  const currentDetectionTrace = getDetectionTrace(form.matricule_iso, visionResult)

  return (
    <div className="space-y-6">
      <header>
        <h2 className="mb-1 text-2xl font-bold text-marsa-royal">Conteneurs</h2>
        <p className="text-sm text-marsa-muted">
          Saisie terrain assistée par la Vision IA.
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
        <section ref={formSectionRef} className="page-card">
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
                  placeholder="MRKU6234191"
                  maxLength={11}
                />
                {formErrors.matricule_iso && (
                  <p className="mt-1.5 text-xs font-semibold text-[#b71c1c]">
                    {formErrors.matricule_iso}
                  </p>
                )}
              </div>

              <div>
                <label className="form-label" htmlFor="iso_type_code">
                  Code taille/type{' '}
                  <span className="font-normal text-marsa-muted">(facultatif)</span>
                </label>
                <input
                  ref={isoTypeCodeRef}
                  id="iso_type_code"
                  name="iso_type_code"
                  value={form.iso_type_code}
                  onChange={handleChange}
                  className={`form-control uppercase ${fieldErrorClass(formErrors.iso_type_code)}`}
                  placeholder="22G1"
                  maxLength={4}
                />
                {formErrors.iso_type_code ? (
                  <p className="mt-1.5 text-xs font-semibold text-[#b71c1c]">
                    {formErrors.iso_type_code}
                  </p>
                ) : (
                  <p className="mt-1.5 text-xs text-marsa-muted">
                    Prérempli par l'IA si détecté. Modifiable, laissé vide si non détecté.
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
                        <button
                          type="button"
                          onClick={handleAnalyzeImage}
                          disabled={analyzingImage}
                          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-marsa-royal bg-marsa-royal px-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#002f6c] disabled:cursor-not-allowed disabled:opacity-70"
                        >
                          {analyzingImage ? (
                            <LoaderCircle size={15} className="animate-spin" />
                          ) : (
                            <ScanLine size={15} />
                          )}
                          {analyzingImage ? 'Analyse...' : "Analyser l'image"}
                        </button>
                        <label
                          htmlFor="container-image"
                          className="inline-flex min-h-9 cursor-pointer items-center rounded-md border border-[#c8d8e8] bg-white px-3 text-xs font-bold text-marsa-royal shadow-sm transition hover:border-marsa-royal hover:bg-[#eef5fb]"
                        >
                          Changer l'image
                        </label>
                        <button
                          type="button"
                          onClick={() => setIsCameraOpen(true)}
                          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#c8d8e8] bg-white px-3 text-xs font-bold text-marsa-royal shadow-sm transition hover:border-marsa-royal hover:bg-[#eef5fb]"
                        >
                          <Camera size={15} />
                          Reprendre avec camera
                        </button>
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
                    <div className="flex min-h-[320px] flex-col items-center justify-center px-4 py-8 text-center">
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
                      <div className="mt-5 flex flex-wrap justify-center gap-2">
                        <label
                          htmlFor="container-image"
                          className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-marsa-royal bg-marsa-royal px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#002f6c]"
                        >
                          <ImagePlus size={16} />
                          Importer une image
                        </label>
                        <button
                          type="button"
                          onClick={() => setIsCameraOpen(true)}
                          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#c8d8e8] bg-white px-4 text-sm font-bold text-marsa-royal shadow-sm transition hover:border-marsa-royal hover:bg-[#eef5fb]"
                        >
                          <Camera size={16} />
                          Utiliser la camera
                        </button>
                      </div>
                    </div>
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

              {visionResult && (
                <VisionResultBoundary
                  resetKey={`${visionResult.detected_iso || ''}-${visionResult.detection_mode || ''}`}
                >
                  <div className="rounded-md border border-[#d8e6f3] bg-[#f8fbff] p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase text-marsa-muted">
                        {!visionResult.detected_iso
                          ? 'Résultat de l’analyse'
                          : currentDetectionTrace.isCorrection
                          ? 'Résultat IA corrigé manuellement'
                          : 'Résultat IA validé'}
                      </p>
                      <p className="mt-1 text-2xl font-bold tracking-wide text-marsa-royal">
                        {visionResult.detected_iso || 'Aucun code ISO détecté'}
                      </p>
                      <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-marsa-muted">
                        <span>
                          Code taille/type :{' '}
                          <span className="font-bold text-marsa-royal">
                            {visionResult.iso_type || 'Non détecté'}
                          </span>
                        </span>
                        {visionResult.iso_type && (
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                              visionResult.is_valid_iso_type_format
                                ? 'bg-[#dcfce7] text-[#047857]'
                                : 'bg-[#fee2e2] text-[#b91c1c]'
                            }`}
                          >
                            {visionResult.is_valid_iso_type_format ? (
                              <CheckCircle2 size={13} />
                            ) : (
                              <AlertCircle size={13} />
                            )}
                            {visionResult.is_valid_iso_type_format
                              ? 'Format valide'
                              : 'Format à vérifier'}
                          </span>
                        )}
                      </p>
                      {visionResult.iso_type_warning && (
                        <p className="mt-1 text-xs font-semibold text-[#a16207]">
                          {visionResult.iso_type_warning}
                        </p>
                      )}
                      {visionResult.raw_ocr_text &&
                        normalizeIso(visionResult.raw_ocr_text) !==
                          normalizeIso(visionResult.detected_iso) && (
                          <p className="mt-1 text-xs text-marsa-muted">
                            Texte OCR brut : {visionResult.raw_ocr_text}
                          </p>
                        )}
                      {currentDetectionTrace.isCorrection && (
                        <p className="mt-1 text-xs font-semibold text-[#a16207]">
                          Matricule final : {normalizeIso(form.matricule_iso)}
                        </p>
                      )}
                      {getDetectionModeLabel(visionResult.detection_mode) && (
                        <span
                          className={`mt-3 inline-flex rounded-full border px-3 py-1 text-xs font-bold ${getDetectionModeClass(
                            visionResult.detection_mode,
                          )}`}
                        >
                          {getDetectionModeLabel(visionResult.detection_mode)}
                        </span>
                      )}
                    </div>
                    <span
                      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold ${getVisionValidationClass(
                        visionResult,
                      )}`}
                    >
                      {visionResult.is_valid_iso ? (
                        <CheckCircle2 size={15} />
                      ) : (
                        <AlertCircle size={15} />
                      )}
                      {getVisionValidationLabel(visionResult)}
                    </span>
                  </div>

                  {visionResult.message && (
                    <p className="mt-3 rounded-md border border-[#d8e6f3] bg-white px-3 py-2 text-sm text-marsa-text">
                      {visionResult.message}
                    </p>
                  )}

                  {visionResult.warning && (
                    <p className="mt-3 rounded-md border border-[#fde68a] bg-[#fffbeb] px-3 py-2 text-xs font-semibold text-[#a16207]">
                      {visionResult.warning}
                    </p>
                  )}

                  {!visionResult.is_valid_check_digit &&
                    visionResult.expected_check_digit && (
                      <p className="mt-3 rounded-md border border-[#fecaca] bg-[#fff5f5] px-3 py-2 text-xs font-semibold text-[#b91c1c]">
                        Chiffre attendu : {visionResult.expected_check_digit}
                      </p>
                    )}

                  {/* Decomposition normee ISO 6346 du matricule (info principale) */}
                  {visionResult.detected_iso && (
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-bold uppercase text-marsa-muted">
                        Décomposition du matricule (ISO 6346)
                      </p>
                      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-md bg-white p-3">
                          <p className="text-xs text-marsa-muted">Propriétaire</p>
                          <p className="mt-1 font-bold text-marsa-royal">
                            {visionResult.owner_code || '-'}
                          </p>
                        </div>
                        <div className="rounded-md bg-white p-3">
                          <p className="text-xs text-marsa-muted">Catégorie</p>
                          <p className="mt-1 font-bold text-marsa-royal">
                            {visionResult.category || '-'}
                          </p>
                        </div>
                        <div className="rounded-md bg-white p-3">
                          <p className="text-xs text-marsa-muted">Numéro série</p>
                          <p className="mt-1 font-bold text-marsa-royal">
                            {visionResult.serial_number || '-'}
                          </p>
                        </div>
                        <div className="rounded-md bg-white p-3">
                          <p className="text-xs text-marsa-muted">Contrôle</p>
                          <p className="mt-1 font-bold text-marsa-royal">
                            {visionResult.check_digit || '-'}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Signification metier du code taille/type (dimensions + type) */}
                  {visionResult.iso_type && (
                    <div className="mt-4">
                      <p className="mb-2 text-xs font-bold uppercase text-marsa-muted">
                        Signification du code taille/type
                      </p>
                      <div className="grid gap-3 text-sm sm:grid-cols-3">
                        <div className="rounded-md bg-white p-3">
                          <p className="text-xs text-marsa-muted">Longueur</p>
                          <p className="mt-1 font-bold text-marsa-royal">
                            {visionResult.iso_type_details?.length_label || 'Non répertoriée'}
                          </p>
                        </div>
                        <div className="rounded-md bg-white p-3">
                          <p className="text-xs text-marsa-muted">Hauteur</p>
                          <p className="mt-1 font-bold text-marsa-royal">
                            {visionResult.iso_type_details?.height_label || 'Non répertoriée'}
                          </p>
                        </div>
                        <div className="rounded-md bg-white p-3">
                          <p className="text-xs text-marsa-muted">Type</p>
                          <p className="mt-1 font-bold text-marsa-royal">
                            {visionResult.iso_type_details?.type_label || 'Non répertorié'}
                          </p>
                        </div>
                      </div>
                      {visionResult.iso_type_details?.requires_power && (
                        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#e0f2fe] px-3 py-1 text-xs font-bold text-[#075985]">
                          ⚡ Température contrôlée — nécessite une alimentation électrique (à brancher)
                        </p>
                      )}
                    </div>
                  )}

                  {/* Details techniques : replies par defaut, non actionnables par l'operateur */}
                  <details className="mt-4 rounded-md border border-[#d8e6f3] bg-white">
                    <summary className="cursor-pointer px-3 py-2 text-xs font-bold uppercase text-marsa-muted">
                      Détails techniques
                    </summary>
                    <div className="grid gap-3 border-t border-[#eef2f7] p-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      <div className="rounded-md border border-[#eef2f7] bg-[#f8fbff] p-3">
                        <p className="text-xs text-marsa-muted">Confiance globale</p>
                        <p className="mt-1 font-bold text-marsa-royal">
                          {Math.round((visionResult.confidence || 0) * 100)} %
                        </p>
                      </div>
                      <div className="rounded-md border border-[#eef2f7] bg-[#f8fbff] p-3">
                        <p className="text-xs text-marsa-muted">Localisation du matricule</p>
                        <p className="mt-1 font-bold text-marsa-royal">
                          {visionResult.yolo_confidence == null
                            ? '-'
                            : `${Math.round(visionResult.yolo_confidence * 100)} %`}
                        </p>
                      </div>
                      <div className="rounded-md border border-[#eef2f7] bg-[#f8fbff] p-3">
                        <p className="text-xs text-marsa-muted">Lecture du matricule</p>
                        <p className="mt-1 font-bold text-marsa-royal">
                          {visionResult.ocr_confidence == null
                            ? '-'
                            : `${Math.round(visionResult.ocr_confidence * 100)} %`}
                        </p>
                      </div>
                      <div className="rounded-md border border-[#eef2f7] bg-[#f8fbff] p-3">
                        <p className="text-xs text-marsa-muted">Localisation du code taille/type</p>
                        <p className="mt-1 font-bold text-marsa-royal">
                          {visionResult.iso_type_yolo_confidence == null
                            ? '-'
                            : `${Math.round(visionResult.iso_type_yolo_confidence * 100)} %`}
                        </p>
                      </div>
                      <div className="rounded-md border border-[#eef2f7] bg-[#f8fbff] p-3">
                        <p className="text-xs text-marsa-muted">Lecture du code taille/type</p>
                        <p className="mt-1 font-bold text-marsa-royal">
                          {visionResult.iso_type_ocr_confidence == null
                            ? '-'
                            : `${Math.round(visionResult.iso_type_ocr_confidence * 100)} %`}
                        </p>
                      </div>
                      <div className="rounded-md border border-[#eef2f7] bg-[#f8fbff] p-3">
                        <p className="text-xs text-marsa-muted">Traitement appliqué</p>
                        <p className="mt-1 font-bold text-marsa-royal">
                          {getProcessingLabel(visionResult.ocr_variant)}
                        </p>
                      </div>
                    </div>
                  </details>
                  </div>
                </VisionResultBoundary>
              )}

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
                <span className="font-bold text-marsa-royal">Vision IA.</span>{' '}
                La Vision IA analyse l’image, extrait les informations du conteneur et vérifie leur conformité. Les valeurs restent modifiables avant enregistrement.
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
            <table className="data-table min-w-[1120px]">
              <thead>
                <tr>
                  <th>Matricule ISO</th>
                  <th className="whitespace-nowrap">Taille/type</th>
                  <th>Mouvement</th>
                  <th>Opération</th>
                  <th>Image</th>
                  <th>Source</th>
                  <th>Confiance IA</th>
                  <th>Saisi par</th>
                  <th className="whitespace-nowrap">Date</th>
                  {canDeleteContainer && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {containers.map((container) => (
                  <tr key={container.id}>
                    <td className="font-bold text-marsa-royal">
                      {container.matricule_iso}
                    </td>
                    <td className="whitespace-nowrap font-semibold text-marsa-royal">
                      {container.iso_type_code || '-'}
                    </td>
                    <td>
                      <StatusBadge value={container.mouvement || 'IMPORT'} />
                    </td>
                    <td>{container.nom_operation}</td>
                    <td>
                      {resolveImageUrl(container.image_url) ? (
                        <ContainerImageViewer
                          imageUrl={resolveImageUrl(container.image_url)}
                          label={container.matricule_iso}
                        />
                      ) : (
                        '-'
                      )}
                    </td>
                    <td>
                      <span
                        className={`inline-flex min-h-7 items-center rounded-full px-3 text-xs font-bold ${getDetectionSourceClass(
                          container.detection_source,
                        )}`}
                      >
                        {getDetectionSourceLabel(container.detection_source)}
                      </span>
                      {container.detection_source === 'IA_CORRIGEE' &&
                        container.detected_iso && (
                          <p className="mt-1 text-xs text-marsa-muted">
                            Détecté : {container.detected_iso}
                          </p>
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
                    <td className="whitespace-nowrap">
                      {formatDateTime(container.created_at)}
                    </td>
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

      {isCameraOpen && (
        <CameraCapture
          onClose={() => setIsCameraOpen(false)}
          onUsePhoto={handleCameraCapture}
        />
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
