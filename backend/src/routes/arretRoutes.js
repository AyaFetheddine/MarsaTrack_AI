const express = require('express');

const { declarerArret, cloturerArret, getArrets } = require('../controllers/arretController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * GET /api/arrets
 * Recupere l'historique des arrets de travail.
 * Accessible a tous les utilisateurs authentifies.
 */
router.get(
  '/',
  authenticateToken,
  getArrets
);

/**
 * POST /api/arrets
 * Déclare un nouvel arrêt de travail sur une opération en cours.
 * Réservé au rôle : Chef_Equipe (gestionnaire terrain).
 */
router.post(
  '/',
  authenticateToken,
  authorizeRoles('Chef_Equipe'),
  declarerArret
);

/**
 * PUT /api/arrets/:id/cloturer
 * Clôture un arrêt de travail en renseignant son heure_fin.
 * Réservé au rôle : Chef_Equipe (gestionnaire terrain).
 */
router.put(
  '/:id/cloturer',
  authenticateToken,
  authorizeRoles('Chef_Equipe'),
  cloturerArret
);

module.exports = router;
