USE marsatrack_db;

CREATE TABLE IF NOT EXISTS personnel (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  matricule VARCHAR(50) NOT NULL UNIQUE,
  nom_complet VARCHAR(150) NOT NULL,
  fonction ENUM(
    'Portiqueur',
    'Equipage',
    'Conducteur',
    'Pointeur',
    'Agent_Terrain',
    'Sous_Traitant',
    'Autre'
  ) NOT NULL,
  disponibilite ENUM(
    'disponible',
    'affecte',
    'indisponible'
  ) NOT NULL DEFAULT 'disponible',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS operation_personnel (
  operation_id INT UNSIGNED NOT NULL,
  personnel_id INT UNSIGNED NOT NULL,
  heure_debut_affectation DATETIME NULL,
  heure_fin_affectation DATETIME NULL,
  PRIMARY KEY (operation_id, personnel_id),
  CONSTRAINT fk_operation_personnel_operation
    FOREIGN KEY (operation_id) REFERENCES operations(id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_operation_personnel_personnel
    FOREIGN KEY (personnel_id) REFERENCES personnel(id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO personnel (matricule, nom_complet, fonction, disponibilite)
VALUES
  ('PQ-001', 'Portiqueur Test', 'Portiqueur', 'disponible'),
  ('EQP-001', 'Equipage Test 1', 'Equipage', 'disponible'),
  ('EQP-002', 'Equipage Test 2', 'Equipage', 'disponible'),
  ('COND-001', 'Conducteur Test', 'Conducteur', 'disponible'),
  ('PNT-001', 'Pointeur Test', 'Pointeur', 'disponible'),
  ('AGT-001', 'Agent Terrain Test', 'Agent_Terrain', 'disponible')
ON DUPLICATE KEY UPDATE
  nom_complet = VALUES(nom_complet),
  fonction = VALUES(fonction),
  disponibilite = VALUES(disponibilite);
