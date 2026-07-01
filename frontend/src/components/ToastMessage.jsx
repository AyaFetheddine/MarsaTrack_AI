import { CircleAlert, CircleCheck, X } from 'lucide-react'

function ToastMessage({ message, onClose }) {
  if (!message) return null

  const type = typeof message === 'object' ? message.type : 'error'
  const content = typeof message === 'object' ? message.message : message
  const isSuccess = type === 'success'
  const Icon = isSuccess ? CircleCheck : CircleAlert

  return (
    <div className="fixed right-5 top-24 z-40 w-[min(420px,calc(100vw-2.5rem))]">
      <div
        className={`flex items-start gap-3 rounded-lg border bg-white p-4 shadow-[0_18px_45px_rgba(13,37,63,0.18)] ${
          isSuccess ? 'border-[#a5d6a7]' : 'border-[#ffcdd2]'
        }`}
        role={isSuccess ? 'status' : 'alert'}
      >
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            isSuccess
              ? 'bg-[#eef9f2] text-[#207245]'
              : 'bg-[#fff2f2] text-[#b71c1c]'
          }`}
        >
          <Icon size={18} aria-hidden="true" />
        </span>
        <p
          className={`min-w-0 flex-1 text-sm font-semibold leading-6 ${
            isSuccess ? 'text-[#207245]' : 'text-[#b71c1c]'
          }`}
        >
          {content}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-marsa-muted transition hover:bg-[#eef5fb] hover:text-marsa-royal"
          aria-label="Fermer la notification"
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

export default ToastMessage
