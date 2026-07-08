const express = require('express');

const { detectContainer } = require('../controllers/visionController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');
const { uploadVisionImage } = require('../middlewares/uploadMiddleware');

const router = express.Router();

/**
 * POST /api/vision/detect-container
 * Simule l'analyse Vision IA d'une image conteneur.
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
