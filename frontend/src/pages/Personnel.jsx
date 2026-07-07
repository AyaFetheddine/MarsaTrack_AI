import {
  Ban,
  LoaderCircle,
  Pencil,
  Search,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { getApiErrorMessage, personnelApi } from '../api/api'
import ConfirmDialog from '../components/ConfirmDialog'
import CustomSelect from '../components/CustomSelect'
import Loader from '../components/Loader'
import StatusBadge from '../components/StatusBadge'
import ToastMessage from '../components/ToastMessage'
import useAutoClearMessage from '../hooks/useAutoClearMessage'
import useDebouncedValue from '../hooks/useDebouncedValue'
import { getStoredRole } from '../utils/auth'
import { fieldErrorClass, scrollToFirstError } from '../utils/formValidation'

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

const fonctionLabels = {
  Equipage: 'Équipage',
  Agent_Terrain: 'Agent Terrain',
  Sous_Traitant: 'Sous-Traitant',
}

const disponibiliteLabels = {
  disponible: 'Disponible',
  affecte: 'Affecté',
  indisponible: 'Indisponible',
}

const formatFonction = (value) => fonctionLabels[value] || value
const formatDisponibilite = (value) => disponibiliteLabels[value] || value

const fonctionOptions = fonctions.map((fonction) => ({
  value: fonction,
  label: formatFonction(fonction),
}))

const disponibiliteOptions = disponibilites.map((disponibilite) => ({
  value: disponibilite,
  label: formatDisponibilite(disponibilite),
}))

const fonctionFilterOptions = [
  { value: 'all', label: 'Toutes les fonctions' },
  ...fonctionOptions,
]

const disponibiliteFilterOptions = [
  { value: 'all', label: 'Toutes' },
  ...disponibiliteOptions,
]

const initialForm = {
  matricule: '',
  nom_complet: '',
  fonction: 'Equipage',
  disponibilite: 'disponible',
}

function Personnel() {
  const role = getStoredRole()
  const canManagePersonnel = ['Admin', 'Responsable_Exploitation'].includes(role)
  const formSectionRef = useRef(null)
  const matriculeRef = useRef(null)
  const nomCompletRef = useRef(null)
  const fonctionRef = useRef(null)
  const disponibiliteRef = useRef(null)
  const [personnel, setPersonnel] = useState([])
  const [form, setForm] = useState(initialForm)
  const [editingPersonnelId, setEditingPersonnelId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [actionId, setActionId] = useState(null)
  const [pendingAction, setPendingAction] = useState(null)
  const [highlightForm, setHighlightForm] = useState(false)
  const [error, setError] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [formErrors, setFormErrors] = useState({})
  const [filters, setFilters] = useState({
    search: '',
    fonction: 'all',
    disponibilite: 'all',
  })
  const debouncedSearch = useDebouncedValue(filters.search, 300)

  const filteredPersonnel = useMemo(() => {
    const searchTerm = debouncedSearch.trim().toLowerCase()

    return personnel.filter((member) => {
      const matchesSearch =
        !searchTerm ||
        member.nom_complet.toLowerCase().includes(searchTerm) ||
        member.matricule.toLowerCase().includes(searchTerm)
      const matchesFonction =
        filters.fonction === 'all' || member.fonction === filters.fonction
      const matchesDisponibilite =
        filters.disponibilite === 'all' ||
        member.disponibilite === filters.disponibilite

      return matchesSearch && matchesFonction && matchesDisponibilite
    })
  }, [debouncedSearch, filters, personnel])

  useAutoClearMessage(error, setError, '')
  useAutoClearMessage(feedback, setFeedback)

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
    setFormErrors((current) => ({ ...current, [name]: '' }))
  }

  const handleFilterChange = (event) => {
    const { name, value } = event.target
    setFilters((current) => ({ ...current, [name]: value }))
  }

  const handleCustomFormChange = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }))
    setFormErrors((current) => ({ ...current, [name]: '' }))
  }

  const handleCustomFilterChange = (name, value) => {
    setFilters((current) => ({ ...current, [name]: value }))
  }

  const resetForm = () => {
    setForm(initialForm)
    setEditingPersonnelId(null)
    setFormErrors({})
  }

  const startEdit = (member) => {
    setEditingPersonnelId(member.id)
    setForm({
      matricule: member.matricule,
      nom_complet: member.nom_complet,
      fonction: member.fonction,
      disponibilite: member.disponibilite,
    })
    setFeedback(null)
    setHighlightForm(true)
    window.requestAnimationFrame(() => {
      formSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    })
  }

  useEffect(() => {
    if (!highlightForm) return undefined

    const timeoutId = window.setTimeout(() => {
      setHighlightForm(false)
    }, 1400)

    return () => window.clearTimeout(timeoutId)
  }, [highlightForm])

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFeedback(null)

    const errors = {}

    if (!form.matricule.trim()) {
      errors.matricule = 'Le matricule est obligatoire.'
    }

    if (!form.nom_complet.trim()) {
      errors.nom_complet = 'Le nom complet est obligatoire.'
    }

    if (!form.fonction) {
      errors.fonction = 'La fonction est obligatoire.'
    }

    if (!form.disponibilite) {
      errors.disponibilite = 'La disponibilité est obligatoire.'
    }

    setFormErrors(errors)

    if (Object.keys(errors).length > 0) {
      scrollToFirstError(errors, {
        matricule: matriculeRef,
        nom_complet: nomCompletRef,
        fonction: fonctionRef,
        disponibilite: disponibiliteRef,
      })
      return
    }

    setSubmitting(true)

    try {
      if (editingPersonnelId) {
        await personnelApi.update(editingPersonnelId, form)
      } else {
        await personnelApi.create(form)
      }

      resetForm()
      await refreshPersonnel()
      setFeedback({
        type: 'success',
        message: editingPersonnelId
          ? 'Personnel modifié avec succès.'
          : 'Personnel ajouté avec succès.',
      })
    } catch (requestError) {
      setFeedback({
        type: 'error',
        message: getApiErrorMessage(
          requestError,
          editingPersonnelId
            ? 'Impossible de modifier ce personnel.'
            : 'Impossible d\'ajouter ce personnel.',
        ),
      })
    } finally {
      setSubmitting(false)
    }
  }

  const requestDisable = (member) => {
    setPendingAction({
      member,
      type: 'disable',
    })
  }

  const requestDelete = (member) => {
    setPendingAction({
      member,
      type: 'delete',
    })
  }

  const closeConfirmDialog = () => {
    if (actionId) return
    setPendingAction(null)
  }

  const confirmPendingAction = async () => {
    if (!pendingAction) return

    const { member, type } = pendingAction

    setActionId(member.id)
    setFeedback(null)

    try {
      if (type === 'disable') {
        await personnelApi.disable(member.id)
      } else {
        await personnelApi.remove(member.id)
        if (editingPersonnelId === member.id) {
          resetForm()
        }
      }

      await refreshPersonnel()
      setFeedback({
        type: 'success',
        message:
          type === 'disable'
            ? 'Personnel désactivé avec succès.'
            : 'Personnel supprimé avec succès.',
      })
    } catch (requestError) {
      setFeedback({
        type: 'error',
        message: getApiErrorMessage(
          requestError,
          type === 'disable'
            ? 'Impossible de désactiver ce personnel.'
            : 'Impossible de supprimer ce personnel.',
        ),
      })
    } finally {
      setActionId(null)
      setPendingAction(null)
    }
  }

  const confirmationContent = pendingAction
    ? {
        confirmLabel:
          pendingAction.type === 'disable' ? 'Désactiver' : 'Supprimer',
        description:
          pendingAction.type === 'disable'
            ? `${pendingAction.member.nom_complet} ne sera plus proposé dans les affectations. Son historique restera conservé.`
            : `${pendingAction.member.nom_complet} sera supprimé uniquement s'il n'est affecté à aucune opération.`,
        title:
          pendingAction.type === 'disable'
            ? 'Désactiver ce personnel ?'
            : 'Supprimer ce personnel ?',
        tone: pendingAction.type === 'disable' ? 'warning' : 'danger',
      }
    : null

  return (
    <div className="space-y-6">
      <header>
        <h2 className="mb-1 text-2xl font-bold text-marsa-royal">Personnel</h2>
        <p className="text-sm text-marsa-muted">
          Gestion du personnel opérationnel affectable aux opérations.
        </p>
      </header>

      {(error || feedback) && (
        <ToastMessage
          message={feedback || error}
          onClose={() => {
            setFeedback(null)
            setError('')
          }}
        />
      )}

      {canManagePersonnel ? (
        <section
          ref={formSectionRef}
          className={`scroll-mt-24 page-card transition duration-500 ${
            highlightForm
              ? 'border-marsa-ciel ring-4 ring-marsa-ciel/20'
              : ''
          }`}
        >
          <div className="mb-5">
            <h3 className="font-bold text-marsa-royal">
              {editingPersonnelId ? 'Modifier un personnel' : 'Ajouter du personnel'}
            </h3>
            <p className="mt-1 text-sm text-marsa-muted">
              {editingPersonnelId
                ? 'Corrigez les informations du personnel opérationnel.'
                : 'Créez une ressource terrain affectable sans compte de connexion.'}
            </p>
          </div>

          <form
            className="grid items-end gap-4 lg:grid-cols-[minmax(150px,0.7fr)_minmax(220px,1fr)_minmax(160px,0.7fr)_minmax(160px,0.7fr)_auto]"
            onSubmit={handleSubmit}
            noValidate
          >
            <div>
              <label className="form-label" htmlFor="matricule">
                Matricule
              </label>
              <input
                ref={matriculeRef}
                id="matricule"
                name="matricule"
                value={form.matricule}
                onChange={handleChange}
                className={`form-control ${fieldErrorClass(formErrors.matricule)}`}
                placeholder="Ex. EQP-003"
              />
              {formErrors.matricule && (
                <p className="mt-1.5 text-xs font-semibold text-[#b71c1c]">
                  {formErrors.matricule}
                </p>
              )}
            </div>

            <div>
              <label className="form-label" htmlFor="nom_complet">
                Nom complet
              </label>
              <input
                ref={nomCompletRef}
                id="nom_complet"
                name="nom_complet"
                value={form.nom_complet}
                onChange={handleChange}
                className={`form-control ${fieldErrorClass(formErrors.nom_complet)}`}
                placeholder="Nom du personnel"
              />
              {formErrors.nom_complet && (
                <p className="mt-1.5 text-xs font-semibold text-[#b71c1c]">
                  {formErrors.nom_complet}
                </p>
              )}
            </div>
            <div ref={fonctionRef}>
              <CustomSelect
                label="Fonction"
                value={form.fonction}
                onChange={(value) => handleCustomFormChange('fonction', value)}
                options={fonctionOptions}
                error={formErrors.fonction}
              />
            </div>
            <div ref={disponibiliteRef}>
              <CustomSelect
                label={'Disponibilit\u00e9'}
                value={form.disponibilite}
                onChange={(value) => handleCustomFormChange('disponibilite', value)}
                options={disponibiliteOptions}
                error={formErrors.disponibilite}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" className="primary-button" disabled={submitting}>
                {submitting ? (
                  <LoaderCircle size={18} className="animate-spin" />
                ) : editingPersonnelId ? (
                  <Pencil size={18} />
                ) : (
                  <UserPlus size={18} />
                )}
                {submitting
                  ? 'Enregistrement...'
                  : editingPersonnelId
                    ? 'Enregistrer les modifications'
                    : 'Ajouter'}
              </button>

              {editingPersonnelId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#c8d8e8] px-4 text-sm font-bold text-marsa-royal transition hover:border-marsa-royal hover:bg-[#eef5fb]"
                >
                  <X size={17} />
                  Annuler la modification
                </button>
              )}
            </div>
          </form>
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
          <h3 className="font-bold text-marsa-royal">Personnel affectable</h3>
          <p className="mt-1 text-sm text-marsa-muted">
            {loading
              ? 'Chargement en cours'
              : `${filteredPersonnel.length} résultat(s)`}
          </p>
        </div>

        {loading ? (
          <Loader label="Chargement du personnel..." />
        ) : personnel.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-marsa-muted">
            Aucun personnel disponible pour l'instant.
          </div>
        ) : (
          <>
            <div className="grid gap-3 border-b border-marsa-border bg-white px-5 py-4 sm:px-6 lg:grid-cols-[minmax(240px,1fr)_220px_220px]">
              <div>
                <label className="form-label" htmlFor="personnel-search">
                  Recherche
                </label>
                <div className="relative">
                  <Search
                    size={17}
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7f9db9]"
                    aria-hidden="true"
                  />
                  <input
                    id="personnel-search"
                    name="search"
                    value={filters.search}
                    onChange={handleFilterChange}
                    className="form-control pl-10"
                    placeholder="Rechercher par nom ou matricule..."
                  />
                </div>
              </div>
              <CustomSelect
                label="Fonction"
                value={filters.fonction}
                onChange={(value) => handleCustomFilterChange('fonction', value)}
                options={fonctionFilterOptions}
              />
              <CustomSelect
                label={'Disponibilit\u00e9'}
                value={filters.disponibilite}
                onChange={(value) => handleCustomFilterChange('disponibilite', value)}
                options={disponibiliteFilterOptions}
              />
            </div>

            {filteredPersonnel.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-marsa-muted">
                Aucun personnel ne correspond à votre recherche.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table min-w-[900px]">
                  <thead>
                    <tr>
                      <th>Matricule</th>
                      <th>Nom complet</th>
                      <th>Fonction</th>
                      <th>Disponibilité</th>
                      {canManagePersonnel && <th>Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPersonnel.map((member) => {
                      const isBusy = actionId === member.id
                      const isInactive = member.disponibilite === 'indisponible'

                      return (
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
                          {canManagePersonnel && (
                            <td>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => startEdit(member)}
                                  className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[#c8d8e8] px-3 text-xs font-bold text-marsa-royal transition hover:border-marsa-royal hover:bg-[#eef5fb]"
                                >
                                  <Pencil size={14} />
                                  Modifier
                                </button>
                                {!isInactive && (
                                  <button
                                    type="button"
                                    onClick={() => requestDisable(member)}
                                    disabled={isBusy}
                                    className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[#f0d0b8] px-3 text-xs font-bold text-[#b45309] transition hover:border-[#b45309] hover:bg-[#fff7ed] disabled:opacity-60"
                                  >
                                    {isBusy ? (
                                      <LoaderCircle size={14} className="animate-spin" />
                                    ) : (
                                      <Ban size={14} />
                                    )}
                                    Désactiver
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => requestDelete(member)}
                                  disabled={isBusy}
                                  className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[#f3b4b4] px-3 text-xs font-bold text-[#b91c1c] transition hover:border-[#b91c1c] hover:bg-[#fff1f2] disabled:opacity-60"
                                >
                                  {isBusy ? (
                                    <LoaderCircle size={14} className="animate-spin" />
                                  ) : (
                                    <Trash2 size={14} />
                                  )}
                                  Supprimer
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      {confirmationContent && (
        <ConfirmDialog
          confirmLabel={confirmationContent.confirmLabel}
          description={confirmationContent.description}
          isLoading={Boolean(actionId)}
          onCancel={closeConfirmDialog}
          onConfirm={confirmPendingAction}
          title={confirmationContent.title}
          tone={confirmationContent.tone}
        />
      )}
    </div>
  )
}

export default Personnel
