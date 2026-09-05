-- ============================================================
-- Migration 012 : simplification des roles de connexion.
--
-- Motif : deux valeurs de l'ENUM users.role n'avaient ni titulaire ni
-- fonction reelle dans l'application.
--
--   'Equipage'    : aucune route, aucune regle de navigation, aucun compte.
--                   L'equipage n'a pas vocation a se connecter : il est
--                   AFFECTE a une operation depuis la table personnel, dont la
--                   colonne fonction conserve la valeur 'Equipage'. Ce doublon
--                   dans users.role n'etait jamais exploite.
--
--   'Chef_Escale' : aucun compte, et des droits en lecture strictement inclus
--                   dans ceux de Chef_Services (operations + arrets). Il
--                   n'apportait aucune capacite propre.
--
-- Apres cette migration, chacun des cinq roles restants detient au moins une
-- prerogative exclusive : Admin supprime, Responsable_Exploitation ouvre et
-- annule, Chef_Services cloture, Chef_Equipe gere les arrets, Portiqueur
-- saisit les conteneurs.
--
-- La table personnel n'est PAS modifiee : son ENUM fonction garde 'Equipage',
-- 'Conducteur', 'Pointeur', etc.
-- ============================================================
USE marsatrack_db;

-- Garde-fou : MySQL refuse de retirer une valeur d'ENUM encore utilisee par
-- une ligne. On verifie donc d'abord qu'aucun compte ne porte ces deux roles.
-- Si ce SELECT retourne autre chose que 0, reaffecter ces comptes AVANT de
-- poursuivre : l'ALTER qui suit les viderait silencieusement.
SELECT COUNT(*) AS comptes_a_reaffecter
  FROM users
 WHERE role IN ('Chef_Escale', 'Equipage');

ALTER TABLE users
  MODIFY role ENUM(
    'Admin',
    'Responsable_Exploitation',
    'Chef_Services',
    'Chef_Equipe',
    'Portiqueur'
  ) NOT NULL
    COMMENT 'Rôle de connexion. Le personnel de terrain affectable (équipage, conducteurs, pointeurs) vit dans la table personnel, sans compte.';
