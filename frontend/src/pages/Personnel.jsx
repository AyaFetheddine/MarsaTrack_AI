import { useEffect, useState } from 'react'
import { usersApi, getApiErrorMessage } from '../api/api'
import FeedbackMessage from '../components/FeedbackMessage'
import Loader from '../components/Loader'
import StatusBadge from '../components/StatusBadge'

function Personnel() {
  const [personnel, setPersonnel] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const loadPersonnel = async () => {
      try {
        const response = await usersApi.personnel()
        setPersonnel(response.data.data || [])
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

  return (
    <div className="space-y-6">
      <header>
        <h2 className="mb-1 text-2xl font-bold text-marsa-royal">Personnel</h2>
        <p className="text-sm text-marsa-muted">
          Consultation des portiqueurs et membres d'equipage disponibles.
        </p>
      </header>

      {error && <FeedbackMessage>{error}</FeedbackMessage>}

      <section className="page-card overflow-hidden p-0 sm:p-0">
        <div className="border-b border-marsa-border px-5 py-4 sm:px-6">
          <h3 className="font-bold text-marsa-royal">Personnel affectable</h3>
          <p className="mt-1 text-sm text-marsa-muted">
            {loading ? 'Chargement en cours' : `${personnel.length} membre(s)`}
          </p>
        </div>

        {loading ? (
          <Loader label="Chargement du personnel..." />
        ) : personnel.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-marsa-muted">
            Aucun portiqueur ou membre d'equipage disponible.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nom complet</th>
                  <th>Matricule</th>
                  <th>Role</th>
                </tr>
              </thead>
              <tbody>
                {personnel.map((member) => (
                  <tr key={member.id}>
                    <td className="font-semibold text-marsa-text">
                      {member.nom_complet}
                    </td>
                    <td>{member.matricule}</td>
                    <td>
                      <StatusBadge value={member.role} />
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

export default Personnel
