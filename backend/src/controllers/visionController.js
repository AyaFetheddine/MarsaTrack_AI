const ISO_6346_REGEX = /^[A-Z]{4}\d{7}$/;

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

  const detectedIso = SIMULATED_DETECTED_ISO;
  const isValidIso = ISO_6346_REGEX.test(detectedIso);

  return res.status(200).json({
    detected_iso  : detectedIso,
    confidence    : 0.60,
    is_valid_iso  : isValidIso,
    owner_code    : detectedIso.slice(0, 3),
    category      : detectedIso.slice(3, 4),
    serial_number : detectedIso.slice(4, 10),
    check_digit   : detectedIso.slice(10, 11),
    message       : 'Detection simulee reussie.',
  });
};

module.exports = { detectContainer };
