export const CAMERA_JPEG_QUALITY = 0.92

const MIN_CAPTURE_WIDTH = 640
const MIN_CAPTURE_HEIGHT = 360
const MAX_CAPTURE_BYTES = 5 * 1024 * 1024
const MIN_CAPTURE_BYTES = 8 * 1024

export function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return '0 o'
  if (value < 1024) return `${value} o`
  return `${(value / 1024 / 1024).toFixed(2)} Mo`
}

export function analyzeImageData(imageData) {
  const data = imageData?.data
  if (!data?.length) {
    return { brightness: null, contrast: null, sharpness: null }
  }

  let totalBrightness = 0
  let totalSquaredBrightness = 0
  let variation = 0
  let samples = 0
  let previousBrightness = null

  for (let index = 0; index < data.length; index += 16) {
    const brightness = data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114
    totalBrightness += brightness
    totalSquaredBrightness += brightness * brightness
    if (previousBrightness !== null) {
      variation += Math.abs(brightness - previousBrightness)
    }
    previousBrightness = brightness
    samples += 1
  }

  const average = totalBrightness / samples
  const variance = Math.max(0, totalSquaredBrightness / samples - average * average)
  return {
    brightness: Math.round(average),
    contrast: Math.round(Math.sqrt(variance)),
    sharpness: Math.round(variation / Math.max(samples - 1, 1)),
  }
}

export function assessCameraCapture({ width, height, sizeBytes, analysis = {} }) {
  const blockers = []
  const warnings = []

  if (!width || !height) {
    blockers.push('La résolution de la capture est indisponible.')
  } else if (width < MIN_CAPTURE_WIDTH || height < MIN_CAPTURE_HEIGHT) {
    blockers.push(`La résolution est trop faible (${width} x ${height}). Reprenez une photo plus nette.`)
  } else if (width < 1280 || height < 720) {
    warnings.push(`Résolution limitée (${width} x ${height}). Approchez-vous du code si nécessaire.`)
  }

  if (!sizeBytes || sizeBytes < MIN_CAPTURE_BYTES) {
    blockers.push('La capture est vide ou trop petite. Reprenez la photo.')
  } else if (sizeBytes > MAX_CAPTURE_BYTES) {
    blockers.push('La capture dépasse 5 Mo. Rapprochez-vous ou réduisez la résolution de la caméra.')
  }

  if (Number.isFinite(analysis.brightness)) {
    if (analysis.brightness <= 12 || analysis.brightness >= 245) {
      blockers.push('L’image est presque entièrement sombre ou surexposée. Ajustez l’éclairage.')
    } else if (analysis.brightness < 55) {
      warnings.push('L’image est sombre. Activez le flash ou améliorez l’éclairage.')
    } else if (analysis.brightness > 210) {
      warnings.push('L’image est très lumineuse. Évitez les reflets sur le code.')
    }
  }

  if (Number.isFinite(analysis.contrast) && analysis.contrast < 7) {
    blockers.push('Le contraste de l’image est insuffisant. Cadrez le code sur une zone plus lisible.')
  }

  if (Number.isFinite(analysis.sharpness) && analysis.sharpness < 3) {
    warnings.push('L’image peut être floue. Stabilisez la caméra avant de capturer.')
  }

  return { blockers, warnings }
}
