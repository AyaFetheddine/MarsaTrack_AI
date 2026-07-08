const {
  validateContainerCode,
} = require('../utils/iso6346');

const SIMULATED_DETECTED_ISO = 'MRKU6234191';

/**
 * Controleur : detectContainer
 * Route : POST /api/vision/detect-container
 *
 * Simule une detection OCR/YOLO du matricule conteneur depuis une image.
 * Aucune donnee n'est enregistree a cette etape.
 */
const detectContainer = (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      status  : 'error',
      message : 'Veuillez importer une image du conteneur a analyser.',
    });
  }

  const validation = validateContainerCode(SIMULATED_DETECTED_ISO);

  return res.status(200).json({
    detected_iso         : validation.normalized,
    confidence           : 0.60,
    is_valid_iso         : validation.isValid,
    is_valid_format      : validation.isValidFormat,
    is_valid_check_digit : validation.isValidCheckDigit,
    owner_code           : validation.ownerCode,
    category             : validation.category,
    serial_number        : validation.serialNumber,
    check_digit          : validation.checkDigit,
    expected_check_digit : validation.expectedCheckDigit,
    message              : 'Detection simulee reussie.',
  });
};

module.exports = { detectContainer };
