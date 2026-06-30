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
 *   "equipe"         : [3, 4, 5] // IDs de la table personnel
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
      message : 'Le champ equipe doit etre un tableau d\'identifiants personnel.',
    });
  }

  const equipeIds = [...new Set(equipe.map((personnelId) => Number(personnelId)))];
  if (equipeIds.some((personnelId) => !Number.isInteger(personnelId) || personnelId <= 0)) {
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
        'SELECT id FROM personnel WHERE disponibilite = ? AND id IN (?)',
        ['disponible', equipeIds]
      );

      if (personnelRows.length !== equipeIds.length) {
        await connection.rollback();

        return res.status(400).json({
          status  : 'error',
          message : 'Le champ equipe contient un ou plusieurs membres du personnel invalides ou indisponibles.',
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
      const values = equipeIds.map((personnelId) => [operationId, personnelId]);

      await connection.query(
        'INSERT INTO operation_personnel (operation_id, personnel_id) VALUES ?',
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

    if (rows.length === 0) {
      return res.status(200).json({
        status : 'success',
        count  : 0,
        data   : [],
      });
    }

    const operationIds = rows.map((operation) => operation.id);
    const [personnelRows] = await pool.query(
      `SELECT
         op.operation_id,
         p.id,
         p.matricule,
         p.nom_complet,
         p.fonction,
         p.disponibilite
       FROM operation_personnel op
       INNER JOIN personnel p ON p.id = op.personnel_id
       WHERE op.operation_id IN (?)
       ORDER BY p.fonction ASC, p.nom_complet ASC`,
      [operationIds]
    );

    const personnelByOperation = personnelRows.reduce((acc, member) => {
      if (!acc[member.operation_id]) {
        acc[member.operation_id] = [];
      }

      acc[member.operation_id].push({
        id             : member.id,
        matricule      : member.matricule,
        nom_complet    : member.nom_complet,
        fonction       : member.fonction,
        disponibilite  : member.disponibilite,
      });

      return acc;
    }, {});

    const operations = rows.map((operation) => ({
      ...operation,
      personnel: personnelByOperation[operation.id] || [],
    }));

    return res.status(200).json({
      status : 'success',
      count  : operations.length,
      data   : operations,
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
