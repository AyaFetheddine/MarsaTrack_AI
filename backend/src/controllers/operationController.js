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
 *   "numero_escale"  : "202606025",
 *   "nom_navire"     : "CORELLI",
 *   "poste_quai"     : "Quai 3",
 *   "type_operation" : "DECHARGEMENT",
 *   "equipe"         : [3, 4, 5] // IDs de la table personnel
 * }
 */
const createOperation = async (req, res) => {
  const {
    nom_operation,
    date_operation,
    shift,
    vacation,
    numero_escale = null,
    nom_navire = null,
    poste_quai = null,
    type_operation = 'MANUTENTION',
    equipe = [],
  } = req.body;

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

  const typesOperationValides = ['CHARGEMENT', 'DECHARGEMENT', 'MANUTENTION'];
  if (!typesOperationValides.includes(type_operation)) {
    return res.status(400).json({
      status  : 'error',
      message : 'Le type d\'operation doit etre CHARGEMENT, DECHARGEMENT ou MANUTENTION.',
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
      `INSERT INTO operations (
         nom_operation,
         date_operation,
         shift,
         vacation,
         numero_escale,
         nom_navire,
         poste_quai,
         type_operation
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nom_operation,
        date_operation,
        shift,
        vacation,
        numero_escale || null,
        nom_navire || null,
        poste_quai || null,
        type_operation,
      ]
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
        numero_escale : numero_escale || null,
        nom_navire    : nom_navire || null,
        poste_quai    : poste_quai || null,
        type_operation,
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
      `SELECT
         id,
         nom_operation,
         date_operation,
         shift,
         vacation,
         numero_escale,
         nom_navire,
         poste_quai,
         type_operation,
         statut
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

/**
 * Controleur : annulerOperation
 * Route : PUT /api/operations/:id/annuler
 *
 * Annule une operation creee par erreur, uniquement si elle n'a pas encore
 * d'arrets ou de conteneurs associes.
 */
const annulerOperation = async (req, res) => {
  const { id } = req.params;

  if (!id || isNaN(Number(id))) {
    return res.status(400).json({
      status  : 'error',
      message : 'L\'identifiant de l\'operation doit etre un nombre entier valide.',
    });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [operationRows] = await connection.execute(
      'SELECT id, statut FROM operations WHERE id = ?',
      [id]
    );

    if (operationRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        status  : 'error',
        message : 'Operation introuvable.',
      });
    }

    const operation = operationRows[0];

    if (operation.statut === 'cloturee') {
      await connection.rollback();

      return res.status(409).json({
        status  : 'error',
        message : 'Une operation cloturee ne peut pas etre annulee.',
      });
    }

    if (operation.statut === 'annulee') {
      await connection.rollback();

      return res.status(409).json({
        status  : 'error',
        message : 'Cette operation est deja annulee.',
      });
    }

    const [[arretCount]] = await connection.execute(
      'SELECT COUNT(*) AS total FROM arrets_travail WHERE operation_id = ?',
      [id]
    );
    const [[containerCount]] = await connection.execute(
      'SELECT COUNT(*) AS total FROM container WHERE operation_id = ?',
      [id]
    );

    const arretsCount = Number(arretCount.total);
    const containersCount = Number(containerCount.total);

    if (arretsCount > 0 || containersCount > 0) {
      await connection.rollback();

      return res.status(409).json({
        status  : 'error',
        message : `Annulation impossible. Cette operation possede deja ${arretsCount} arret(s) de travail et ${containersCount} conteneur(s) saisi(s). Elle ne peut pas etre annulee car elle a deja produit de l'historique metier.`,
        details : {
          arrets_count     : arretsCount,
          containers_count : containersCount,
        },
      });
    }

    await connection.execute(
      'DELETE FROM operation_personnel WHERE operation_id = ?',
      [id]
    );
    await connection.execute(
      'DELETE FROM operation_equipe WHERE operation_id = ?',
      [id]
    );
    await connection.execute(
      'UPDATE operations SET statut = ? WHERE id = ?',
      ['annulee', id]
    );

    await connection.commit();

    return res.status(200).json({
      status  : 'success',
      message : 'Operation annulee avec succes.',
      data    : {
        id     : Number(id),
        statut : 'annulee',
      },
    });
  } catch (error) {
    if (connection) await connection.rollback();

    console.error('[operationController] Erreur annulerOperation :', error.message);
    return res.status(500).json({
      status  : 'error',
      message : 'Erreur interne du serveur lors de l\'annulation de l\'operation.',
    });
  } finally {
    if (connection) connection.release();
  }
};

/**
 * Controleur : deleteOperation
 * Route : DELETE /api/operations/:id
 *
 * Supprime une operation uniquement si elle n'a pas encore d'historique metier.
 * Reserve au role Admin.
 */
const deleteOperation = async (req, res) => {
  const { id } = req.params;

  if (!id || isNaN(Number(id))) {
    return res.status(400).json({
      status  : 'error',
      message : 'L\'identifiant de l\'operation doit etre un nombre entier valide.',
    });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [operationRows] = await connection.execute(
      'SELECT id FROM operations WHERE id = ?',
      [id]
    );

    if (operationRows.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        status  : 'error',
        message : 'Operation introuvable.',
      });
    }

    const [[arretCount]] = await connection.execute(
      'SELECT COUNT(*) AS total FROM arrets_travail WHERE operation_id = ?',
      [id]
    );
    const [[containerCount]] = await connection.execute(
      'SELECT COUNT(*) AS total FROM container WHERE operation_id = ?',
      [id]
    );

    const arretsCount = Number(arretCount.total);
    const containersCount = Number(containerCount.total);

    if (arretsCount > 0 || containersCount > 0) {
      await connection.rollback();

      return res.status(409).json({
        status  : 'error',
        message : `Cette operation possede deja ${arretsCount} arret(s) de travail et ${containersCount} conteneur(s) saisi(s). Elle ne peut pas etre supprimee afin de preserver l'historique metier.`,
        details : {
          arrets_count     : arretsCount,
          containers_count : containersCount,
        },
      });
    }

    await connection.execute(
      'DELETE FROM operation_personnel WHERE operation_id = ?',
      [id]
    );
    await connection.execute(
      'DELETE FROM operation_equipe WHERE operation_id = ?',
      [id]
    );
    await connection.execute(
      'DELETE FROM operations WHERE id = ?',
      [id]
    );

    await connection.commit();

    return res.status(200).json({
      status  : 'success',
      message : 'Operation supprimee avec succes.',
      data    : {
        id: Number(id),
      },
    });
  } catch (error) {
    if (connection) await connection.rollback();

    console.error('[operationController] Erreur deleteOperation :', error.message);
    return res.status(500).json({
      status  : 'error',
      message : 'Erreur interne du serveur lors de la suppression de l\'operation.',
    });
  } finally {
    if (connection) connection.release();
  }
};

module.exports = {
  annulerOperation,
  createOperation,
  deleteOperation,
  getOperations,
  cloturerOperation,
};
