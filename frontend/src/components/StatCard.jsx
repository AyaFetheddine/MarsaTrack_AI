function StatCard({ title, value, icon: Icon, accentClass }) {
  return (
    <article className="page-card flex min-h-36 items-start justify-between gap-4">
      <div>
        <p className="mb-3 text-sm font-semibold text-marsa-muted">{title}</p>
        <p className="text-3xl font-bold text-marsa-royal">{value}</p>
      </div>

      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${accentClass}`}>
        <Icon size={22} strokeWidth={2} aria-hidden="true" />
      </div>
    </article>
  )
}

export default StatCard
