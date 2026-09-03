const express = require('express');

const { getEtatOperationnel } = require('../controllers/integrationController');
const { authenticateIntegration } = require('../middlewares/integrationAuth');

const router = express.Router();

// Espace de routes reserve aux appels de service (MarsaBot Factory).
// LECTURE SEULE : aucune route d'ecriture n'est exposee ici.
router.use(authenticateIntegration);

/**
 * GET /api/integration/etat-operationnel
 * Instantane compact de l'etat operationnel du terminal : operations en cours
 * ou du jour, personnels affectes, arrets de travail ouverts, shift courant.
 * Destine a etre injecte tel quel dans le contexte d'un LLM.
 */
router.get('/etat-operationnel', getEtatOperationnel);

module.exports = router;
