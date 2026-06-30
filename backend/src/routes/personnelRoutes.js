const express = require('express');

const { createPersonnel, getPersonnel } = require('../controllers/personnelController');
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

module.exports = router;
