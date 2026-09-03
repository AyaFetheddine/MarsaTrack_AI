const crypto = require('crypto');

/**
 * Middleware : authenticateIntegration
 *
 * Protege l'espace de routes /api/integration, appele par des services
 * (MarsaBot Factory), et non par un utilisateur connecte : il n'y a donc ni
 * session ni JWT, mais un jeton de service partage.
 *
 * Le jeton est accepte de deux facons, par ordre de preference :
 *   1. en-tete   Authorization: Bearer <jeton>   (voie propre)
 *   2. parametre ?token=<jeton>                  (voie de compatibilite)
 *
 * La voie 2 existe parce que MarsaBot appelle ses sources API avec une simple
 * URL et n'envoie aucun en-tete personnalise. Un jeton place dans l'URL
 * apparait dans les journaux de l'appelant : preferer l'en-tete des que
 * l'appelant sait en envoyer.
 *
 * Sans INTEGRATION_TOKEN configure, l'acces est refuse (503) plutot qu'ouvert :
 * une variable oubliee ne doit jamais exposer les donnees operationnelles.
 */

/** Comparaison a duree constante, insensible a la longueur des chaines. */
const compareSecrets = (given, expected) => {
  const a = crypto.createHash('sha256').update(String(given)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();

  return crypto.timingSafeEqual(a, b);
};

const extractToken = (req) => {
  const authHeader = req.headers['authorization'];

  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  if (typeof req.query.token === 'string' && req.query.token.trim()) {
    return req.query.token.trim();
  }

  return null;
};

const authenticateIntegration = (req, res, next) => {
  const expected = process.env.INTEGRATION_TOKEN;

  if (!expected || !expected.trim()) {
    console.error(
      '[integrationAuth] INTEGRATION_TOKEN manquant. Definissez-le dans backend/.env pour activer /api/integration.',
    );

    return res.status(503).json({
      status  : 'error',
      message : 'Integration non configuree sur le serveur.',
    });
  }

  const provided = extractToken(req);

  if (!provided) {
    return res.status(401).json({
      status  : 'error',
      message : 'Jeton de service manquant. Fournissez Authorization: Bearer <jeton> ou ?token=<jeton>.',
    });
  }

  if (!compareSecrets(provided, expected.trim())) {
    return res.status(403).json({
      status  : 'error',
      message : 'Jeton de service invalide.',
    });
  }

  return next();
};

module.exports = { authenticateIntegration };
