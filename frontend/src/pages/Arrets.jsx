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
import useAutoClearMessage from '../hooks/useAutoClearMessage'
import { getStoredRole } from '../utils/auth'

const arretOptions = [
  { code: '1', libelle: 'Mouvements des engins de levage' },
  { code: '3', libelle: 'Panne des engins de levage' },
  { code: '10', libelle: 'Arrêt non justifié du grutier' },
  { code: '11', libelle: 'Grève du personnel Marsa Maroc + Sous-traitant' },
  { code: '12', libelle: 'Changement accessoires de manutention' },
  { code: '13', libelle: 'Panne des équipements chargeur/réceptionnaire' },
  { code: '78', libelle: 'Durée import' },
  { code: '79', libelle: 'Durée export' },
]

const initialForm = {
  operation_id: '',
  code_arret: '',
}

const formatDateTime = (value) => {
  if (!value) return '-'

  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value))
}

function Arrets() {
  const role = getStoredRole()
  const canManageArrets = ['Admin', 'Chef_Equipe'].includes(role)
  const [operations, setOperations] = useState([])
  const [arrets, setArrets] = useState([])
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [closingId, setClosingId] = useState(null)
  const [feedback, setFeedback] = useState(null)

  useAutoClearMessage(feedback, setFeedback)

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
            'Impossible de charger les arrêts de travail.',
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

    const selectedArret = arretOptions.find(
      (option) => option.code === form.code_arret,
    )

    if (!selectedArret) {
      setSubmitting(false)
      setFeedback({
        type: 'error',
        message: 'Sélectionnez un type d\'arrêt valide.',
      })
      return
    }

    try {
      await arretsApi.create({
        operation_id: Number(form.operation_id),
        code_arret: selectedArret.code,
        libelle_arret: selectedArret.libelle,
      })
      setForm(initialForm)
      await refreshArrets()
      setFeedback({
        type: 'success',
        message: 'Arrêt de travail déclaré avec succès.',
      })
    } catch (requestError) {
      setFeedback({
        type: 'error',
        message: getApiErrorMessage(
          requestError,
          'Impossible de déclarer l\'arrêt de travail.',
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
        message: 'Arrêt de travail clôturé avec succès.',
      })
    } catch (requestError) {
      setFeedback({
        type: 'error',
        message: getApiErrorMessage(
          requestError,
          'Impossible de clôturer l\'arrêt de travail.',
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
          Arrêts de travail
        </h2>
        <p className="text-sm text-marsa-muted">
          Déclaration et suivi des interruptions terrain.
        </p>
      </header>

      {feedback && (
        <FeedbackMessage type={feedback.type}>{feedback.message}</FeedbackMessage>
      )}

      {canManageArrets ? (
        <section className="page-card">
          <div className="mb-5">
            <h3 className="font-bold text-marsa-royal">Déclarer un arrêt</h3>
            <p className="mt-1 text-sm text-marsa-muted">
              Sélectionnez le type d'arrêt d'exploitation constaté sur le
              terrain.
            </p>
          </div>

          {loading ? (
            <Loader label="Chargement des opérations..." />
          ) : (
            <form
              className="grid items-end gap-4 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.9fr)_auto]"
              onSubmit={handleSubmit}
            >
              <div>
                <label className="form-label" htmlFor="arret-operation">
                  Opération
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
                  <option value="">Sélectionner une opération</option>
                  {operations.map((operation) => (
                    <option key={operation.id} value={operation.id}>
                      {operation.nom_operation} - {operation.shift}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="form-label" htmlFor="code_arret">
                  Type d'arrêt
                </label>
                <select
                  id="code_arret"
                  name="code_arret"
                  value={form.code_arret}
                  onChange={handleChange}
                  className="form-control"
                  required
                >
                  <option value="">Sélectionner un code arrêt</option>
                  {arretOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.code} - {option.libelle}
                    </option>
                  ))}
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
                {submitting ? 'Déclaration...' : 'Déclarer'}
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
          <h3 className="font-bold text-marsa-royal">Historique des arrêts</h3>
          <p className="mt-1 text-sm text-marsa-muted">
            {loading ? 'Chargement en cours' : `${arrets.length} arrêt(s)`}
          </p>
        </div>

        {loading ? (
          <Loader label="Chargement des arrêts..." />
        ) : arrets.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-marsa-muted">
            Aucun arrêt de travail enregistré.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[1180px]">
              <thead>
                <tr>
                  <th>Opération</th>
                  <th>Code</th>
                  <th>Libellé arrêt</th>
                  <th>Début</th>
                  <th>Fin</th>
                  <th>Statut</th>
                  <th>Déclaré par</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {arrets.map((arret) => (
                  <tr key={arret.id}>
                    <td className="font-semibold text-marsa-text">
                      {arret.nom_operation}
                    </td>
                    <td>{arret.code_arret || '-'}</td>
                    <td>{arret.libelle_arret || arret.cause || '-'}</td>
                    <td>{formatDateTime(arret.heure_debut)}</td>
                    <td>{formatDateTime(arret.heure_fin)}</td>
                    <td>
                      <StatusBadge value={arret.statut} />
                    </td>
                    <td>
                      {arret.declarant_nom_complet ||
                        arret.declarant_matricule ||
                        'Non renseigné'}
                    </td>
                    <td>
                      {arret.statut === 'en cours' && canManageArrets ? (
                        <button
                          type="button"
                          onClick={() => handleClose(arret.id)}
                          disabled={closingId === arret.id}
                          className="inline-flex min-h-9 items-center gap-2 rounded-md border border-[#c8d8e8] px-3 text-xs font-bold text-marsa-royal transition hover:border-marsa-royal hover:bg-marsa-royal hover:text-white disabled:opacity-60"
                        >
                          {closingId === arret.id && (
                            <LoaderCircle size={15} className="animate-spin" />
                          )}
                          {closingId === arret.id ? 'Clôture...' : 'Clôturer'}
                        </button>
                      ) : arret.statut === 'en cours' ? (
                        <span className="text-xs text-marsa-muted">
                          Consultation
                        </span>
                      ) : (
                        <span className="text-xs text-marsa-muted">Terminé</span>
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
