const { pool } = require('../config/db');

/**
 * Controleur : createOperation
 * Route : POST /api/operations
 *
 * Cree une nouvelle operation portuaire et affecte, si fourni, le personnel terrain.
 *
 * Body attendu :
 * {
 *   "nom_operation"  : "Dechargement MSC ANNA - Quai 5",
 *   "date_operation" : "2026-06-03",
 *   "shift"          : "Shift 1",
 *   "vacation"       : "Vacation 1",
 *   "equipe"         : [3, 4, 5]
 * }
 */
const createOperation = async (req, res) => {
  const { nom_operation, date_operation, shift, vacation, equipe = [] } = req.body;

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
      message : `Shift invalide. Valeurs acceptees : ${shiftsValides.join(', ')}.`,
    });
  }

  // Validation des valeurs ENUM de la vacation
  const vacationsValides = ['Vacation 1', 'Vacation 2'];
  if (!vacationsValides.includes(vacation)) {
    return res.status(400).json({
      status  : 'error',
      message : `Vacation invalide. Valeurs acceptees : ${vacationsValides.join(', ')}.`,
    });
  }

  if (!Array.isArray(equipe)) {
    return res.status(400).json({
      status  : 'error',
      message : 'Le champ equipe doit etre un tableau d\'identifiants utilisateurs.',
    });
  }

  const equipeIds = [...new Set(equipe.map((userId) => Number(userId)))];
  if (equipeIds.some((userId) => !Number.isInteger(userId) || userId <= 0)) {
    return res.status(400).json({
      status  : 'error',
      message : 'Chaque identifiant dans equipe doit etre un entier positif.',
    });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    if (equipeIds.length > 0) {
      const [personnelRows] = await connection.query(
        'SELECT id FROM users WHERE role IN (?, ?) AND id IN (?)',
        ['Portiqueur', 'Equipage', equipeIds]
      );

      if (personnelRows.length !== equipeIds.length) {
        await connection.rollback();

        return res.status(400).json({
          status  : 'error',
          message : 'Le champ equipe contient un ou plusieurs utilisateurs invalides ou non affectables.',
        });
      }
    }

    const [result] = await connection.execute(
      `INSERT INTO operations (nom_operation, date_operation, shift, vacation)
       VALUES (?, ?, ?, ?)`,
      [nom_operation, date_operation, shift, vacation]
    );

    const operationId = result.insertId;

    if (equipeIds.length > 0) {
      const values = equipeIds.map((userId) => [operationId, userId]);

      await connection.query(
        'INSERT INTO operation_equipe (operation_id, user_id) VALUES ?',
        [values]
      );
    }

    await connection.commit();

    return res.status(201).json({
      status  : 'success',
      message : 'Operation creee avec succes.',
      data    : {
        id            : operationId,
        nom_operation,
        date_operation,
        shift,
        vacation,
        statut        : 'en cours',
        equipe        : equipeIds,
      },
    });
  } catch (error) {
    if (connection) await connection.rollback();

    console.error('[operationController] Erreur createOperation :', error.message);
    return res.status(500).json({
      status  : 'error',
      message : 'Erreur interne du serveur lors de la creation de l\'operation.',
    });
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Controleur : getOperations
 * Route : GET /api/operations
 *
 * Recupere la liste complete des operations, triees par date decroissante.
 * Accessible a tous les utilisateurs authentifies (lecture seule).
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
      message : 'Erreur interne du serveur lors de la recuperation des operations.',
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
