const { pool } = require('../config/db');

// ISO 6346 simplifie : exactement 4 lettres majuscules puis 7 chiffres.
const ISO_6346_REGEX = /^[A-Z]{4}\d{7}$/;
const ALLOWED_MOUVEMENTS = ['IMPORT', 'EXPORT'];

/**
 * Controleur : saisirContainer
 * Route : POST /api/containers
 *
 * Enregistre la saisie terrain d'un conteneur pour une operation.
 * La confiance IA reste NULL pour l'instant, en attendant l'integration YOLOv11.
 */
const saisirContainer = async (req, res) => {
  const { operation_id, matricule_iso, image_url } = req.body;
  const mouvement = req.body.mouvement || 'IMPORT';
  const ai_confidence = null;
  const createdBy = req.user.id;

  // Validation des champs obligatoires
  if (!operation_id || !matricule_iso || !image_url) {
    return res.status(400).json({
      status  : 'error',
      message : 'Les champs operation_id, matricule_iso et image_url sont obligatoires.',
    });
  }

  if (isNaN(Number(operation_id))) {
    return res.status(400).json({
      status  : 'error',
      message : 'L\'identifiant de l\'operation doit etre un nombre entier valide.',
    });
  }

  // Regex ISO 6346 : 4 lettres majuscules (proprietaire + categorie) suivies de 7 chiffres.
  if (!ISO_6346_REGEX.test(matricule_iso)) {
    return res.status(400).json({
      status  : 'error',
      message : 'Format matricule_iso invalide. Format attendu : 4 lettres majuscules suivies de 7 chiffres (ex: MSCU1234567).',
    });
  }

  if (!ALLOWED_MOUVEMENTS.includes(mouvement)) {
    return res.status(400).json({
      status  : 'error',
      message : 'Le mouvement doit etre IMPORT ou EXPORT.',
    });
  }

  try {
    // Verification que l'operation referencee existe bien
    const [opRows] = await pool.execute(
      'SELECT id FROM operations WHERE id = ?',
      [operation_id]
    );

    if (opRows.length === 0) {
      return res.status(404).json({
        status  : 'error',
        message : `Operation introuvable (id: ${operation_id}).`,
      });
    }

    const [result] = await pool.execute(
      `INSERT INTO container (
         operation_id,
         matricule_iso,
         image_url,
         mouvement,
         ai_confidence,
         created_by
       )
       VALUES (?, ?, ?, ?, ?, ?)`,
      [operation_id, matricule_iso, image_url, mouvement, ai_confidence, createdBy]
    );

    const [createdRows] = await pool.execute(
      'SELECT created_at FROM container WHERE id = ?',
      [result.insertId]
    );

    return res.status(201).json({
      status  : 'success',
      message : 'Conteneur saisi avec succes.',
      data    : {
        id            : result.insertId,
        operation_id  : Number(operation_id),
        matricule_iso,
        image_url,
        mouvement,
        ai_confidence,
        created_by    : createdBy,
        created_at    : createdRows[0].created_at,
      },
    });
  } catch (error) {
    console.error('[containerController] Erreur saisirContainer :', error.message);
    return res.status(500).json({
      status  : 'error',
      message : 'Erreur interne du serveur lors de la saisie du conteneur.',
    });
  }
};

/**
 * Controleur : getContainers
 * Route : GET /api/containers
 *
 * Retourne l'historique des conteneurs avec leur operation, leur date de
 * creation et l'utilisateur ayant effectue la saisie.
 */
const getContainers = async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT
         c.id,
         c.operation_id,
         c.matricule_iso,
         c.image_url,
         c.mouvement,
         c.ai_confidence,
         c.created_at,
         o.nom_operation,
         o.date_operation,
         o.shift,
         o.vacation,
         u.id AS auteur_id,
         u.nom_complet AS auteur_nom_complet,
         u.matricule AS auteur_matricule,
         u.role AS auteur_role
       FROM container c
       INNER JOIN operations o ON o.id = c.operation_id
       LEFT JOIN users u ON u.id = c.created_by
       ORDER BY c.created_at DESC, c.id DESC`
    );

    return res.status(200).json({
      status : 'success',
      count  : rows.length,
      data   : rows,
    });
  } catch (error) {
    console.error('[containerController] Erreur getContainers :', error.message);
    return res.status(500).json({
      status  : 'error',
      message : 'Erreur interne du serveur lors de la recuperation des conteneurs.',
    });
  }
};

module.exports = { saisirContainer, getContainers };
