// Chargement des variables d'environnement en tout premier,
// avant tout autre import qui pourrait en avoir besoin.
require('dotenv').config();

const express = require('express');
const cors    = require('cors');

const { testConnection } = require('./config/db');

// ─── Import des routes ────────────────────────────────────────────────────────
const authRoutes      = require('./routes/authRoutes');
const operationRoutes = require('./routes/operationRoutes');
const arretRoutes     = require('./routes/arretRoutes');
const containerRoutes = require('./routes/containerRoutes');
const userRoutes      = require('./routes/userRoutes');
const personnelRoutes = require('./routes/personnelRoutes');

// ─── Initialisation de l'application Express ────────────────────────────────
const app = express();

// ─── Middlewares globaux ─────────────────────────────────────────────────────

// Autorise les requêtes cross-origin (nécessaire pour le dashboard React)
app.use(cors());

// Parse automatiquement le corps des requêtes en JSON
app.use(express.json());


// ─── Routes ──────────────────────────────────────────────────────────────────

// Module d'authentification (login, JWT)
app.use('/api/auth', authRoutes);

// Module de gestion des opérations portuaires
app.use('/api/operations', operationRoutes);

// Module de gestion des arrêts de travail (incidents terrain)
app.use('/api/arrets', arretRoutes);

// Module de gestion des conteneurs saisis par les portiqueurs
app.use('/api/containers', containerRoutes);

// Module de consultation des utilisateurs et du personnel terrain
app.use('/api/users', userRoutes);

// Module de gestion du personnel operationnel affectable
app.use('/api/personnel', personnelRoutes);

/**
 * Health Check — GET /api/health
 * Permet de vérifier rapidement que le serveur est en ligne.
 * Utilisé par Docker, le load balancer, et le pipeline CI/CD.
 */
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status  : 'success',
    message : 'API MarsaTrack AI opérationnelle',
    timestamp: new Date().toISOString(),
  });
});


// ─── Démarrage du serveur ─────────────────────────────────────────────────────

/**
 * Lance le serveur Express après avoir vérifié la connexion à la base de données.
 * En cas d'échec de la connexion MySQL, le processus s'arrête proprement
 * plutôt que de démarrer dans un état instable.
 */
const startServer = async () => {
  try {
    // Vérification de la connexion MySQL avant d'accepter le trafic
    await testConnection();

    const PORT = process.env.PORT || 3001;

    app.listen(PORT, () => {
      console.log(`🚀 Serveur MarsaTrack AI démarré sur le port ${PORT}`);
      console.log(`   → Health check : http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('💥 Impossible de démarrer le serveur :', error.message);
    // Code de sortie non-zéro pour signaler l'échec à Docker / GitHub Actions
    process.exit(1);
  }
};

startServer();
