import { ClipboardCheck, LoaderCircle, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import {
  getApiErrorMessage,
  operationsApi,
  personnelApi,
} from '../api/api'
import FeedbackMessage from '../components/FeedbackMessage'
import CustomSelect from '../components/CustomSelect'
import Loader from '../components/Loader'
import StatusBadge from '../components/StatusBadge'
import useAutoClearMessage from '../hooks/useAutoClearMessage'
import { getStoredRole } from '../utils/auth'

const initialForm = {
  nom_operation: '',
  date_operation: '',
  shift: 'Shift 1',
  vacation: 'Vacation 1',
  equipe: [],
}

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

const shiftOptions = ['Shift 1', 'Shift 2', 'Shift 3'].map((shift) => ({
  value: shift,
  label: shift,
}))

const vacationOptions = ['Vacation 1', 'Vacation 2'].map((vacation) => ({
  value: vacation,
  label: vacation,
}))

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
  const canCreateOperation = [
    'Admin',
    'Responsable_Exploitation',
    'Chef_Equipe',
  ].includes(role)
  const canCloseOperation = ['Admin', 'Chef_Services'].includes(role)
  const [operations, setOperations] = useState([])
  const [personnel, setPersonnel] = useState([])
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [closingId, setClosingId] = useState(null)
  const [pageError, setPageError] = useState('')
  const [feedback, setFeedback] = useState(null)
  const [personnelFilters, setPersonnelFilters] = useState({
    search: '',
    fonction: 'all',
    disponibilite: 'disponible',
  })

  useAutoClearMessage(pageError, setPageError, '')
  useAutoClearMessage(feedback, setFeedback)

  const selectedPersonnel = useMemo(
    () => personnel.filter((member) => form.equipe.includes(member.id)),
    [form.equipe, personnel],
  )

  const filteredPersonnel = useMemo(() => {
    const searchTerm = personnelFilters.search.trim().toLowerCase()

    return personnel.filter((member) => {
      const matchesSearch =
        !searchTerm ||
        member.nom_complet.toLowerCase().includes(searchTerm) ||
        member.matricule.toLowerCase().includes(searchTerm)
      const matchesFonction =
        personnelFilters.fonction === 'all' ||
        member.fonction === personnelFilters.fonction
      const matchesDisponibilite =
        personnelFilters.disponibilite === 'all' ||
        member.disponibilite === personnelFilters.disponibilite

      return matchesSearch && matchesFonction && matchesDisponibilite
    })
  }, [personnel, personnelFilters])

  const refreshOperations = async () => {
    const response = await operationsApi.list()
    setOperations(response.data.data || [])
  }

  useEffect(() => {
    const loadPage = async () => {
      try {
        const [operationsResponse, personnelResponse] = await Promise.all([
          operationsApi.list(),
          canCreateOperation ? personnelApi.list() : Promise.resolve(null),
        ])

        setOperations(operationsResponse.data.data || [])
        setPersonnel(personnelResponse?.data.data || [])
      } catch (requestError) {
        setPageError(
          getApiErrorMessage(
            requestError,
            'Impossible de charger les données des opérations.',
          ),
        )
      } finally {
        setLoading(false)
      }
    }

    loadPage()
  }, [canCreateOperation])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleCustomChange = (name, value) => {
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleCustomPersonnelFilterChange = (name, value) => {
    setPersonnelFilters((current) => ({ ...current, [name]: value }))
  }

  const toggleMember = (personnelId) => {
    const member = personnel.find((person) => person.id === personnelId)

    if (member && member.disponibilite !== 'disponible') {
      return
    }

    setForm((current) => ({
      ...current,
      equipe: current.equipe.includes(personnelId)
        ? current.equipe.filter((id) => id !== personnelId)
        : [...current.equipe, personnelId],
    }))
  }

  const removeMember = (personnelId) => {
    setForm((current) => ({
      ...current,
      equipe: current.equipe.filter((id) => id !== personnelId),
    }))
  }

  const handlePersonnelFilterChange = (event) => {
    const { name, value } = event.target
    setPersonnelFilters((current) => ({ ...current, [name]: value }))
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
        message: 'Opération créée et personnel affecté avec succès.',
      })
    } catch (requestError) {
      setFeedback({
        type: 'error',
        message: getApiErrorMessage(
          requestError,
          'Impossible de créer l\'opération.',
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
        message: 'Opération clôturée avec succès.',
      })
    } catch (requestError) {
      setFeedback({
        type: 'error',
        message: getApiErrorMessage(
          requestError,
          'Impossible de clôturer l\'opération.',
        ),
      })
    } finally {
      setClosingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h2 className="mb-1 text-2xl font-bold text-marsa-royal">Opérations</h2>
        <p className="text-sm text-marsa-muted">
          Création, affectation du personnel et suivi des opérations portuaires.
        </p>
      </header>

      {pageError && <FeedbackMessage>{pageError}</FeedbackMessage>}
      {feedback && (
        <FeedbackMessage type={feedback.type}>{feedback.message}</FeedbackMessage>
      )}

      {canCreateOperation ? (
        <section className="page-card">
        <div className="mb-5">
          <h3 className="font-bold text-marsa-royal">Nouvelle opération</h3>
          <p className="mt-1 text-sm text-marsa-muted">
            Sélectionnez le personnel opérationnel nécessaire à cette opération.
          </p>
        </div>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="md:col-span-2 xl:col-span-1">
              <label className="form-label" htmlFor="nom_operation">
                Nom de l'opération
              </label>
              <input
                id="nom_operation"
                name="nom_operation"
                value={form.nom_operation}
                onChange={handleChange}
                className="form-control"
                placeholder="Ex. Déchargement - Quai 5"
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
            <CustomSelect
              label="Shift"
              value={form.shift}
              onChange={(value) => handleCustomChange('shift', value)}
              options={shiftOptions}
            />
            <CustomSelect
              label="Vacation"
              value={form.vacation}
              onChange={(value) => handleCustomChange('vacation', value)}
              options={vacationOptions}
            />
          </div>

          <fieldset>
            <legend className="form-label">Personnel affecté à l'opération</legend>
            {personnel.length === 0 ? (
              <div className="rounded-md border border-dashed border-[#c0d5e8] bg-[#f5f9fd] p-4 text-sm text-marsa-muted">
                Aucun personnel disponible pour l'instant.
              </div>
            ) : (
              <div className="space-y-4 rounded-md border border-marsa-border bg-[#f8fbff] p-3">
                <div>
                  <p className="mb-2 text-sm font-bold text-marsa-royal">
                    Personnel sélectionné
                  </p>
                  {selectedPersonnel.length === 0 ? (
                    <p className="rounded-md border border-dashed border-[#c0d5e8] bg-white px-3 py-2 text-sm text-marsa-muted">
                      Votre sélection est vide.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {selectedPersonnel.map((member) => (
                        <span
                          key={member.id}
                          className="inline-flex max-w-full items-center gap-2 rounded-full border border-[#c8d8e8] bg-white px-3 py-1.5 text-xs font-semibold text-marsa-text"
                        >
                          <span className="truncate">
                            {member.nom_complet} - {member.matricule} - {formatFonction(member.fonction)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeMember(member.id)}
                            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] text-marsa-muted transition hover:bg-[#e8f1fb] hover:text-marsa-royal"
                            aria-label={`Retirer ${member.nom_complet}`}
                            title="Retirer"
                          >
                            <X size={13} aria-hidden="true" />
                            Retirer
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_200px_200px]">
                  <div>
                    <label className="form-label" htmlFor="operation-personnel-search">
                      Recherche
                    </label>
                    <div className="relative">
                      <Search
                        size={17}
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#7f9db9]"
                        aria-hidden="true"
                      />
                      <input
                        id="operation-personnel-search"
                        name="search"
                        value={personnelFilters.search}
                        onChange={handlePersonnelFilterChange}
                        className="form-control pl-10"
                        placeholder="Rechercher personnel..."
                      />
                    </div>
                  </div>
                  <CustomSelect
                    label="Fonction"
                    value={personnelFilters.fonction}
                    onChange={(value) =>
                      handleCustomPersonnelFilterChange('fonction', value)
                    }
                    options={fonctionFilterOptions}
                  />
                  <CustomSelect
                    label={'Disponibilit\u00e9'}
                    value={personnelFilters.disponibilite}
                    onChange={(value) =>
                      handleCustomPersonnelFilterChange('disponibilite', value)
                    }
                    options={disponibiliteFilterOptions}
                  />
                </div>

                {filteredPersonnel.length === 0 ? (
                  <div className="rounded-md border border-dashed border-[#c0d5e8] bg-white px-3 py-4 text-center text-sm text-marsa-muted">
                    {personnelFilters.disponibilite === 'disponible'
                      ? 'Aucun personnel disponible pour l\'instant.'
                      : 'Aucun personnel ne correspond à votre recherche.'}
                  </div>
                ) : (
                  <div className="grid max-h-64 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredPersonnel.map((member) => {
                      const isSelectable = member.disponibilite === 'disponible'

                      return (
                        <label
                          key={member.id}
                          className={`flex items-center gap-3 rounded-md border border-transparent bg-white px-3 py-2.5 text-sm transition ${
                            isSelectable
                              ? 'cursor-pointer hover:border-[#c8d8e8]'
                              : 'cursor-not-allowed opacity-60'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={form.equipe.includes(member.id)}
                            onChange={() => toggleMember(member.id)}
                            disabled={!isSelectable}
                            className="h-4 w-4 accent-marsa-royal disabled:cursor-not-allowed"
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-marsa-text">
                              {member.nom_complet}
                            </span>
                            <span className="text-xs text-marsa-muted">
                              {member.matricule} - {formatFonction(member.fonction)} - {formatDisponibilite(member.disponibilite)}
                            </span>
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </fieldset>

          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting ? (
              <LoaderCircle size={18} className="animate-spin" />
            ) : (
              <ClipboardCheck size={18} />
            )}
            {submitting ? 'Création...' : 'Créer l\'opération'}
          </button>
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
          <h3 className="font-bold text-marsa-royal">Liste des opérations</h3>
          <p className="mt-1 text-sm text-marsa-muted">
            {loading ? 'Chargement en cours' : `${operations.length} opération(s)`}
          </p>
        </div>

        {loading ? (
          <Loader label="Chargement des opérations..." />
        ) : operations.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-marsa-muted">
            Aucune opération enregistrée.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[900px]">
              <thead>
                <tr>
                  <th>Nom opération</th>
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
                          {closingId === operation.id ? 'Clôture...' : 'Clôturer'}
                        </button>
                      ) : operation.statut === 'en cours' ? (
                        <span className="text-xs text-marsa-muted">
                          Consultation
                        </span>
                      ) : (
                        <span className="text-xs text-marsa-muted">Terminée</span>
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
