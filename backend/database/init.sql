-- ============================================================
-- MarsaTrack AI — Initialisation de la base de données
-- Base : marsatrack_db | Moteur : InnoDB | Encodage : utf8mb4
-- Cahier des charges : Système Intelligent de Gestion et
-- d'Assistance Portuaire — Marsa Maroc (Port de Casablanca)
-- ============================================================
--
-- ┌─────────────────────────────────────────────────────────┐
-- │         MODÉLISATION TEMPORELLE STRICTE (24/7)          │
-- ├──────────────┬────────────────────────────────────────── ┤
-- │ Shift 1      │ 07:00 → 15:00                            │
-- │  Vacation 1  │ 07h00 → 11h00                            │
-- │  Vacation 2  │ 11h00 → 15h00                            │
-- ├──────────────┼──────────────────────────────────────────┤
-- │ Shift 2      │ 15:00 → 23:00                            │
-- │  Vacation 1  │ 15h00 → 19h00                            │
-- │  Vacation 2  │ 19h00 → 23h00                            │
-- ├──────────────┼──────────────────────────────────────────┤
-- │ Shift 3      │ 23:00 → 07:00                            │
-- │  Vacation 1  │ 23h00 → 03h00                            │
-- │  Vacation 2  │ 03h00 → 07h00                            │
-- └──────────────┴──────────────────────────────────────────┘
--
-- Rôle des Vacations : rotation obligatoire des Portiqueurs
-- toutes les 4 heures sur leur engin (grue RTG/STS).
-- ============================================================

CREATE DATABASE IF NOT EXISTS marsatrack_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE marsatrack_db;


-- ============================================================
-- Table : users
-- Centralise tous les acteurs opérationnels du terminal.
-- Hiérarchie : Chef d'escale > Chef d'équipe > Portiqueur
-- Équipage élargi : Planner, conducteur, pointeur
-- Le matricule est l'identifiant métier unique (badge Marsa Maroc).
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  nom_complet   VARCHAR(150)  NOT NULL,
  matricule     VARCHAR(50)   NOT NULL UNIQUE
                              COMMENT 'Identifiant badge unique employé Marsa Maroc',
  role          ENUM(
                  'Admin',
                  'Responsable_Exploitation', -- Planificateur, définit les besoins et affecte les portiques
                  'Chef_Services',            -- Validateur final, clôture et verrouille l'opération
                  'Chef_Escale',              -- Superviseur global de plusieurs opérations simultanées
                  'Chef_Equipe',              -- Gestionnaire terrain, crée et saisit les données d'opération
                  'Portiqueur',               -- Opérateur grue (1 par opération, rotation toutes les 4h)
                  'Equipage'                  -- Personnel élargi : conducteurs, pointeurs
                )             NOT NULL,
  password_hash VARCHAR(255)  NOT NULL
                              COMMENT 'Hash bcrypt — mot de passe jamais stocké en clair',
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Acteurs opérationnels du terminal portuaire';


-- ============================================================
-- Table : personnel
-- Ressources operationnelles affectables aux operations.
-- Ces personnes ne sont pas forcement des comptes applicatifs.
-- ============================================================
CREATE TABLE IF NOT EXISTS personnel (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  matricule       VARCHAR(50)  NOT NULL UNIQUE,
  nom_complet     VARCHAR(150) NOT NULL,
  fonction        ENUM(
                    'Portiqueur',
                    'Equipage',
                    'Conducteur',
                    'Pointeur',
                    'Agent_Terrain',
                    'Sous_Traitant',
                    'Autre'
                  )            NOT NULL,
  disponibilite   ENUM(
                    'disponible',
                    'affecte',
                    'indisponible'
                  )            NOT NULL DEFAULT 'disponible',
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Personnel operationnel affectable aux operations portuaires';


-- ============================================================
-- Table : operations
-- Une opération ("Main") représente l'unité de travail fondamentale.
-- Elle est ancrée dans le temps via un Shift ET une Vacation,
-- ce qui permet de retracer précisément la fenêtre de 4h concernée.
-- ============================================================
CREATE TABLE IF NOT EXISTS operations (
  id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  nom_operation  VARCHAR(200)  NOT NULL
                               COMMENT 'Ex : Déchargement MSC ANNA — Quai 5',
  date_operation DATE          NOT NULL,
  shift          ENUM(
                   'Shift 1',
                   'Shift 2',
                   'Shift 3'
                 )             NOT NULL
                               COMMENT 'Shift 1=07-15h | Shift 2=15-23h | Shift 3=23-07h',
  vacation       ENUM(
                   'Vacation 1',
                   'Vacation 2'
                 )             NOT NULL
                               COMMENT 'Vacation 1=première moitié du shift | Vacation 2=deuxième moitié',
  numero_escale  VARCHAR(50)   NULL,
  nom_navire     VARCHAR(150)  NULL,
  poste_quai     VARCHAR(100)  NULL,
  type_operation ENUM(
                   'CHARGEMENT',
                   'DECHARGEMENT',
                   'MANUTENTION'
                 )             NOT NULL DEFAULT 'MANUTENTION',
  statut         ENUM(
                   'en cours',
                   'cloturee',
                   'annulee'
                 )             NOT NULL DEFAULT 'en cours',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Unité de travail portuaire, ancrée dans un shift et une vacation';


-- ============================================================
-- Table : operation_equipe
-- Associe les membres du personnel terrain à une opération.
-- Une même personne ne peut être affectée qu'une fois à la même opération.
-- ============================================================
CREATE TABLE IF NOT EXISTS operation_equipe (
  operation_id INT UNSIGNED NOT NULL,
  user_id      INT UNSIGNED NOT NULL,
  PRIMARY KEY (operation_id, user_id),
  CONSTRAINT fk_operation_equipe_operation
    FOREIGN KEY (operation_id) REFERENCES operations (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_operation_equipe_user
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Affectation du personnel terrain aux opérations portuaires';


-- ============================================================
-- Table : operation_personnel
-- Nouvelle affectation des operations vers la table personnel.
-- ============================================================
CREATE TABLE IF NOT EXISTS operation_personnel (
  operation_id             INT UNSIGNED NOT NULL,
  personnel_id             INT UNSIGNED NOT NULL,
  heure_debut_affectation  DATETIME     NULL,
  heure_fin_affectation    DATETIME     NULL,
  PRIMARY KEY (operation_id, personnel_id),
  CONSTRAINT fk_operation_personnel_operation
    FOREIGN KEY (operation_id) REFERENCES operations (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_operation_personnel_personnel
    FOREIGN KEY (personnel_id) REFERENCES personnel (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Affectation du personnel operationnel aux operations portuaires';


-- ============================================================
-- Table : arrets_travail
-- Enregistre en temps réel les arrêts de travail survenus
-- durant une opération, avec horodatage précis début/fin.
-- Source de vérité consultée par MarsaBot Factory via l'API.
-- ============================================================
CREATE TABLE IF NOT EXISTS arrets_travail (
  id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  operation_id INT UNSIGNED  NOT NULL,
  cause        VARCHAR(255)  NOT NULL
               COMMENT 'Cause compatible historique ou code + libellé de l''arrêt',
  code_arret   VARCHAR(20)   NULL
               COMMENT 'Code métier Marsa Maroc de l''arrêt',
  libelle_arret VARCHAR(255) NULL
               COMMENT 'Libellé métier Marsa Maroc de l''arrêt',
  heure_debut  DATETIME      NOT NULL COMMENT 'Horodatage de début de l''arrêt',
  heure_fin    DATETIME      NULL     COMMENT 'NULL si l''arrêt est toujours en cours',
  declared_by  INT UNSIGNED  NULL
                              COMMENT 'Utilisateur authentifié ayant déclaré l''arrêt',
  PRIMARY KEY (id),
  CONSTRAINT fk_arret_operation
    FOREIGN KEY (operation_id) REFERENCES operations (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_arret_declared_by
    FOREIGN KEY (declared_by) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Arrêts de travail horodatés — consultés par le chatbot WhatsApp';


-- ============================================================
-- Table : container
-- Stocke les résultats de la détection IA (YOLOv11 + OCR).
-- Le matricule_iso doit respecter la norme ISO 6346 :
--   → 4 lettres (code propriétaire + catégorie) + 7 chiffres
--   → Validation applicative obligatoire avant insertion.
-- ============================================================
CREATE TABLE IF NOT EXISTS container (
  id                INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  operation_id      INT UNSIGNED   NOT NULL,
  matricule_iso     VARCHAR(20)    NOT NULL
                    COMMENT 'Norme ISO 6346 : 4 lettres + 7 chiffres (ex: MSCU1234567). Validation regex côté API.',
  image_url         VARCHAR(500)   NULL
                    COMMENT 'Chemin relatif ou URL S3 de la photo source',
  mouvement         ENUM('IMPORT', 'EXPORT') NOT NULL DEFAULT 'IMPORT'
                    COMMENT 'IMPORT : navire vers terminal, EXPORT : terminal vers navire',
  detected_iso      VARCHAR(20)    NULL
                    COMMENT 'Matricule ISO propose par le flux Vision IA avant validation terrain',
  detection_source  ENUM('MANUELLE', 'IA_VALIDEE', 'IA_CORRIGEE') NOT NULL DEFAULT 'MANUELLE'
                    COMMENT 'Origine de la saisie finale : manuelle, IA validee ou IA corrigee',
  ai_confidence     FLOAT          NULL
                    COMMENT 'Score de confiance YOLOv11 (0.0 à 1.0)',
  iso_type_code     VARCHAR(4)     NULL
                    COMMENT 'Code taille/type ISO 6346 (ex: 22G1) issu du modele Vision V2 ou saisi manuellement',
  created_by        INT UNSIGNED   NULL
                    COMMENT 'Utilisateur authentifié ayant saisi le conteneur',
  created_at        TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_container_operation
    FOREIGN KEY (operation_id) REFERENCES operations (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_container_created_by
    FOREIGN KEY (created_by) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Conteneurs détectés par IA — matricules validés ISO 6346';


-- ============================================================
-- Table : sessions_whatsapp
-- Trace les sessions de conversation du chatbot MarsaBot Factory
-- liées à une opération spécifique. Permet la contextualisation
-- des réponses LLM en croisant avec les données terrain.
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions_whatsapp (
  id               INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  operation_id     INT UNSIGNED  NOT NULL,
  phone_number     VARCHAR(20)   NOT NULL
                   COMMENT 'Numéro E.164 (ex: +212600000000)',
  last_interaction DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                   ON UPDATE CURRENT_TIMESTAMP
                   COMMENT 'Mis à jour à chaque message entrant/sortant',
  PRIMARY KEY (id),
  CONSTRAINT fk_session_operation
    FOREIGN KEY (operation_id) REFERENCES operations (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Sessions WhatsApp contextualisées par opération portuaire';


-- ============================================================
-- Données initiales : comptes de test (hash bcrypt).
-- ⚠️  IMPORTANT : remplacer ces hash avant tout déploiement.
--    Le mot de passe de test N'EST PAS versionné : il se trouve uniquement
--    dans COMPTES-TEST.local.md (gitignoré). Pour régénérer un hash :
--      node -e "require('bcryptjs').hash(process.argv[1],12).then(console.log)" "<mot_de_passe>"
-- ============================================================
INSERT IGNORE INTO users (nom_complet, matricule, role, password_hash)
VALUES (
  'Administrateur Système',
  'admin',
  'Admin',
  '$2b$12$IhIjnd8m0ZSiEmNHFInp0OTjE7OF8B1r8uYFe3MnS6gycm7OUwNhq'
);

-- Utilisateur de test avec droits de création d'opérations (mot de passe : voir COMPTES-TEST.local.md)
INSERT IGNORE INTO users (nom_complet, matricule, role, password_hash)
VALUES (
  'Responsable Exploitation Test',
  'responsable',
  'Responsable_Exploitation',
  '$2b$12$IhIjnd8m0ZSiEmNHFInp0OTjE7OF8B1r8uYFe3MnS6gycm7OUwNhq'
);

-- Utilisateur de test avec droits de création d'opérations (mot de passe : voir COMPTES-TEST.local.md)
INSERT IGNORE INTO users (nom_complet, matricule, role, password_hash)
VALUES (
  'Chef Equipe Test',
  'chefequipe',
  'Chef_Equipe',
  '$2b$12$IhIjnd8m0ZSiEmNHFInp0OTjE7OF8B1r8uYFe3MnS6gycm7OUwNhq'
);

-- Utilisateur de test avec droits de saisie des conteneurs (mot de passe : voir COMPTES-TEST.local.md)
INSERT IGNORE INTO users (nom_complet, matricule, role, password_hash)
VALUES (
  'Portiqueur Test',
  'portiqueur',
  'Portiqueur',
  '$2b$12$IhIjnd8m0ZSiEmNHFInp0OTjE7OF8B1r8uYFe3MnS6gycm7OUwNhq'
);

-- Utilisateur de test avec droits de cloture des operations (mot de passe : voir COMPTES-TEST.local.md)
INSERT IGNORE INTO users (nom_complet, matricule, role, password_hash)
VALUES (
  'Chef Services Test',
  'chefservices',
  'Chef_Services',
  '$2b$12$IhIjnd8m0ZSiEmNHFInp0OTjE7OF8B1r8uYFe3MnS6gycm7OUwNhq'
);

-- Personnel operationnel affectable de test
INSERT IGNORE INTO personnel (matricule, nom_complet, fonction, disponibilite)
VALUES
  ('PQ-001', 'Portiqueur Test', 'Portiqueur', 'disponible'),
  ('EQP-001', 'Equipage Test 1', 'Equipage', 'disponible'),
  ('EQP-002', 'Equipage Test 2', 'Equipage', 'disponible'),
  ('COND-001', 'Conducteur Test', 'Conducteur', 'disponible'),
  ('PNT-001', 'Pointeur Test', 'Pointeur', 'disponible'),
  ('AGT-001', 'Agent Terrain Test', 'Agent_Terrain', 'disponible');
