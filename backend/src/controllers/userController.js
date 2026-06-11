const { pool } = require('../config/db');

/**
 * Controleur : getPersonnel
 * Route : GET /api/users/personnel
 *
 * Recupere uniquement le personnel terrain affectable a une operation.
 */
const getPersonnel = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, nom_complet, matricule, role
       FROM users
       WHERE role IN (?, ?)
       ORDER BY role ASC, nom_complet ASC`,
      ['Portiqueur', 'Equipage']
    );

    return res.status(200).json({
      status : 'success',
      count  : rows.length,
      data   : rows,
    });
  } catch (error) {
    console.error('[userController] Erreur getPersonnel :', error.message);
    return res.status(500).json({
      status  : 'error',
      message : 'Erreur interne du serveur lors de la recuperation du personnel.',
    });
  }
};

module.exports = { getPersonnel };
