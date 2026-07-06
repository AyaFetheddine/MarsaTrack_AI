-- Migration 004 - Ajout des codes et libelles metier des arrets.
-- A executer une seule fois sur une base existante.
-- Les anciennes lignes conservent leur valeur cause ; code_arret et libelle_arret restent NULL.

ALTER TABLE arrets_travail
  MODIFY COLUMN cause VARCHAR(255) NOT NULL,
  ADD COLUMN code_arret VARCHAR(20) NULL,
  ADD COLUMN libelle_arret VARCHAR(255) NULL;
