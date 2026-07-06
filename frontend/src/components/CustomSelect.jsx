import { ChevronDown } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'

function CustomSelect({
  label,
  value,
  onChange,
  options,
  placeholder = 'Sélectionner',
  disabled = false,
  error,
  className = '',
}) {
  const id = useId()
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const selectedOption = options.find((option) => option.value === value)

  useEffect(() => {
    if (!open) return undefined

    const handleOutsideClick = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false)
      }
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const handleSelect = (optionValue) => {
    onChange(optionValue)
    setOpen(false)
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {label && (
        <label id={`${id}-label`} className="form-label">
          {label}
        </label>
      )}

      <button
        type="button"
        disabled={disabled}
        aria-labelledby={label ? `${id}-label` : undefined}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setOpen((current) => !current)
          }
        }}
        className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border bg-white px-3.5 py-2.5 text-left text-sm text-marsa-text transition disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-marsa-muted ${
          open
            ? 'border-marsa-ciel ring-2 ring-marsa-ciel'
            : 'border-slate-200 hover:border-[#b8cbe0]'
        } ${error ? 'border-[#ef9a9a]' : ''}`}
      >
        <span
          className={`min-w-0 truncate ${
            selectedOption ? 'text-marsa-text' : 'text-[#8aa3bd]'
          }`}
        >
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={`shrink-0 text-marsa-muted transition ${
            open ? 'rotate-180 text-marsa-ciel' : ''
          }`}
        />
      </button>

      {error && (
        <p className="mt-1.5 text-xs font-semibold text-[#b71c1c]">
          {error}
        </p>
      )}

      {open && !disabled && (
        <div className="absolute left-0 right-0 z-50 mt-2 max-h-72 overflow-y-auto rounded-xl border border-slate-100 bg-white py-1.5 shadow-xl">
          <ul role="listbox" aria-labelledby={label ? `${id}-label` : undefined}>
            {options.map((option) => {
              const selected = option.value === value

              return (
                <li key={option.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => handleSelect(option.value)}
                    className={`flex w-full items-center px-3.5 py-2.5 text-left text-sm transition hover:bg-marsa-bg ${
                      selected
                        ? 'font-semibold text-marsa-royal'
                        : 'text-marsa-text'
                    }`}
                  >
                    <span className="min-w-0">{option.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

export default CustomSelect
