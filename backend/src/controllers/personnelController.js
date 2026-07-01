const { pool } = require('../config/db');

const fonctionsValides = [
  'Portiqueur',
  'Equipage',
  'Conducteur',
  'Pointeur',
  'Agent_Terrain',
  'Sous_Traitant',
  'Autre',
];

const disponibilitesValides = ['disponible', 'affecte', 'indisponible'];

const validatePersonnelPayload = ({
  matricule,
  nom_complet,
  fonction,
  disponibilite = 'disponible',
}) => {
  if (!matricule || !nom_complet || !fonction || !disponibilite) {
    return 'Les champs matricule, nom_complet, fonction et disponibilite sont obligatoires.';
  }

  if (!fonctionsValides.includes(fonction)) {
    return `Fonction invalide. Valeurs acceptees : ${fonctionsValides.join(', ')}.`;
  }

  if (!disponibilitesValides.includes(disponibilite)) {
    return `Disponibilite invalide. Valeurs acceptees : ${disponibilitesValides.join(', ')}.`;
  }

  return null;
};

const getPersonnel = async (req, res) => {
  const { fonction, disponibilite } = req.query;
  const conditions = [];
  const params = [];

  if (fonction) {
    if (!fonctionsValides.includes(fonction)) {
      return res.status(400).json({
        status  : 'error',
        message : `Fonction invalide. Valeurs acceptees : ${fonctionsValides.join(', ')}.`,
      });
    }

    conditions.push('fonction = ?');
    params.push(fonction);
  }

  if (disponibilite) {
    if (!disponibilitesValides.includes(disponibilite)) {
      return res.status(400).json({
        status  : 'error',
        message : `Disponibilite invalide. Valeurs acceptees : ${disponibilitesValides.join(', ')}.`,
      });
    }

    conditions.push('disponibilite = ?');
    params.push(disponibilite);
  }

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : '';

  try {
    const [rows] = await pool.execute(
      `SELECT id, matricule, nom_complet, fonction, disponibilite, created_at
       FROM personnel
       ${whereClause}
       ORDER BY fonction ASC, nom_complet ASC`,
      params
    );

    return res.status(200).json({
      status : 'success',
      count  : rows.length,
      data   : rows,
    });
  } catch (error) {
    console.error('[personnelController] Erreur getPersonnel :', error.message);
    return res.status(500).json({
      status  : 'error',
      message : 'Erreur interne du serveur lors de la recuperation du personnel.',
    });
  }
};

const createPersonnel = async (req, res) => {
  const {
    matricule,
    nom_complet,
    fonction,
    disponibilite = 'disponible',
  } = req.body;

  const validationError = validatePersonnelPayload({
    matricule,
    nom_complet,
    fonction,
    disponibilite,
  });

  if (validationError) {
    return res.status(400).json({
      status  : 'error',
      message : validationError,
    });
  }

  try {
    const [result] = await pool.execute(
      `INSERT INTO personnel (matricule, nom_complet, fonction, disponibilite)
       VALUES (?, ?, ?, ?)`,
      [matricule, nom_complet, fonction, disponibilite]
    );

    return res.status(201).json({
      status  : 'success',
      message : 'Personnel ajoute avec succes.',
      data    : {
        id: result.insertId,
        matricule,
        nom_complet,
        fonction,
        disponibilite,
      },
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({
        status  : 'error',
        message : 'Ce matricule existe deja dans le personnel.',
      });
    }

    console.error('[personnelController] Erreur createPersonnel :', error.message);
    return res.status(500).json({
      status  : 'error',
      message : 'Erreur interne du serveur lors de la creation du personnel.',
    });
  }
};

const updatePersonnel = async (req, res) => {
  const { id } = req.params;
  const {
    matricule,
    nom_complet,
    fonction,
    disponibilite = 'disponible',
  } = req.body;

  const validationError = validatePersonnelPayload({
    matricule,
    nom_complet,
    fonction,
    disponibilite,
  });

  if (validationError) {
    return res.status(400).json({
      status  : 'error',
      message : validationError,
    });
  }

  try {
    const [duplicates] = await pool.execute(
      'SELECT id FROM personnel WHERE matricule = ? AND id <> ? LIMIT 1',
      [matricule, id]
    );

    if (duplicates.length > 0) {
      return res.status(409).json({
        status  : 'error',
        message : 'Ce matricule existe deja pour un autre personnel.',
      });
    }

    const [result] = await pool.execute(
      `UPDATE personnel
       SET matricule = ?, nom_complet = ?, fonction = ?, disponibilite = ?
       WHERE id = ?`,
      [matricule, nom_complet, fonction, disponibilite, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status  : 'error',
        message : 'Personnel introuvable.',
      });
    }

    return res.status(200).json({
      status  : 'success',
      message : 'Personnel modifie avec succes.',
      data    : {
        id: Number(id),
        matricule,
        nom_complet,
        fonction,
        disponibilite,
      },
    });
  } catch (error) {
    console.error('[personnelController] Erreur updatePersonnel :', error.message);
    return res.status(500).json({
      status  : 'error',
      message : 'Erreur interne du serveur lors de la modification du personnel.',
    });
  }
};

const disablePersonnel = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.execute(
      `UPDATE personnel
       SET disponibilite = 'indisponible'
       WHERE id = ?`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status  : 'error',
        message : 'Personnel introuvable.',
      });
    }

    return res.status(200).json({
      status  : 'success',
      message : 'Personnel desactive avec succes.',
    });
  } catch (error) {
    console.error('[personnelController] Erreur disablePersonnel :', error.message);
    return res.status(500).json({
      status  : 'error',
      message : 'Erreur interne du serveur lors de la desactivation du personnel.',
    });
  }
};

const deletePersonnel = async (req, res) => {
  const { id } = req.params;

  try {
    const [assignments] = await pool.execute(
      'SELECT operation_id FROM operation_personnel WHERE personnel_id = ? LIMIT 1',
      [id]
    );

    if (assignments.length > 0) {
      return res.status(409).json({
        status  : 'error',
        message : 'Ce personnel est deja affecte a une ou plusieurs operations. Vous pouvez le desactiver, mais pas le supprimer.',
      });
    }

    const [result] = await pool.execute(
      'DELETE FROM personnel WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        status  : 'error',
        message : 'Personnel introuvable.',
      });
    }

    return res.status(200).json({
      status  : 'success',
      message : 'Personnel supprime avec succes.',
    });
  } catch (error) {
    console.error('[personnelController] Erreur deletePersonnel :', error.message);
    return res.status(500).json({
      status  : 'error',
      message : 'Erreur interne du serveur lors de la suppression du personnel.',
    });
  }
};

module.exports = {
  createPersonnel,
  deletePersonnel,
  disablePersonnel,
  getPersonnel,
  updatePersonnel,
};
