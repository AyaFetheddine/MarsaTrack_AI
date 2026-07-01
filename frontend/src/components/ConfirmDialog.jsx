import { AlertTriangle, X } from 'lucide-react'

function ConfirmDialog({
  confirmLabel = 'Confirmer',
  description,
  isLoading = false,
  onCancel,
  onConfirm,
  tone = 'warning',
  title,
}) {
  const isDanger = tone === 'danger'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d253f]/35 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md rounded-lg border border-marsa-border bg-white p-5 shadow-[0_24px_70px_rgba(13,37,63,0.22)]">
        <div className="flex items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              isDanger
                ? 'bg-[#fff1f2] text-[#b91c1c]'
                : 'bg-[#fff7ed] text-[#b45309]'
            }`}
          >
            <AlertTriangle size={20} aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h3
              id="confirm-dialog-title"
              className="text-base font-bold text-marsa-royal"
            >
              {title}
            </h3>
            <p className="mt-1 text-sm leading-6 text-marsa-muted">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-marsa-muted transition hover:bg-[#eef5fb] hover:text-marsa-royal disabled:opacity-60"
            aria-label="Fermer"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-[#c8d8e8] px-4 text-sm font-bold text-marsa-royal transition hover:border-marsa-royal hover:bg-[#eef5fb] disabled:opacity-60"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`inline-flex min-h-10 items-center justify-center rounded-md px-4 text-sm font-bold text-white transition disabled:opacity-60 ${
              isDanger
                ? 'bg-[#b91c1c] hover:bg-[#991b1b]'
                : 'bg-[#b45309] hover:bg-[#92400e]'
            }`}
          >
            {isLoading ? 'Traitement...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog
