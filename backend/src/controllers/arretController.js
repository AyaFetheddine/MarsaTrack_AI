const { pool } = require('../config/db');

// Valeurs ENUM acceptées par la table arrets_travail
const CAUSES_VALIDES = ['panne grue', 'manque de matériel', 'attente camion'];

/**
 * Contrôleur : declarerArret
 * Route : POST /api/arrets
 *
 * Déclare un nouvel arrêt de travail en cours sur une opération.
 * L'heure_debut est capturée au moment de la déclaration si non fournie.
 * L'heure_fin reste NULL tant que l'arrêt n'est pas clôturé.
 *
 * Body attendu :
 * {
 *   "operation_id" : 1,
 *   "cause"        : "panne grue"
 * }
 */
const declarerArret = async (req, res) => {
  const { operation_id, cause } = req.body;

  // Validation des champs obligatoires
  if (!operation_id || !cause) {
    return res.status(400).json({
      status  : 'error',
      message : 'Les champs operation_id et cause sont obligatoires.',
    });
  }

  // Validation de l'ENUM cause avant toute insertion
  if (!CAUSES_VALIDES.includes(cause)) {
    return res.status(400).json({
      status  : 'error',
      message : `Cause invalide. Valeurs acceptées : ${CAUSES_VALIDES.join(', ')}.`,
    });
  }

  // Horodatage du début de l'arrêt côté serveur pour garantir la précision
  const heure_debut = new Date();

  try {
    // Vérification que l'opération référencée existe bien
    const [opRows] = await pool.execute(
      'SELECT id FROM operations WHERE id = ?',
      [operation_id]
    );

    if (opRows.length === 0) {
      return res.status(404).json({
        status  : 'error',
        message : `Opération introuvable (id: ${operation_id}).`,
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO arrets_travail (operation_id, cause, heure_debut)
       VALUES (?, ?, ?)`,
      [operation_id, cause, heure_debut]
    );

    return res.status(201).json({
      status  : 'success',
      message : 'Arrêt de travail déclaré avec succès.',
      data    : {
        id           : result.insertId,
        operation_id : Number(operation_id),
        cause,
        heure_debut  : heure_debut.toISOString(),
        heure_fin    : null,
      },
    });
  } catch (error) {
    console.error('[arretController] Erreur declarerArret :', error.message);
    return res.status(500).json({
      status  : 'error',
      message : 'Erreur interne du serveur lors de la déclaration de l\'arrêt.',
    });
  }
};

/**
 * Contrôleur : cloturerArret
 * Route : PUT /api/arrets/:id/cloturer
 *
 * Clôture un arrêt de travail en renseignant son heure_fin.
 * Un arrêt déjà clôturé ne peut pas être modifié une seconde fois.
 */
const cloturerArret = async (req, res) => {
  const { id } = req.params;

  // Validation que l'id est un entier valide
  if (!id || isNaN(Number(id))) {
    return res.status(400).json({
      status  : 'error',
      message : 'L\'identifiant de l\'arrêt doit être un nombre entier valide.',
    });
  }

  try {
    // Vérification que l'arrêt existe et n'est pas déjà clôturé
    const [rows] = await pool.execute(
      'SELECT id, heure_fin FROM arrets_travail WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status  : 'error',
        message : `Arrêt de travail introuvable (id: ${id}).`,
      });
    }

    if (rows[0].heure_fin !== null) {
      return res.status(409).json({
        status  : 'error',
        message : 'Cet arrêt de travail est déjà clôturé.',
      });
    }

    const heure_fin = new Date();

    await pool.execute(
      'UPDATE arrets_travail SET heure_fin = ? WHERE id = ?',
      [heure_fin, id]
    );

    return res.status(200).json({
      status  : 'success',
      message : 'Arrêt de travail clôturé avec succès.',
      data    : {
        id       : Number(id),
        heure_fin: heure_fin.toISOString(),
      },
    });
  } catch (error) {
    console.error('[arretController] Erreur cloturerArret :', error.message);
    return res.status(500).json({
      status  : 'error',
      message : 'Erreur interne du serveur lors de la clôture de l\'arrêt.',
    });
  }
};

module.exports = { declarerArret, cloturerArret };
