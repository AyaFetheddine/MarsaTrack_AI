function StatusBadge({ value }) {
  const normalizedValue = value?.toLowerCase()

  const styles = {
    'en cours': 'bg-[#e8f4fd] text-[#0055b3]',
    cloturee: 'bg-[#e0f7ee] text-[#00703c]',
    cloture: 'bg-[#e0f7ee] text-[#00703c]',
    Portiqueur: 'bg-[#e8f4fd] text-[#0055b3]',
    Equipage: 'bg-[#eef2f6] text-[#4a6582]',
    Admin: 'bg-[#e0f7ee] text-[#00703c]',
    Responsable_Exploitation: 'bg-[#e8f4fd] text-[#0055b3]',
  }

  const labels = {
    cloturee: 'Cloturee',
    cloture: 'Cloture',
    Responsable_Exploitation: 'Responsable Exploitation',
    Chef_Services: 'Chef Services',
    Chef_Escale: 'Chef Escale',
    Chef_Equipe: 'Chef Equipe',
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
