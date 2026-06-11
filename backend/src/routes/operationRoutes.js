const express = require('express');

const { createOperation, getOperations, cloturerOperation } = require('../controllers/operationController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * POST /api/operations
 * Crée une nouvelle opération portuaire.
 * Réservé aux rôles : Responsable_Exploitation, Chef_Equipe.
 */
router.post(
  '/',
  authenticateToken,
  authorizeRoles('Responsable_Exploitation', 'Chef_Equipe'),
  createOperation
);

/**
 * GET /api/operations
 * Récupère toutes les opérations.
 * Accessible à tous les utilisateurs authentifiés (lecture seule).
 */
router.get(
  '/',
  authenticateToken,
  getOperations
);

/**
 * PUT /api/operations/:id/cloturer
 * Cloture une operation portuaire.
 * Reserve au role : Chef_Services.
 */
router.put(
  '/:id/cloturer',
  authenticateToken,
  authorizeRoles('Chef_Services'),
  cloturerOperation
);

module.exports = router;
