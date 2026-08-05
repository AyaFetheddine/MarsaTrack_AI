-- Ajoute le code taille/type ISO 6346 (ex: 22G1) detecte par le modele YOLO V2.
-- Nullable : les anciens conteneurs et les cas ou le type n'est pas detecte
-- restent valides (aucune donnee existante n'est cassee).
ALTER TABLE container
  ADD COLUMN iso_type_code VARCHAR(4) NULL
    COMMENT 'Code taille/type ISO 6346 (ex: 22G1) issu du modele Vision V2 ou saisi manuellement';
