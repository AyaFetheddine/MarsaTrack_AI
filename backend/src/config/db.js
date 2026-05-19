// Chargement des variables d'environnement depuis le fichier .env
require('dotenv').config();

const mysql = require('mysql2/promise');

/**
 * Création du pool de connexions MySQL.
 * Un pool gère un ensemble de connexions réutilisables, ce qui est bien plus
 * performant qu'ouvrir/fermer une connexion à chaque requête.
 */
const pool = mysql.createPool({
  host     : process.env.DB_HOST     || 'localhost',
  user     : process.env.DB_USER,
  password : process.env.DB_PASSWORD,
  database : process.env.DB_NAME,
  port     : parseInt(process.env.DB_PORT, 10) || 3306,

  // Nombre maximum de connexions simultanées dans le pool
  connectionLimit: 10,

  // Attendre une connexion disponible plutôt que de lever une erreur immédiate
  waitForConnections: true,

  // Nombre max de requêtes en file d'attente (0 = illimité)
  queueLimit: 0,
});

/**
 * Teste la connexion à la base de données au démarrage du serveur.
 * Obtient une connexion du pool, vérifie qu'elle est active, puis la libère.
 */
const testConnection = async () => {
  let connection;
  try {
    // Récupération d'une connexion depuis le pool
    connection = await pool.getConnection();
    console.log('✅ Connexion à MySQL réussie — base de données :', process.env.DB_NAME);
  } catch (error) {
    console.error('❌ Échec de la connexion à MySQL :', error.message);
    // On propage l'erreur pour que le serveur puisse décider d'arrêter le démarrage
    throw error;
  } finally {
    // Libération systématique de la connexion pour la remettre dans le pool
    if (connection) connection.release();
  }
};

module.exports = { pool, testConnection };
