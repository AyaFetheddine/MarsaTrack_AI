const jwt = require('jsonwebtoken');

/**
 * Middleware : authenticateToken
 * Vérifie que la requête possède un token JWT valide dans le header Authorization.
 * Format attendu : "Authorization: Bearer <token>"
 * Si valide, les données décodées sont attachées à `req.user` pour les middlewares suivants.
 */
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.startsWith('Bearer ')
    ? authHeader.split(' ')[1]
    : null;

  // Aucun token fourni → 401 Unauthorized
  if (!token) {
    return res.status(401).json({
      status  : 'error',
      message : 'Accès refusé. Token d\'authentification manquant.',
    });
  }

  try {
    // Vérification et décodage du token avec la clé secrète
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // On attache le payload décodé (id, matricule, role) à la requête
    req.user = decoded;
    next();
  } catch (error) {
    // Token expiré ou falsifié → 403 Forbidden
    return res.status(403).json({
      status  : 'error',
      message : 'Token invalide ou expiré. Veuillez vous reconnecter.',
    });
  }
};

/**
 * Middleware : authorizeRoles
 * Contrôle d'accès basé sur les rôles (RBAC).
 * S'utilise après `authenticateToken`, une fois que `req.user` est disponible.
 *
 * Usage : router.delete('/operation/:id', authenticateToken, authorizeRoles('Chef_Services'), handler)
 *
 * @param {...string} roles - Liste des rôles autorisés à accéder à la route.
 */
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    // Vérifie que le rôle de l'utilisateur connecté est dans la liste autorisée
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        status  : 'error',
        message : `Accès refusé. Rôle requis : [${roles.join(', ')}]. Votre rôle : ${req.user.role}.`,
      });
    }
    next();
  };
};

module.exports = { authenticateToken, authorizeRoles };
