const { pool } = require('../config/db');

// ISO 6346 simplifie : exactement 4 lettres majuscules puis 7 chiffres.
const ISO_6346_REGEX = /^[A-Z]{4}\d{7}$/;

/**
 * Controleur : saisirContainer
 * Route : POST /api/containers
 *
 * Enregistre la saisie terrain d'un conteneur pour une operation.
 * La confiance IA reste NULL pour l'instant, en attendant l'integration YOLOv11.
 */
const saisirContainer = async (req, res) => {
  const { operation_id, matricule_iso, image_url } = req.body;
  const ai_confidence = null;

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
      `INSERT INTO container (operation_id, matricule_iso, image_url, ai_confidence)
       VALUES (?, ?, ?, ?)`,
      [operation_id, matricule_iso, image_url, ai_confidence]
    );

    return res.status(201).json({
      status  : 'success',
      message : 'Conteneur saisi avec succes.',
      data    : {
        id            : result.insertId,
        operation_id  : Number(operation_id),
        matricule_iso,
        image_url,
        ai_confidence,
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

module.exports = { saisirContainer };
