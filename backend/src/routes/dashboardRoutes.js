const express = require('express');

const { getDashboardStats } = require('../controllers/dashboardController');
const { authenticateToken } = require('../middlewares/authMiddleware');

const router = express.Router();

/**
 * GET /api/dashboard/stats
 * Compteurs agreges de la vue d'ensemble.
 * Accessible a TOUS les roles authentifies : ce sont des donnees non
 * sensibles et agregees. Les restrictions RBAC detaillees restent portees
 * par les routes /api/arrets, /api/personnel, etc.
 */
router.get('/stats', authenticateToken, getDashboardStats);

module.exports = router;
