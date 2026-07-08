const fs = require('fs');

const { pool } = require('../config/db');

// ISO 6346 simplifie : exactement 4 lettres majuscules puis 7 chiffres.
const ISO_6346_REGEX = /^[A-Z]{4}\d{7}$/;
const ALLOWED_MOUVEMENTS = ['IMPORT', 'EXPORT'];
const ALLOWED_DETECTION_SOURCES = ['MANUELLE', 'IA_VALIDEE', 'IA_CORRIGEE'];

const cleanupUploadedFile = (file) => {
  if (!file?.path) return;

  fs.unlink(file.path, (error) => {
    if (error) {
      console.error('[containerController] Erreur suppression fichier upload :', error.message);
    }
  });
};

/**
 * Controleur : saisirContainer
 * Route : POST /api/containers
 *
 * Enregistre la saisie terrain d'un conteneur pour une operation.
 * Le matricule_iso reste la valeur finale validee par l'utilisateur.
 * detected_iso et detection_source gardent la trace du flux Vision IA simule.
 */
const saisirContainer = async (req, res) => {
  const {
    operation_id,
    matricule_iso,
    image_url,
    detected_iso,
    ai_confidence,
  } = req.body;
  const mouvement = req.body.mouvement || 'IMPORT';
  const detectionSource = req.body.detection_source || 'MANUELLE';
  const storedImageUrl = req.file
    ? `/uploads/containers/${req.file.filename}`
    : image_url?.trim() || null;
  const normalizedMatriculeIso = matricule_iso?.trim().toUpperCase();
  const normalizedDetectedIso = detected_iso?.trim().toUpperCase() || null;
  const createdBy = req.user.id;

  // Validation des champs obligatoires
  if (!operation_id || !matricule_iso) {
    cleanupUploadedFile(req.file);
    return res.status(400).json({
      status  : 'error',
      message : 'Les champs operation_id et matricule_iso sont obligatoires.',
    });
  }

  if (isNaN(Number(operation_id))) {
    cleanupUploadedFile(req.file);
    return res.status(400).json({
      status  : 'error',
      message : 'L\'identifiant de l\'operation doit etre un nombre entier valide.',
    });
  }

  // Regex ISO 6346 : 4 lettres majuscules (proprietaire + categorie) suivies de 7 chiffres.
  if (!ISO_6346_REGEX.test(normalizedMatriculeIso)) {
    cleanupUploadedFile(req.file);
    return res.status(400).json({
      status  : 'error',
      message : 'Format matricule_iso invalide. Format attendu : 4 lettres majuscules suivies de 7 chiffres (ex: MSCU1234567).',
    });
  }

  if (!ALLOWED_MOUVEMENTS.includes(mouvement)) {
    cleanupUploadedFile(req.file);
    return res.status(400).json({
      status  : 'error',
      message : 'Le mouvement doit etre IMPORT ou EXPORT.',
    });
  }

  if (!ALLOWED_DETECTION_SOURCES.includes(detectionSource)) {
    cleanupUploadedFile(req.file);
    return res.status(400).json({
      status  : 'error',
      message : 'La source de detection doit etre MANUELLE, IA_VALIDEE ou IA_CORRIGEE.',
    });
  }

  if (detectionSource !== 'MANUELLE' && !normalizedDetectedIso) {
    cleanupUploadedFile(req.file);
    return res.status(400).json({
      status  : 'error',
      message : 'Le matricule detecte par IA est obligatoire pour une saisie IA.',
    });
  }

  if (normalizedDetectedIso && !ISO_6346_REGEX.test(normalizedDetectedIso)) {
    cleanupUploadedFile(req.file);
    return res.status(400).json({
      status  : 'error',
      message : 'Format detected_iso invalide. Format attendu : 4 lettres majuscules suivies de 7 chiffres.',
    });
  }

  const normalizedAiConfidence = ai_confidence === undefined || ai_confidence === ''
    ? null
    : Number(ai_confidence);

  if (
    normalizedAiConfidence !== null &&
    (Number.isNaN(normalizedAiConfidence) ||
      normalizedAiConfidence < 0 ||
      normalizedAiConfidence > 1)
  ) {
    cleanupUploadedFile(req.file);
    return res.status(400).json({
      status  : 'error',
      message : 'La confiance IA doit etre comprise entre 0 et 1.',
    });
  }

  const storedDetectedIso = detectionSource === 'MANUELLE' ? null : normalizedDetectedIso;
  const storedAiConfidence = detectionSource === 'MANUELLE' ? null : normalizedAiConfidence;

  if (!storedImageUrl) {
    cleanupUploadedFile(req.file);
    return res.status(400).json({
      status  : 'error',
      message : 'Importez une image du conteneur ou renseignez une URL image.',
    });
  }

  try {
    // Verification que l'operation referencee existe bien
    const [opRows] = await pool.execute(
      'SELECT id FROM operations WHERE id = ?',
      [operation_id]
    );

    if (opRows.length === 0) {
      cleanupUploadedFile(req.file);
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
         detected_iso,
         detection_source,
         ai_confidence,
         created_by
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        operation_id,
        normalizedMatriculeIso,
        storedImageUrl,
        mouvement,
        storedDetectedIso,
        detectionSource,
        storedAiConfidence,
        createdBy,
      ]
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
        matricule_iso : normalizedMatriculeIso,
        image_url     : storedImageUrl,
        mouvement,
        detected_iso  : storedDetectedIso,
        detection_source: detectionSource,
        ai_confidence : storedAiConfidence,
        created_by    : createdBy,
        created_at    : createdRows[0].created_at,
      },
    });
  } catch (error) {
    cleanupUploadedFile(req.file);
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
         c.detected_iso,
         c.detection_source,
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

/**
 * Controleur : deleteContainer
 * Route : DELETE /api/containers/:id
 *
 * Supprime physiquement un conteneur de test.
 * Reserve au role Admin.
 */
const deleteContainer = async (req, res) => {
  const { id } = req.params;

  if (!id || isNaN(Number(id))) {
    return res.status(400).json({
      status  : 'error',
      message : 'L\'identifiant du conteneur doit etre un nombre entier valide.',
    });
  }

  try {
    const [rows] = await pool.execute(
      'SELECT id FROM container WHERE id = ?',
      [id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        status  : 'error',
        message : 'Conteneur introuvable.',
      });
    }

    await pool.execute('DELETE FROM container WHERE id = ?', [id]);

    return res.status(200).json({
      status  : 'success',
      message : 'Conteneur supprime avec succes.',
      data    : {
        id: Number(id),
      },
    });
  } catch (error) {
    console.error('[containerController] Erreur deleteContainer :', error.message);
    return res.status(500).json({
      status  : 'error',
      message : 'Erreur interne du serveur lors de la suppression du conteneur.',
    });
  }
};

module.exports = { saisirContainer, getContainers, deleteContainer };
