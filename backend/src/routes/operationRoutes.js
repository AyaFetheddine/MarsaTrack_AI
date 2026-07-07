const express = require('express');

const {
  annulerOperation,
  createOperation,
  deleteOperation,
  getOperations,
  cloturerOperation,
} = require('../controllers/operationController');
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
  authorizeRoles('Admin', 'Responsable_Exploitation', 'Chef_Equipe'),
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
  authorizeRoles(
    'Admin',
    'Responsable_Exploitation',
    'Chef_Services',
    'Chef_Escale',
    'Chef_Equipe',
    'Portiqueur'
  ),
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
  authorizeRoles('Admin', 'Chef_Services'),
  cloturerOperation
);

/**
 * PUT /api/operations/:id/annuler
 * Annule une operation creee par erreur avant usage terrain.
 * Reserve aux roles : Admin, Responsable_Exploitation.
 */
router.put(
  '/:id/annuler',
  authenticateToken,
  authorizeRoles('Admin', 'Responsable_Exploitation'),
  annulerOperation
);

/**
 * DELETE /api/operations/:id
 * Supprime une operation sans historique metier associe.
 * Reserve au role : Admin.
 */
router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles('Admin'),
  deleteOperation
);

module.exports = router;
