export const fieldErrorClass = (message) =>
  message
    ? 'border-[#ef9a9a] bg-[#fffafa] focus:border-[#b91c1c] focus:ring-[#fecaca]'
    : ''

export const scrollToFirstError = (errors, fieldRefs) => {
  const firstField = Object.keys(errors).find((field) => errors[field])
  const target = fieldRefs[firstField]?.current

  if (!target) return

  target.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  })

  window.setTimeout(() => {
    const focusTarget =
      typeof target.matches === 'function' &&
      target.matches('input, select, textarea, button')
        ? target
        : target.querySelector?.('input, select, textarea, button')

    focusTarget?.focus?.({ preventScroll: true })
  }, 300)
}
