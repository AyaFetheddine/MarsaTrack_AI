const express = require('express');

const {
  createPersonnel,
  deletePersonnel,
  disablePersonnel,
  getPersonnel,
  updatePersonnel,
} = require('../controllers/personnelController');
const { authenticateToken, authorizeRoles } = require('../middlewares/authMiddleware');

const router = express.Router();

router.get(
  '/',
  authenticateToken,
  authorizeRoles('Admin', 'Responsable_Exploitation', 'Chef_Services', 'Chef_Equipe'),
  getPersonnel
);

router.post(
  '/',
  authenticateToken,
  authorizeRoles('Admin', 'Responsable_Exploitation'),
  createPersonnel
);

router.put(
  '/:id',
  authenticateToken,
  authorizeRoles('Admin', 'Responsable_Exploitation'),
  updatePersonnel
);

router.patch(
  '/:id/desactiver',
  authenticateToken,
  authorizeRoles('Admin', 'Responsable_Exploitation'),
  disablePersonnel
);

router.delete(
  '/:id',
  authenticateToken,
  authorizeRoles('Admin', 'Responsable_Exploitation'),
  deletePersonnel
);

module.exports = router;
