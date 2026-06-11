const { pool } = require('../config/db');

/**
 * Contrôleur : createOperation
 * Route : POST /api/operations
 *
 * Crée une nouvelle opération portuaire ("Main") dans la base de données.
 * Seuls les rôles Responsable_Exploitation et Chef_Equipe sont autorisés.
 *
 * Body attendu :
 * {
 *   "nom_operation"  : "Déchargement MSC ANNA — Quai 5",
 *   "date_operation" : "2026-06-03",
 *   "shift"          : "Shift 1",
 *   "vacation"       : "Vacation 1"
 * }
 */
const createOperation = async (req, res) => {
  const { nom_operation, date_operation, shift, vacation } = req.body;

  // Validation des champs obligatoires
  if (!nom_operation || !date_operation || !shift || !vacation) {
    return res.status(400).json({
      status  : 'error',
      message : 'Les champs nom_operation, date_operation, shift et vacation sont obligatoires.',
    });
  }

  // Validation des valeurs ENUM du shift
  const shiftsValides = ['Shift 1', 'Shift 2', 'Shift 3'];
  if (!shiftsValides.includes(shift)) {
    return res.status(400).json({
      status  : 'error',
      message : `Shift invalide. Valeurs acceptées : ${shiftsValides.join(', ')}.`,
    });
  }

  // Validation des valeurs ENUM de la vacation
  const vacationsValides = ['Vacation 1', 'Vacation 2'];
  if (!vacationsValides.includes(vacation)) {
    return res.status(400).json({
      status  : 'error',
      message : `Vacation invalide. Valeurs acceptées : ${vacationsValides.join(', ')}.`,
    });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO operations (nom_operation, date_operation, shift, vacation)
       VALUES (?, ?, ?, ?)`,
      [nom_operation, date_operation, shift, vacation]
    );

    return res.status(201).json({
      status  : 'success',
      message : 'Opération créée avec succès.',
      data    : {
        id            : result.insertId,
        nom_operation,
        date_operation,
        shift,
        vacation,
        statut: 'en cours',
      },
    });
  } catch (error) {
    console.error('[operationController] Erreur createOperation :', error.message);
    return res.status(500).json({
      status  : 'error',
      message : 'Erreur interne du serveur lors de la création de l\'opération.',
    });
  }
};

/**
 * Contrôleur : getOperations
 * Route : GET /api/operations
 *
 * Récupère la liste complète des opérations, triées par date décroissante.
 * Accessible à tous les utilisateurs authentifiés (lecture seule).
 */
const getOperations = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, nom_operation, date_operation, shift, vacation, statut
       FROM operations
       ORDER BY date_operation DESC, id DESC`
    );

    return res.status(200).json({
      status : 'success',
      count  : rows.length,
      data   : rows,
    });
  } catch (error) {
    console.error('[operationController] Erreur getOperations :', error.message);
    return res.status(500).json({
      status  : 'error',
      message : 'Erreur interne du serveur lors de la récupération des opérations.',
    });
  }
};

/**
 * Controleur : cloturerOperation
 * Route : PUT /api/operations/:id/cloturer
 *
 * Cloture une operation portuaire en passant son statut a "cloturee".
 * Reserve au role Chef_Services.
 */
const cloturerOperation = async (req, res) => {
  const { id } = req.params;

  if (!id || isNaN(Number(id))) {
    return res.status(400).json({
      status  : 'error',
      message : 'L\'identifiant de l\'operation doit etre un nombre entier valide.',
    });
  }

  try {
    const [result] = await pool.execute(
      'UPDATE operations SET statut = ? WHERE id = ?',
      ['cloturee', id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status  : 'error',
        message : `Operation introuvable (id: ${id}).`,
      });
    }

    return res.status(200).json({
      status  : 'success',
      message : 'Operation cloturee avec succes.',
      data    : {
        id     : Number(id),
        statut : 'cloturee',
      },
    });
  } catch (error) {
    console.error('[operationController] Erreur cloturerOperation :', error.message);
    return res.status(500).json({
      status  : 'error',
      message : 'Erreur interne du serveur lors de la cloture de l\'operation.',
    });
  }
};

module.exports = { createOperation, getOperations, cloturerOperation };
