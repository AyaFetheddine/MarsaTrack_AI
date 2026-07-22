import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ImageOff, Maximize2, X } from 'lucide-react'

export default function ContainerImageViewer({ imageUrl, label = 'Image du conteneur' }) {
  const [isOpen, setIsOpen] = useState(false)
  const [hasError, setHasError] = useState(false)

  useEffect(() => {
    if (!isOpen) return undefined

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const openViewer = () => {
    setHasError(false)
    setIsOpen(true)
  }

  if (!imageUrl) return <span>-</span>

  return (
    <>
      <button
        type="button"
        onClick={openViewer}
        className="inline-flex items-center gap-1.5 font-semibold text-marsa-ciel transition hover:text-marsa-royal"
      >
        Voir image
        <Maximize2 size={14} aria-hidden="true" />
      </button>

      {isOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-[#14324d]/70 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-label={label}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setIsOpen(false)
            }}
          >
            <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-md bg-white shadow-2xl">
              <div className="flex shrink-0 items-center justify-between gap-4 border-b border-marsa-border px-5 py-4">
                <div className="min-w-0">
                  <h3 className="font-bold text-marsa-royal">Image du conteneur</h3>
                  <p className="mt-1 max-w-full truncate text-xs text-marsa-muted">{label}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md border border-[#c8d8e8] px-3 text-xs font-bold text-marsa-royal transition hover:border-marsa-royal hover:bg-[#eef5fb]"
                  title="Fermer"
                >
                  <X size={15} aria-hidden="true" />
                  Fermer
                </button>
              </div>

              <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[#f8fbff] p-4">
                {hasError ? (
                  <div className="flex flex-col items-center gap-3 py-16 text-center text-marsa-muted">
                    <ImageOff size={40} aria-hidden="true" />
                    <p>Impossible d’afficher cette image.</p>
                  </div>
                ) : (
                  <img
                    src={imageUrl}
                    alt={label}
                    onError={() => setHasError(true)}
                    className="max-h-[74vh] max-w-full object-contain"
                  />
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
