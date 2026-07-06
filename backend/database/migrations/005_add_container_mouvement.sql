-- Migration 005 : ajoute le mouvement du conteneur.
-- A executer une seule fois sur une base existante.
-- Les lignes existantes prendront automatiquement la valeur IMPORT.

ALTER TABLE container
ADD COLUMN mouvement ENUM('IMPORT', 'EXPORT') NOT NULL DEFAULT 'IMPORT';
