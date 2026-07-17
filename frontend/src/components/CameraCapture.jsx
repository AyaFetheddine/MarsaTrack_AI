import { AlertCircle, Camera, LoaderCircle, RotateCcw, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

const getCameraErrorMessage = (error) => {
  if (!window.isSecureContext && window.location.hostname !== 'localhost') {
    return 'La caméra nécessite une connexion HTTPS, sauf sur localhost.'
  }

  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return "L'accès à la caméra a été refusé. Autorisez la caméra dans les paramètres du navigateur ou importez une image."
    case 'NotFoundError':
    case 'OverconstrainedError':
      return "Aucune caméra compatible n'a été détectée. Vous pouvez toujours importer une image."
    case 'NotReadableError':
      return "La caméra est déjà utilisée par une autre application. Fermez cette application puis réessayez."
    default:
      return "Impossible d'activer la caméra. Vous pouvez toujours importer une image."
  }
}

function CameraCapture({ onClose, onUsePhoto }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const previewRef = useRef(null)
  const [cameraState, setCameraState] = useState('starting')
  const [errorMessage, setErrorMessage] = useState('')
  const [capturedPhoto, setCapturedPhoto] = useState(null)
  const [capturedPreview, setCapturedPreview] = useState('')

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const clearCapturedPhoto = useCallback(() => {
    if (previewRef.current) {
      URL.revokeObjectURL(previewRef.current)
      previewRef.current = null
    }
    setCapturedPhoto(null)
    setCapturedPreview('')
  }, [])

  const startCamera = useCallback(async () => {
    clearCapturedPhoto()
    setErrorMessage('')

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraState('error')
      setErrorMessage("Votre navigateur ne permet pas l'accès à la caméra. Vous pouvez importer une image.")
      return
    }

    if (!window.isSecureContext && window.location.hostname !== 'localhost') {
      setCameraState('error')
      setErrorMessage('La caméra nécessite une connexion HTTPS, sauf sur localhost.')
      return
    }

    setCameraState('starting')

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })

      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      setCameraState('ready')
    } catch (error) {
      stopCamera()
      setCameraState('error')
      setErrorMessage(getCameraErrorMessage(error))
    }
  }, [clearCapturedPhoto, stopCamera])

  useEffect(() => {
    const startTimer = window.setTimeout(startCamera, 0)

    return () => {
      window.clearTimeout(startTimer)
      stopCamera()
      if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    }
  }, [startCamera, stopCamera])

  const handleCapture = () => {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      setErrorMessage("La capture a échoué. Attendez que l'image de la caméra soit visible puis réessayez.")
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setErrorMessage('La capture a échoué. Veuillez reprendre la photo.')
          return
        }

        clearCapturedPhoto()
        const file = new File([blob], `capture-conteneur-${Date.now()}.jpg`, {
          type: 'image/jpeg',
        })
        const objectUrl = URL.createObjectURL(file)
        previewRef.current = objectUrl
        setCapturedPhoto(file)
        setCapturedPreview(objectUrl)
        stopCamera()
        setCameraState('captured')
      },
      'image/jpeg',
      0.92,
    )
  }

  const handleUsePhoto = () => {
    if (!capturedPhoto) return
    onUsePhoto(capturedPhoto)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#14324d]/70 p-2 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-4xl flex-col overflow-hidden rounded-md bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)]">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-marsa-border px-4 py-3 sm:px-5 sm:py-4">
          <div>
            <h3 className="font-bold text-marsa-royal">Prendre une photo</h3>
            <p className="mt-1 text-sm text-marsa-muted">
              Cadrez clairement le code ISO du conteneur avant la capture.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md border border-[#c8d8e8] px-3 text-xs font-bold text-marsa-royal transition hover:border-marsa-royal hover:bg-[#eef5fb]"
          >
            <X size={15} />
            Fermer
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto bg-[#f8fbff] p-3 sm:p-4">
          {cameraState === 'error' ? (
            <div className="rounded-md border border-[#fecaca] bg-[#fff5f5] p-4 text-sm text-[#b91c1c]">
              <div className="flex gap-2">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <p>{errorMessage}</p>
              </div>
              <button
                type="button"
                onClick={startCamera}
                className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-md border border-[#fecaca] bg-white px-3 text-xs font-bold text-[#b91c1c] transition hover:bg-[#fff5f5]"
              >
                <RotateCcw size={15} />
                Réessayer
              </button>
            </div>
          ) : cameraState === 'captured' && capturedPreview ? (
            <img
              src={capturedPreview}
              alt="Photo capturée du conteneur"
              className="mx-auto max-h-[min(52dvh,520px)] w-full rounded-md bg-white object-contain"
            />
          ) : (
            <div className="relative flex h-[42dvh] min-h-[240px] max-h-[420px] items-center justify-center overflow-hidden rounded-md bg-[#14324d] sm:h-[50dvh] sm:min-h-[300px] sm:max-h-[460px]">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full object-contain"
              />
              {cameraState === 'starting' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#14324d]/80 text-white">
                  <LoaderCircle size={28} className="animate-spin" />
                  <span className="text-sm font-semibold">Ouverture de la caméra...</span>
                </div>
              )}
            </div>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-marsa-border bg-white px-4 py-3 sm:px-5 sm:py-4">
          {cameraState === 'captured' ? (
            <>
              <button
                type="button"
                onClick={startCamera}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#c8d8e8] px-4 text-sm font-bold text-marsa-royal transition hover:border-marsa-royal hover:bg-[#eef5fb]"
              >
                <RotateCcw size={16} />
                Reprendre la photo
              </button>
              <button type="button" onClick={handleUsePhoto} className="primary-button">
                <Camera size={17} />
                Utiliser cette photo
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleCapture}
              disabled={cameraState !== 'ready'}
              className="primary-button disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Camera size={17} />
              Capturer
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default CameraCapture
