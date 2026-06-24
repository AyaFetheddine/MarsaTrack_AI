import { CircleAlert, CircleCheck } from 'lucide-react'

function FeedbackMessage({ type = 'error', children }) {
  const isSuccess = type === 'success'
  const Icon = isSuccess ? CircleCheck : CircleAlert

  return (
    <div
      className={`flex items-start gap-2.5 rounded-md border px-3.5 py-3 text-sm ${
        isSuccess
          ? 'border-[#a5d6a7] bg-[#eef9f2] text-[#207245]'
          : 'border-[#ffcdd2] bg-[#fff2f2] text-[#b71c1c]'
      }`}
      role={isSuccess ? 'status' : 'alert'}
    >
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  )
}

export default FeedbackMessage
