const { pool } = require('../config/db');

/**
 * Controleur : getDashboardStats
 * Route : GET /api/dashboard/stats
 *
 * Renvoie UNIQUEMENT des compteurs agreges pour la vue synthetique du
 * dashboard (de simples nombres). Aucune donnee detaillee ni personnelle
 * n'est exposee : pas de liste d'arrets, pas de liste de personnel.
 *
 * Accessible a tous les utilisateurs authentifies — le dashboard est une vue
 * d'ensemble. Les restrictions RBAC restent en place sur les routes detaillees
 * (/api/arrets, /api/personnel, ...), sur les pages et sur les actions.
 *
 * Note metier :
 *  - un arret est « en cours » tant que heure_fin IS NULL ;
 *  - un membre du personnel est « disponible » si disponibilite = 'disponible'.
 */
const getDashboardStats = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM operations)                                   AS operations_total,
         (SELECT COUNT(*) FROM operations WHERE statut = 'en cours')         AS operations_en_cours,
         (SELECT COUNT(*) FROM operations WHERE statut = 'cloturee')         AS operations_cloturees,
         (SELECT COUNT(*) FROM arrets_travail WHERE heure_fin IS NULL)       AS arrets_en_cours,
         (SELECT COUNT(*) FROM personnel WHERE disponibilite = 'disponible') AS personnel_disponible,
         (SELECT COUNT(*) FROM container)                                    AS conteneurs_total,
         (SELECT COUNT(*) FROM container WHERE mouvement = 'IMPORT')         AS conteneurs_import,
         (SELECT COUNT(*) FROM container WHERE mouvement = 'EXPORT')         AS conteneurs_export`
    );

    const raw = rows[0] || {};
    // COUNT() peut revenir en chaine / BigInt selon le driver : on force en nombre.
    const stats = Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [key, Number(value) || 0])
    );

    return res.status(200).json({ status: 'success', data: stats });
  } catch (error) {
    console.error('Erreur getDashboardStats :', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Impossible de charger les indicateurs du dashboard.',
    });
  }
};

module.exports = { getDashboardStats };
