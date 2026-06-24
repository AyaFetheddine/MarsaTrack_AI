const express = require('express');

const { saisirContainer, getContainers } = require('../controllers/containerController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * GET /api/containers
 * Recupere l'historique des conteneurs.
 * Accessible a tous les utilisateurs authentifies.
 */
router.get(
  '/',
  authenticateToken,
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
  authorizeRoles('Portiqueur'),
  saisirContainer
);

module.exports = router;
