import {
  AlertCircle,
  Camera,
  CheckCircle2,
  LoaderCircle,
  RefreshCw,
  RotateCcw,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getCameraErrorMessage, isCameraContextSecure } from '../utils/cameraErrors'
import {
  CAMERA_JPEG_QUALITY,
  analyzeImageData,
  assessCameraCapture,
  formatBytes,
} from '../utils/cameraQuality'

const preferredCameraConstraints = {
  audio: false,
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 720 },
  },
}

const basicCameraConstraints = {
  audio: false,
  video: true,
}

function stopMediaStream(stream) {
  stream?.getTracks().forEach((track) => track.stop())
}

export default function CameraCapture({ onClose, onUsePhoto }) {
  const [phase, setPhase] = useState('loading')
  const [videoReady, setVideoReady] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [capturedPhoto, setCapturedPhoto] = useState(null)
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const previewUrlRef = useRef(null)
  const closeButtonRef = useRef(null)
  const mountedRef = useRef(true)

  const clearCapturedPhoto = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
    setCapturedPhoto(null)
  }, [])

  const stopCamera = useCallback(() => {
    stopMediaStream(streamRef.current)
    streamRef.current = null

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }, [])

  const closeDialog = useCallback(() => {
    stopCamera()
    clearCapturedPhoto()
    onClose()
  }, [clearCapturedPhoto, onClose, stopCamera])

  const startCamera = useCallback(async () => {
    stopCamera()
    clearCapturedPhoto()
    setErrorMessage('')
    setVideoReady(false)
    setPhase('loading')

    if (!isCameraContextSecure()) {
      setErrorMessage('La camera doit etre utilisee depuis localhost ou une connexion HTTPS.')
      setPhase('error')
      return
    }

    try {
      let stream

      try {
        stream = await navigator.mediaDevices.getUserMedia(preferredCameraConstraints)
      } catch {
        stream = await navigator.mediaDevices.getUserMedia(basicCameraConstraints)
      }

      if (!mountedRef.current) {
        stopMediaStream(stream)
        return
      }

      streamRef.current = stream
      setPhase('camera')
    } catch (error) {
      if (!mountedRef.current) return
      setErrorMessage(getCameraErrorMessage(error))
      setPhase('error')
    }
  }, [clearCapturedPhoto, stopCamera])

  useEffect(() => {
    mountedRef.current = true
    // Start after the initial render so the video element exists before attaching the stream.
    const startupTimer = window.setTimeout(() => {
      void startCamera()
    }, 0)
    closeButtonRef.current?.focus()

    return () => {
      window.clearTimeout(startupTimer)
      mountedRef.current = false
      stopCamera()
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    }
  }, [startCamera, stopCamera])

  useEffect(() => {
    if (phase !== 'camera' || !videoRef.current || !streamRef.current) return undefined

    const video = videoRef.current
    let cancelled = false

    const playVideo = async () => {
      try {
        await video.play()
        if (!cancelled) setVideoReady(true)
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(getCameraErrorMessage(error))
          setPhase('error')
        }
      }
    }

    video.srcObject = streamRef.current

    if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      void playVideo()
    } else {
      video.addEventListener('loadedmetadata', playVideo, { once: true })
    }

    return () => {
      cancelled = true
      video.removeEventListener('loadedmetadata', playVideo)
    }
  }, [phase])

  const capturePhoto = () => {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      setErrorMessage('La camera est encore en cours de demarrage. Reessayez dans un instant.')
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const context = canvas.getContext('2d')
    context.drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setErrorMessage('La photo n a pas pu etre capturee. Reessayez.')
          return
        }

        stopCamera()
        const file = new File(
          [blob],
          'capture-conteneur-' + Date.now() + '.jpg',
          { type: 'image/jpeg' },
        )
        const previewUrl = URL.createObjectURL(file)
        previewUrlRef.current = previewUrl

        setCapturedPhoto({
          file,
          previewUrl,
          quality: assessCameraCapture(analyzeImageData(canvas)),
        })
        setPhase('review')
      },
      'image/jpeg',
      CAMERA_JPEG_QUALITY,
    )
  }

  const useCapturedPhoto = () => {
    if (!capturedPhoto) return
    onUsePhoto(capturedPhoto.file)
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-marsa-royal/45 p-3 backdrop-blur-sm"
      role="dialog"
    >
      <section className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-marsa-ciel/20 px-5 py-4 sm:px-7">
          <div>
            <h2 className="text-xl font-bold text-marsa-royal">Capturer le code du conteneur</h2>
            <p className="mt-1 text-sm text-marsa-text/70">
              Cadrez le code ISO clairement avant la capture.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            className="inline-flex shrink-0 items-center gap-2 rounded-md border border-marsa-ciel/40 px-3 py-2 font-semibold text-marsa-royal transition hover:bg-marsa-bg"
            onClick={closeDialog}
            type="button"
          >
            <X size={19} />
            Fermer
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
          {phase === 'loading' && (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-marsa-text/70">
              <LoaderCircle className="animate-spin text-marsa-ciel" size={32} />
              <p>Demarrage de la camera...</p>
            </div>
          )}

          {phase === 'camera' && (
            <div className="mx-auto max-w-3xl">
              <div className="relative overflow-hidden rounded-md bg-[#0d1a25]">
                <video
                  ref={videoRef}
                  autoPlay
                  className="block aspect-video w-full object-contain"
                  muted
                  playsInline
                />
                {!videoReady && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
                    <LoaderCircle className="animate-spin" size={28} />
                    <span className="text-sm">Activation de la camera...</span>
                  </div>
                )}
              </div>
              <p className="mt-3 text-center text-sm text-marsa-text/70">
                Placez le code ISO au centre de l image, avec une bonne lumiere.
              </p>
            </div>
          )}

          {phase === 'review' && capturedPhoto && (
            <div className="mx-auto max-w-3xl">
              <img
                alt="Photo capturee du conteneur"
                className="aspect-video w-full rounded-md bg-marsa-bg object-contain"
                src={capturedPhoto.previewUrl}
              />
              <div className="mt-4 rounded-md border border-marsa-ciel/20 bg-marsa-bg p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-marsa-royal">
                  <CheckCircle2 className="text-emerald-600" size={20} />
                  Photo capturee
                </div>
                <p className="mt-1 text-sm text-marsa-text/70">
                  {capturedPhoto.quality.label} - {formatBytes(capturedPhoto.file.size)}
                </p>
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div className="mx-auto flex max-w-xl flex-col items-center rounded-md border border-red-200 bg-red-50 p-6 text-center">
              <AlertCircle className="text-red-600" size={34} />
              <h3 className="mt-3 text-lg font-bold text-marsa-royal">Camera indisponible</h3>
              <p className="mt-2 text-sm text-marsa-text/75">{errorMessage}</p>
              <button
                className="mt-5 inline-flex items-center gap-2 rounded-md border border-marsa-ciel/40 px-4 py-2 font-semibold text-marsa-royal transition hover:bg-white"
                onClick={() => void startCamera()}
                type="button"
              >
                <RefreshCw size={18} />
                Reessayer
              </button>
            </div>
          )}

          {errorMessage && phase === 'camera' && (
            <p className="mx-auto mt-3 max-w-3xl text-center text-sm text-red-600">{errorMessage}</p>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-marsa-ciel/20 bg-white px-5 py-4 sm:px-7">
          <button
            className="rounded-md border border-marsa-ciel/40 px-4 py-2 font-semibold text-marsa-royal transition hover:bg-marsa-bg"
            onClick={closeDialog}
            type="button"
          >
            Annuler
          </button>

          {phase === 'camera' && (
            <button
              className="inline-flex items-center gap-2 rounded-md bg-marsa-royal px-4 py-2 font-semibold text-white transition hover:bg-marsa-ciel disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!videoReady}
              onClick={capturePhoto}
              type="button"
            >
              <Camera size={19} />
              Prendre la photo
            </button>
          )}

          {phase === 'review' && (
            <div className="flex items-center gap-2">
              <button
                className="inline-flex items-center gap-2 rounded-md border border-marsa-ciel/40 px-4 py-2 font-semibold text-marsa-royal transition hover:bg-marsa-bg"
                onClick={() => void startCamera()}
                type="button"
              >
                <RotateCcw size={18} />
                Reprendre
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-md bg-marsa-royal px-4 py-2 font-semibold text-white transition hover:bg-marsa-ciel"
                onClick={useCapturedPhoto}
                type="button"
              >
                <CheckCircle2 size={19} />
                Utiliser la photo
              </button>
            </div>
          )}
        </footer>
      </section>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  )
}
