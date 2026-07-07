import { useEffect } from 'react'

function useAutoClearMessage(
  message,
  clearMessage,
  clearValue = null,
  options = {},
) {
  useEffect(() => {
    if (!message) return undefined

    const messageType = typeof message === 'object' ? message.type : 'error'
    const successDuration = options.successDuration ?? 5000
    const errorDuration = options.errorDuration ?? 6000
    const timeoutId = window.setTimeout(
      () => clearMessage(clearValue),
      messageType === 'success' ? successDuration : errorDuration,
    )

    return () => window.clearTimeout(timeoutId)
  }, [
    clearMessage,
    clearValue,
    message,
    options.errorDuration,
    options.successDuration,
  ])
}

export default useAutoClearMessage
