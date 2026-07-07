const express = require('express');

const {
  saisirContainer,
  getContainers,
  deleteContainer,
} = require('../controllers/containerController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');
const { uploadContainerImage } = require('../middlewares/uploadMiddleware');

const router = express.Router();

/**
 * GET /api/containers
 * Recupere l'historique des conteneurs.
 * Accessible a tous les utilisateurs authentifies.
 */
router.get(
  '/',
  authenticateToken,
  authorizeRoles('Admin', 'Responsable_Exploitation', 'Chef_Services', 'Portiqueur'),
  getContainers
);

/**
 * POST /api/containers
 * Enregistre un conteneur saisi par le portiqueur sur une operation.
 * Reserve au role : Portiqueur.
 */
router.post(
  '/',
  authenticateToken,
  authorizeRoles('Admin', 'Portiqueur'),
  uploadContainerImage,
  saisirContainer
);

/**
 * DELETE /api/containers/:id
 * Supprime un conteneur de test.
 * Reserve au role : Admin.
 */
router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles('Admin'),
  deleteContainer
);

module.exports = router;
