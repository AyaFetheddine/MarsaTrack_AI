ALTER TABLE operations
MODIFY COLUMN statut ENUM('en cours', 'cloturee', 'annulee') NOT NULL DEFAULT 'en cours';
