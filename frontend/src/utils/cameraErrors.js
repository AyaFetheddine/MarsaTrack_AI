export function isCameraContextSecure(locationLike = window.location) {
  const hostname = locationLike?.hostname
  return Boolean(locationLike?.protocol === 'https:' || hostname === 'localhost' || hostname === '127.0.0.1')
}

export function getCameraErrorMessage(error) {
  if (!isCameraContextSecure()) {
    return 'La caméra nécessite HTTPS, sauf lorsque vous utilisez localhost.'
  }

  switch (error?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'L’accès à la caméra a été refusé. Autorisez la caméra dans les paramètres du navigateur puis réessayez.'
    case 'NotFoundError':
      return 'Aucune caméra compatible n’a été trouvée sur cet appareil.'
    case 'NotReadableError':
      return 'La caméra est déjà utilisée par une autre application. Fermez-la puis réessayez.'
    case 'OverconstrainedError':
      return 'Cette caméra ne prend pas en charge la configuration demandée. Essayez une autre caméra.'
    default:
      return 'Impossible de démarrer la caméra. Vérifiez les autorisations puis réessayez.'
  }
}

export function getCameraDisplayName(device, index = 0) {
  return device?.label?.trim() || `Caméra ${index + 1}`
}

export function getPreferredCameraId(devices = []) {
  const preferred = devices.find((device) => /back|rear|environment|arrière/i.test(device.label))
  return preferred?.deviceId || devices[0]?.deviceId || ''
}
