const express = require('express');

const { saisirContainer } = require('../controllers/containerController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');

const router = express.Router();

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
