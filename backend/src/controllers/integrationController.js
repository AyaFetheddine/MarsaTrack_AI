const { pool } = require('../config/db');

/**
 * Controleur d'integration — LECTURE SEULE.
 *
 * Fournit a MarsaBot Factory un instantane compact de l'etat operationnel.
 * MarsaBot appelle une URL fixe a chaque message recu et injecte la reponse
 * entiere dans le contexte du LLM : le volume est donc borne volontairement,
 * et les libelles de champs sont explicites pour etre lisibles par un modele.
 *
 * Aucune donnee personnelle au-dela du nom et de la fonction (pas de matricule,
 * pas d'identifiant de badge).
 */

// Bornes de volume : l'instantane entre dans le prompt a chaque message.
const MAX_OPERATIONS = 10;
const MAX_PERSONNELS_PAR_OPERATION = 12;
const MAX_ARRETS_PAR_OPERATION = 5;

/**
 * Deduit le shift et la vacation en cours a partir de l'heure locale.
 * Modelisation 24/7 du terminal :
 *   Shift 1 : 07h-15h   (Vacation 1 : 07h-11h, Vacation 2 : 11h-15h)
 *   Shift 2 : 15h-23h   (Vacation 1 : 15h-19h, Vacation 2 : 19h-23h)
 *   Shift 3 : 23h-07h   (Vacation 1 : 23h-03h, Vacation 2 : 03h-07h)
 */
const resoudreShiftCourant = (maintenant = new Date()) => {
  const heure = maintenant.getHours();

  if (heure >= 7 && heure < 15) {
    return { shift: 'Shift 1', vacation: heure < 11 ? 'Vacation 1' : 'Vacation 2' };
  }

  if (heure >= 15 && heure < 23) {
    return { shift: 'Shift 2', vacation: heure < 19 ? 'Vacation 1' : 'Vacation 2' };
  }

  // 23h-07h, a cheval sur minuit
  return { shift: 'Shift 3', vacation: heure >= 23 || heure < 3 ? 'Vacation 1' : 'Vacation 2' };
};

/** Duree ecoulee en minutes depuis une date, jamais negative. */
const dureeEnMinutesDepuis = (debut) => {
  if (!debut) return null;

  const ecoule = Math.round((Date.now() - new Date(debut).getTime()) / 60000);

  return ecoule >= 0 ? ecoule : null;
};

/** Format ISO court, ou null : evite les dates natives serialisees differemment. */
const enIso = (valeur) => (valeur ? new Date(valeur).toISOString() : null);

/**
 * Nettoie une valeur texte destinee au contexte d'un LLM : espaces et
 * tabulations de bord retires, chaine vide ramenee a null. Des tabulations
 * collees par un copier-coller dans l'interface se retrouvent sinon telles
 * quelles dans le prompt.
 */
const texte = (valeur) => {
  if (typeof valeur !== 'string') return valeur === undefined ? null : valeur;

  const nettoye = valeur.replace(/\s+/g, ' ').trim();

  return nettoye || null;
};

/** Construit "?, ?, ?" pour une clause IN, mysql2 n'etend pas les tableaux. */
const placeholders = (liste) => liste.map(() => '?').join(', ');

/**
 * Controleur : getEtatOperationnel
 * Route : GET /api/integration/etat-operationnel
 *
 * Retourne les operations en cours ou du jour, avec les personnels affectes
 * et les arrets de travail encore ouverts.
 */
const getEtatOperationnel = async (req, res) => {
  try {
    const { shift, vacation } = resoudreShiftCourant();

    // 1. Operations pertinentes : en cours, ou datees d'aujourd'hui.
    const [operations] = await pool.execute(
      `SELECT id,
              nom_operation,
              nom_navire,
              numero_escale,
              poste_quai,
              type_operation,
              statut,
              DATE_FORMAT(date_operation, '%Y-%m-%d') AS date_operation,
              shift,
              vacation
         FROM operations
        WHERE statut = 'en cours' OR date_operation = CURDATE()
        ORDER BY date_operation DESC, id DESC
        LIMIT ${MAX_OPERATIONS + 1}`,
    );

    const operationsTronquees = operations.length > MAX_OPERATIONS;
    const retenues = operations.slice(0, MAX_OPERATIONS);
    const ids = retenues.map((operation) => operation.id);

    // 2. Personnels affectes et arrets ouverts, en deux requetes groupees.
    let personnels = [];
    let arrets = [];

    if (ids.length > 0) {
      const marqueurs = placeholders(ids);

      [personnels] = await pool.execute(
        `SELECT op.operation_id,
                p.nom_complet,
                p.fonction
           FROM operation_personnel op
           JOIN personnel p ON p.id = op.personnel_id
          WHERE op.operation_id IN (${marqueurs})
          ORDER BY op.operation_id, p.nom_complet`,
        ids,
      );

      [arrets] = await pool.execute(
        `SELECT operation_id,
                cause,
                code_arret,
                libelle_arret,
                heure_debut
           FROM arrets_travail
          WHERE operation_id IN (${marqueurs})
            AND heure_fin IS NULL
          ORDER BY operation_id, heure_debut DESC`,
        ids,
      );
    }

    // 3. Regroupement par operation, avec bornes de volume.
    const parOperation = new Map(ids.map((id) => [id, { personnels: [], arrets: [] }]));

    for (const ligne of personnels) {
      const groupe = parOperation.get(ligne.operation_id);
      if (groupe && groupe.personnels.length < MAX_PERSONNELS_PAR_OPERATION) {
        groupe.personnels.push({
          nom_complet: texte(ligne.nom_complet),
          fonction   : ligne.fonction,
        });
      }
    }

    for (const ligne of arrets) {
      const groupe = parOperation.get(ligne.operation_id);
      if (groupe && groupe.arrets.length < MAX_ARRETS_PAR_OPERATION) {
        groupe.arrets.push({
          motif             : texte(ligne.cause),
          code_arret        : texte(ligne.code_arret),
          libelle_arret     : texte(ligne.libelle_arret),
          debut             : enIso(ligne.heure_debut),
          duree_minutes     : dureeEnMinutesDepuis(ligne.heure_debut),
        });
      }
    }

    const operationsPayload = retenues.map((operation) => {
      const groupe = parOperation.get(operation.id) || { personnels: [], arrets: [] };

      return {
        identifiant             : operation.id,
        nom_operation           : texte(operation.nom_operation),
        navire                  : texte(operation.nom_navire),
        numero_escale           : texte(operation.numero_escale),
        poste_quai              : texte(operation.poste_quai),
        type_operation          : operation.type_operation,
        statut                  : operation.statut,
        date_operation          : operation.date_operation,
        shift                   : operation.shift,
        vacation                : operation.vacation,
        personnels_affectes     : groupe.personnels,
        nombre_personnels       : groupe.personnels.length,
        arrets_de_travail_actifs: groupe.arrets,
        nombre_arrets_actifs    : groupe.arrets.length,
      };
    });

    const totalPersonnels = operationsPayload.reduce((n, o) => n + o.nombre_personnels, 0);
    const totalArrets = operationsPayload.reduce((n, o) => n + o.nombre_arrets_actifs, 0);

    return res.status(200).json({
      genere_le           : new Date().toISOString(),
      source              : 'MarsaTrack AI',
      shift_en_cours      : shift,
      vacation_en_cours   : vacation,
      resume: {
        nombre_operations        : operationsPayload.length,
        nombre_personnels_affectes: totalPersonnels,
        nombre_arrets_actifs     : totalArrets,
      },
      operations: operationsPayload,
      limites: {
        operations_max              : MAX_OPERATIONS,
        personnels_max_par_operation: MAX_PERSONNELS_PAR_OPERATION,
        arrets_max_par_operation    : MAX_ARRETS_PAR_OPERATION,
        operations_tronquees        : operationsTronquees,
      },
    });
  } catch (error) {
    console.error('[integrationController] Erreur etat operationnel :', error.message);

    return res.status(500).json({
      status  : 'error',
      message : 'Impossible de construire l etat operationnel.',
    });
  }
};

module.exports = { getEtatOperationnel, resoudreShiftCourant };
