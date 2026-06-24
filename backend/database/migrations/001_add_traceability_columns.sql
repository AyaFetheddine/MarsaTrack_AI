USE marsatrack_db;

-- Traçabilité des déclarations d'arrêt.
ALTER TABLE arrets_travail
  ADD COLUMN declared_by INT UNSIGNED NULL
    COMMENT 'Utilisateur authentifié ayant déclaré l''arrêt'
    AFTER heure_fin,
  ADD CONSTRAINT fk_arret_declared_by
    FOREIGN KEY (declared_by) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Traçabilité des saisies de conteneurs.
ALTER TABLE container
  ADD COLUMN created_by INT UNSIGNED NULL
    COMMENT 'Utilisateur authentifié ayant saisi le conteneur'
    AFTER ai_confidence,
  ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    AFTER created_by,
  ADD CONSTRAINT fk_container_created_by
    FOREIGN KEY (created_by) REFERENCES users (id)
    ON DELETE SET NULL ON UPDATE CASCADE;
