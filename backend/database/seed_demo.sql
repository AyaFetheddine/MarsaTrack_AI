-- ============================================================
-- Jeu de donnees de DEMONSTRATION — MarsaTrack AI
--
-- ⚠️  TOUTES LES DONNEES SONT FICTIVES.
--     Aucune ne provient de Marsa Maroc ni d'une exploitation reelle.
--
-- Objectif : disposer d'un etat operationnel exploitable pour la
-- demonstration WhatsApp (MarsaBot Factory interroge MarsaTrack AI via
-- GET /api/integration/etat-operationnel).
--
-- Ce script n'est JAMAIS execute automatiquement : ni par init.sql, ni par
-- le demarrage du serveur. Il s'execute a la demande :
--
--   mysql -h 127.0.0.1 -P 3306 -u marsa_app -p marsatrack_db < seed_demo.sql
--
-- Il est conçu pour etre rejouable : les insertions sont idempotentes
-- (INSERT ... SELECT ... WHERE NOT EXISTS), donc l'executer deux fois ne
-- cree pas de doublons.
-- ============================================================

USE marsatrack_db;

-- ------------------------------------------------------------
-- 1. Une seconde operation en cours (Shift 2, chargement)
-- ------------------------------------------------------------
INSERT INTO operations
  (nom_operation, date_operation, shift, vacation, numero_escale,
   nom_navire, poste_quai, type_operation, statut)
SELECT
  'Chargement MARSA STAR - Quai 5', CURDATE(), 'Shift 2', 'Vacation 1',
  '202609035', 'MARSA STAR', 'Quai 5', 'CHARGEMENT', 'en cours'
WHERE NOT EXISTS (
  SELECT 1 FROM operations WHERE nom_operation = 'Chargement MARSA STAR - Quai 5'
);


-- ------------------------------------------------------------
-- 2. Personnels affectes a cette seconde operation
--    (references le personnel fictif deja cree par init.sql)
-- ------------------------------------------------------------
INSERT INTO operation_personnel (operation_id, personnel_id, heure_debut_affectation)
SELECT o.id, p.id, NOW()
  FROM operations o
  JOIN personnel  p
 WHERE o.nom_operation = 'Chargement MARSA STAR - Quai 5'
   AND p.matricule IN ('PQ-001', 'COND-001', 'AGT-001')
   AND NOT EXISTS (
     SELECT 1 FROM operation_personnel op
      WHERE op.operation_id = o.id AND op.personnel_id = p.id
   );


-- ------------------------------------------------------------
-- 3. Arret de travail ACTIF sur la premiere operation
--    (heure_fin NULL = arret toujours en cours)
-- ------------------------------------------------------------
INSERT INTO arrets_travail
  (operation_id, cause, code_arret, libelle_arret, heure_debut, heure_fin, declared_by)
SELECT
  o.id,
  'Panne hydraulique du portique RTG-04',
  'TECH-01',
  'Avarie technique engin de levage',
  DATE_SUB(NOW(), INTERVAL 42 MINUTE),
  NULL,
  u.id
  FROM operations o
  JOIN users u ON u.matricule = 'chefequipe'
 WHERE o.nom_operation LIKE 'Dechargement TEST%'
   AND NOT EXISTS (
     SELECT 1 FROM arrets_travail a
      WHERE a.operation_id = o.id AND a.code_arret = 'TECH-01'
   )
 LIMIT 1;


-- ------------------------------------------------------------
-- 4. Arret de travail ACTIF sur la seconde operation (meteo)
-- ------------------------------------------------------------
INSERT INTO arrets_travail
  (operation_id, cause, code_arret, libelle_arret, heure_debut, heure_fin, declared_by)
SELECT
  o.id,
  'Vent superieur au seuil de securite (rafales 65 km/h)',
  'METEO-02',
  'Arret meteorologique',
  DATE_SUB(NOW(), INTERVAL 15 MINUTE),
  NULL,
  u.id
  FROM operations o
  JOIN users u ON u.matricule = 'chefequipe'
 WHERE o.nom_operation = 'Chargement MARSA STAR - Quai 5'
   AND NOT EXISTS (
     SELECT 1 FROM arrets_travail a
      WHERE a.operation_id = o.id AND a.code_arret = 'METEO-02'
   )
 LIMIT 1;


-- ------------------------------------------------------------
-- 5. Arret CLOTURE (heure_fin renseignee) — sert de contre-exemple :
--    il ne doit PAS apparaitre dans /api/integration/etat-operationnel,
--    qui ne remonte que les arrets encore ouverts.
-- ------------------------------------------------------------
INSERT INTO arrets_travail
  (operation_id, cause, code_arret, libelle_arret, heure_debut, heure_fin, declared_by)
SELECT
  o.id,
  'Attente de camions sous portique',
  'LOG-03',
  'Rupture de flux logistique',
  DATE_SUB(NOW(), INTERVAL 4 HOUR),
  DATE_SUB(NOW(), INTERVAL 3 HOUR),
  u.id
  FROM operations o
  JOIN users u ON u.matricule = 'chefequipe'
 WHERE o.nom_operation LIKE 'Dechargement TEST%'
   AND NOT EXISTS (
     SELECT 1 FROM arrets_travail a
      WHERE a.operation_id = o.id AND a.code_arret = 'LOG-03'
   )
 LIMIT 1;


-- ------------------------------------------------------------
-- Verification rapide apres execution
-- ------------------------------------------------------------
SELECT 'operations en cours' AS controle, COUNT(*) AS nb
  FROM operations WHERE statut = 'en cours'
UNION ALL
SELECT 'arrets actifs', COUNT(*) FROM arrets_travail WHERE heure_fin IS NULL
UNION ALL
SELECT 'affectations personnel', COUNT(*) FROM operation_personnel;
