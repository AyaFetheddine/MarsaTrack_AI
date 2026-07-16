const {
  validateContainerCode,
} = require('../utils/iso6346');
const { detectContainerFromImage } = require('../services/visionService');

const SIMULATED_DETECTED_ISO = 'MRKU6234191';

const isFallbackEnabled = () =>
  String(process.env.VISION_FALLBACK_ENABLED ?? 'true').toLowerCase() === 'true';

const buildMockDetectionResult = (detectionMode = 'fallback_mock') => {
  const validation = validateContainerCode(SIMULATED_DETECTED_ISO);

  return {
    detected_iso         : validation.normalized,
    confidence           : 0.60,
    raw_ocr_text         : null,
    yolo_confidence      : null,
    ocr_confidence       : null,
    is_valid_iso         : validation.isValid,
    is_valid_format      : validation.isValidFormat,
    is_valid_check_digit : validation.isValidCheckDigit,
    owner_code           : validation.ownerCode,
    category             : validation.category,
    serial_number        : validation.serialNumber,
    check_digit          : validation.checkDigit,
    expected_check_digit : validation.expectedCheckDigit,
    detection_mode       : detectionMode,
    ocr_variant          : null,
    bbox                 : null,
    detections           : [],
    warning              : 'Le microservice Vision IA est indisponible. Aucune detection reelle n a ete effectuee.',
    message              : detectionMode === 'fallback_mock'
      ? 'Service Vision indisponible. Resultat simule de secours.'
      : 'Detection simulee reussie.',
  };
};

/**
 * Controleur : detectContainer
 * Route : POST /api/vision/detect-container
 *
 * Relaie l'image au microservice Python Vision.
 * Aucune donnee n'est enregistree a cette etape.
 */
const detectContainer = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      status  : 'error',
      message : 'Veuillez importer une image du conteneur a analyser.',
    });
  }

  try {
    const response = await detectContainerFromImage(req.file);
    return res.status(200).json(response);
  } catch (error) {
    const isClientVisionError = error.statusCode >= 400 && error.statusCode < 500;

    if (isClientVisionError && error.payload) {
      return res.status(error.statusCode).json(error.payload);
    }

    // Une reponse metier valide (no_detection, yolo_no_valid_iso, ocr_error)
    // est retournee en HTTP 200 par FastAPI et n'arrive jamais dans ce bloc.
    if (isFallbackEnabled()) {
      console.warn(
        '[visionController] Service Vision indisponible, fallback mock utilise :',
        error.message,
      );

      return res.status(200).json({
        status: 'success',
        data  : buildMockDetectionResult('fallback_mock'),
      });
    }

    console.error('[visionController] Service Vision indisponible :', error.message);
    return res.status(503).json({
      status  : 'error',
      message : 'Le service Vision IA est temporairement indisponible. Vous pouvez saisir le matricule manuellement.',
    });
  }
};

module.exports = { detectContainer };
