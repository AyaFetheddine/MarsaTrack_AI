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

  if (!matricule || !nom_complet || !fonction) {
    return res.status(400).json({
      status  : 'error',
      message : 'Les champs matricule, nom_complet et fonction sont obligatoires.',
    });
  }

  if (!fonctionsValides.includes(fonction)) {
    return res.status(400).json({
      status  : 'error',
      message : `Fonction invalide. Valeurs acceptees : ${fonctionsValides.join(', ')}.`,
    });
  }

  if (!disponibilitesValides.includes(disponibilite)) {
    return res.status(400).json({
      status  : 'error',
      message : `Disponibilite invalide. Valeurs acceptees : ${disponibilitesValides.join(', ')}.`,
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

module.exports = { getPersonnel, createPersonnel };
