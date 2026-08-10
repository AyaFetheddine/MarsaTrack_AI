const express = require('express');
const rateLimit = require('express-rate-limit');

const { login } = require('../controllers/authController');

const router = express.Router();

// Limite les tentatives de connexion (protection anti brute-force) : au plus
// 10 essais par IP toutes les 15 minutes. Configurable via l'environnement.
const loginLimiter = rateLimit({
  windowMs: Number(process.env.LOGIN_RATE_WINDOW_MS) || 15 * 60 * 1000,
  limit: Number(process.env.LOGIN_RATE_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Trop de tentatives de connexion. Reessayez dans quelques minutes.',
  },
});

/**
 * POST /api/auth/login
 * Authentifie un utilisateur et retourne un token JWT.
 * Body attendu : { "matricule": "ADM-001", "password": "..." }
 */
router.post('/login', loginLimiter, login);

module.exports = router;
