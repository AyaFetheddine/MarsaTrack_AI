import { useEffect } from 'react'

function useAutoClearMessage(message, clearMessage, clearValue = null) {
  useEffect(() => {
    if (!message) return undefined

    const messageType = typeof message === 'object' ? message.type : 'error'
    const timeoutId = window.setTimeout(
      () => clearMessage(clearValue),
      messageType === 'success' ? 5000 : 6000,
    )

    return () => window.clearTimeout(timeoutId)
  }, [clearMessage, clearValue, message])
}

export default useAutoClearMessage
