function StatusBadge({ value }) {
  const normalizedValue = value?.toLowerCase()

  const styles = {
    'en cours': 'bg-[#e8f4fd] text-[#0055b3]',
    cloturee: 'bg-[#e0f7ee] text-[#00703c]',
    cloture: 'bg-[#e0f7ee] text-[#00703c]',
    annulee: 'bg-[#fff6df] text-[#9c6500]',
    Portiqueur: 'bg-[#e8f4fd] text-[#0055b3]',
    Equipage: 'bg-[#eef2f6] text-[#4a6582]',
    Admin: 'bg-[#e0f7ee] text-[#00703c]',
    Responsable_Exploitation: 'bg-[#e8f4fd] text-[#0055b3]',
    Conducteur: 'bg-[#fff6df] text-[#9c6500]',
    Pointeur: 'bg-[#f0e9ff] text-[#5a32a3]',
    Agent_Terrain: 'bg-[#e5f7fb] text-[#00799c]',
    Sous_Traitant: 'bg-[#fff1e8] text-[#c45a12]',
    Autre: 'bg-[#eef2f6] text-[#4a6582]',
    IMPORT: 'bg-[#e8f4fd] text-[#0055b3]',
    EXPORT: 'bg-[#fff6df] text-[#9c6500]',
    CHARGEMENT: 'bg-[#e8f4fd] text-[#0055b3]',
    DECHARGEMENT: 'bg-[#fff6df] text-[#9c6500]',
    MANUTENTION: 'bg-[#eef2f6] text-[#4a6582]',
    disponible: 'bg-[#e0f7ee] text-[#00703c]',
    affecte: 'bg-[#e8f4fd] text-[#0055b3]',
    indisponible: 'bg-[#fff2f2] text-[#b71c1c]',
  }

  const labels = {
    cloturee: 'Clôturée',
    cloture: 'Clôturé',
    annulee: 'Annulée',
    Responsable_Exploitation: 'Responsable Exploitation',
    Chef_Services: 'Chef Services',
    Chef_Equipe: 'Chef Équipe',
    Equipage: 'Équipage',
    Agent_Terrain: 'Agent Terrain',
    Sous_Traitant: 'Sous-Traitant',
    IMPORT: 'Import',
    EXPORT: 'Export',
    CHARGEMENT: 'Chargement',
    DECHARGEMENT: 'Déchargement',
    MANUTENTION: 'Manutention',
    disponible: 'Disponible',
    affecte: 'Affecté',
    indisponible: 'Indisponible',
  }

  return (
    <span
      className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${
        styles[value] || styles[normalizedValue] || 'bg-[#eef2f6] text-[#4a6582]'
      }`}
    >
      {labels[value] || value}
    </span>
  )
}

export default StatusBadge
