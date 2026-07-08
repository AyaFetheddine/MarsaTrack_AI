ALTER TABLE container
  ADD COLUMN detected_iso VARCHAR(20) NULL
    COMMENT 'Matricule ISO propose par le flux Vision IA avant validation terrain',
  ADD COLUMN detection_source ENUM('MANUELLE', 'IA_VALIDEE', 'IA_CORRIGEE') NOT NULL DEFAULT 'MANUELLE'
    COMMENT 'Origine de la saisie finale : manuelle, IA validee ou IA corrigee';
