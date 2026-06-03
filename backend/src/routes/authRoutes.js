const express = require('express');

const { login } = require('../controllers/authController');

const router = express.Router();

/**
 * POST /api/auth/login
 * Authentifie un utilisateur et retourne un token JWT.
 * Body attendu : { "matricule": "ADM-001", "password": "..." }
 */
router.post('/login', login);

module.exports = router;
