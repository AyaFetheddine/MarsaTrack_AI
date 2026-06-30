const express = require('express');

const { getPersonnel } = require('../controllers/userController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * GET /api/users/personnel
 * Recupere la liste du personnel terrain affectable.
 * Accessible a tout utilisateur authentifie.
 */
router.get(
  '/personnel',
  authenticateToken,
  authorizeRoles('Admin', 'Responsable_Exploitation', 'Chef_Services', 'Chef_Equipe'),
  getPersonnel
);

module.exports = router;
