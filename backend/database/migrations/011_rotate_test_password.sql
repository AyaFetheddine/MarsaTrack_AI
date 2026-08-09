-- ============================================================
-- Migration 011 : rotation du mot de passe des comptes de test.
--
-- Motif : l'ancien mot de passe de test etait exposé en clair dans des
-- commentaires du depot PUBLIC (init.sql, migration 002). Il doit etre
-- considere comme compromis. Ce script applique le nouveau hash bcrypt aux
-- comptes existants. Le nouveau mot de passe n'est PAS versionne : il se
-- trouve uniquement dans COMPTES-TEST.local.md (gitignore).
--
-- A executer une fois sur toute base deja initialisee (init.sql contient deja
-- le nouveau hash pour les installations neuves).
-- ============================================================
USE marsatrack_db;

UPDATE users
SET password_hash = '$2b$12$IhIjnd8m0ZSiEmNHFInp0OTjE7OF8B1r8uYFe3MnS6gycm7OUwNhq'
WHERE matricule IN ('ADM-001', 'RE-001', 'CE-001', 'PQ-001', 'CS-001');
