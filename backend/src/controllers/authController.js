const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');

const { pool } = require('../config/db');

/**
 * Contrôleur : login
 * Route : POST /api/auth/login
 *
 * Authentifie un utilisateur par son matricule et son mot de passe.
 * En cas de succès, retourne un token JWT signé (valide 8h) et les
 * informations publiques de l'utilisateur (sans le hash du mot de passe).
 *
 * Sécurité :
 *  - Le message d'erreur est volontairement générique (ne révèle pas
 *    si c'est le matricule ou le mot de passe qui est incorrect).
 *  - Le hash n'est jamais retourné au client.
 */
const login = async (req, res) => {
  const { matricule, password } = req.body;

  // Validation des champs obligatoires
  if (!matricule || !password) {
    return res.status(400).json({
      status  : 'error',
      message : 'Le matricule et le mot de passe sont obligatoires.',
    });
  }

  try {
    // Recherche de l'utilisateur par son matricule
    const [rows] = await pool.execute(
      'SELECT id, nom_complet, matricule, role, password_hash FROM users WHERE matricule = ?',
      [matricule]
    );

    const user = rows[0];

    // Message d'erreur générique — ne révèle pas si le matricule existe ou non
    if (!user) {
      return res.status(401).json({
        status  : 'error',
        message : 'Matricule ou mot de passe incorrect.',
      });
    }

    // Comparaison sécurisée du mot de passe avec le hash bcrypt stocké
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json({
        status  : 'error',
        message : 'Matricule ou mot de passe incorrect.',
      });
    }

    // Génération du token JWT — le payload contient les infos nécessaires au RBAC
    const token = jwt.sign(
      {
        id        : user.id,
        matricule : user.matricule,
        role      : user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' } // Durée alignée sur la durée maximale d'un Shift (8h)
    );

    // Réponse de succès — le password_hash n'est jamais retourné
    return res.status(200).json({
      status  : 'success',
      message : 'Authentification réussie.',
      token,
      user: {
        id         : user.id,
        nom_complet: user.nom_complet,
        matricule  : user.matricule,
        role       : user.role,
      },
    });
  } catch (error) {
    console.error('[authController] Erreur lors du login :', error.message);
    return res.status(500).json({
      status  : 'error',
      message : 'Erreur interne du serveur. Veuillez réessayer.',
    });
  }
};

module.exports = { login };
