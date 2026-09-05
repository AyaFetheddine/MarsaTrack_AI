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
  // Seules les tentatives ECHOUEES sont comptees. La protection vise le
  // devinement de mot de passe, or une connexion reussie n'en est pas une :
  // la compter penalisait des usages legitimes, comme plusieurs personnes
  // derriere la meme adresse ou un utilisateur changeant de compte. Le
  // plafond s'applique donc a ce qu'il doit reellement freiner.
  skipSuccessfulRequests: true,
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
