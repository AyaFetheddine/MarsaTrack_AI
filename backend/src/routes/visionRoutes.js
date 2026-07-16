const express = require('express');

const { detectContainer } = require('../controllers/visionController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');
const { uploadVisionImage } = require('../middlewares/uploadMiddleware');

const router = express.Router();

/**
 * POST /api/vision/detect-container
 * Analyse une image via YOLO + OCR, avec fallback technique configurable.
 * Reserve aux roles : Admin, Portiqueur.
 */
router.post(
  '/detect-container',
  authenticateToken,
  authorizeRoles('Admin', 'Portiqueur'),
  uploadVisionImage,
  detectContainer
);

module.exports = router;
