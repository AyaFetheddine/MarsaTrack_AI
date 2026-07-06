const { pool } = require('../config/db');

const buildArretPayload = ({ cause, code_arret, libelle_arret }) => {
  const normalizedCode = code_arret ? String(code_arret).trim() : '';
  const normalizedLibelle = libelle_arret ? String(libelle_arret).trim() : '';
  const normalizedCause = cause ? String(cause).trim() : '';

  if (normalizedCode && normalizedLibelle) {
    return {
      cause: `${normalizedCode} - ${normalizedLibelle}`,
      code_arret: normalizedCode,
      libelle_arret: normalizedLibelle,
    };
  }

  if (normalizedCause) {
    return {
      cause: normalizedCause,
      code_arret: null,
      libelle_arret: null,
    };
  }

  return null;
};

/**
 * Controleur : declarerArret
 * Route : POST /api/arrets
 *
 * Declare un nouvel arret de travail sur une operation.
 * Compatible avec le nouveau format code/libelle et l'ancien champ cause.
 */
const declarerArret = async (req, res) => {
  const { operation_id, cause, code_arret, libelle_arret } = req.body || {};
  const declaredBy = req.user.id;
  const arretPayload = buildArretPayload({ cause, code_arret, libelle_arret });

  if (!operation_id || !arretPayload) {
    return res.status(400).json({
      status: 'error',
      message:
        'Les champs operation_id et code/libelle arret ou cause sont obligatoires.',
    });
  }

  const heure_debut = new Date();

  try {
    const [opRows] = await pool.execute(
      'SELECT id FROM operations WHERE id = ?',
      [operation_id],
    );

    if (opRows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: `Operation introuvable (id: ${operation_id}).`,
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO arrets_travail
         (operation_id, cause, code_arret, libelle_arret, heure_debut, declared_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        operation_id,
        arretPayload.cause,
        arretPayload.code_arret,
        arretPayload.libelle_arret,
        heure_debut,
        declaredBy,
      ],
    );

    return res.status(201).json({
      status: 'success',
      message: 'Arret de travail declare avec succes.',
      data: {
        id: result.insertId,
        operation_id: Number(operation_id),
        cause: arretPayload.cause,
        code_arret: arretPayload.code_arret,
        libelle_arret: arretPayload.libelle_arret,
        heure_debut: heure_debut.toISOString(),
        heure_fin: null,
        statut: 'en cours',
        declared_by: declaredBy,
      },
    });
  } catch (error) {
    console.error('[arretController] Erreur declarerArret :', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Erreur interne du serveur lors de la declaration de l\'arret.',
    });
  }
};

/**
 * Controleur : cloturerArret
 * Route : PUT /api/arrets/:id/cloturer
 *
 * Cloture un arret de travail en renseignant son heure_fin.
 */
const cloturerArret = async (req, res) => {
  const { id } = req.params;

  if (!id || isNaN(Number(id))) {
    return res.status(400).json({
      status: 'error',
      message: 'L\'identifiant de l\'arret doit etre un nombre entier valide.',
    });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT id, heure_fin FROM arrets_travail WHERE id = ?',
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: `Arret de travail introuvable (id: ${id}).`,
      });
    }

    if (rows[0].heure_fin !== null) {
      return res.status(409).json({
        status: 'error',
        message: 'Cet arret de travail est deja cloture.',
      });
    }

    const heure_fin = new Date();

    await pool.execute('UPDATE arrets_travail SET heure_fin = ? WHERE id = ?', [
      heure_fin,
      id,
    ]);

    return res.status(200).json({
      status: 'success',
      message: 'Arret de travail cloture avec succes.',
      data: {
        id: Number(id),
        heure_fin: heure_fin.toISOString(),
      },
    });
  } catch (error) {
    console.error('[arretController] Erreur cloturerArret :', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Erreur interne du serveur lors de la cloture de l\'arret.',
    });
  }
};

/**
 * Controleur : getArrets
 * Route : GET /api/arrets
 *
 * Retourne l'historique des arrets avec leur operation et leur declarant.
 */
const getArrets = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
         a.id,
         a.operation_id,
         a.code_arret,
         a.libelle_arret,
         a.cause,
         a.heure_debut,
         a.heure_fin,
         CASE
           WHEN a.heure_fin IS NULL THEN 'en cours'
           ELSE 'cloture'
         END AS statut,
         o.nom_operation,
         o.date_operation,
         o.shift,
         o.vacation,
         u.id AS declarant_id,
         u.nom_complet AS declarant_nom_complet,
         u.matricule AS declarant_matricule,
         u.role AS declarant_role
       FROM arrets_travail a
       INNER JOIN operations o ON o.id = a.operation_id
       LEFT JOIN users u ON u.id = a.declared_by
       ORDER BY a.heure_debut DESC, a.id DESC`,
    );

    return res.status(200).json({
      status: 'success',
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error('[arretController] Erreur getArrets :', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Erreur interne du serveur lors de la recuperation des arrets.',
    });
  }
};

/**
 * Controleur : deleteArret
 * Route : DELETE /api/arrets/:id
 *
 * Supprime physiquement un arret de travail de test.
 */
const deleteArret = async (req, res) => {
  const { id } = req.params;

  if (!id || isNaN(Number(id))) {
    return res.status(400).json({
      status: 'error',
      message: 'L\'identifiant de l\'arret doit etre un nombre entier valide.',
    });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT id FROM arrets_travail WHERE id = ?',
      [id],
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Arret introuvable.',
      });
    }

    await pool.execute('DELETE FROM arrets_travail WHERE id = ?', [id]);

    return res.status(200).json({
      status: 'success',
      message: 'Arret supprime avec succes.',
      data: {
        id: Number(id),
      },
    });
  } catch (error) {
    console.error('[arretController] Erreur deleteArret :', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Erreur interne du serveur lors de la suppression de l\'arret.',
    });
  }
};

module.exports = { declarerArret, cloturerArret, getArrets, deleteArret };
