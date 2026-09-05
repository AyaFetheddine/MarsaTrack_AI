// Chargement des variables d'environnement en tout premier,
// avant tout autre import qui pourrait en avoir besoin.
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const path    = require('path');

const { testConnection } = require('./config/db');

// ─── Import des routes ────────────────────────────────────────────────────────
const authRoutes      = require('./routes/authRoutes');
const operationRoutes = require('./routes/operationRoutes');
const arretRoutes     = require('./routes/arretRoutes');
const containerRoutes = require('./routes/containerRoutes');
const personnelRoutes = require('./routes/personnelRoutes');
const visionRoutes    = require('./routes/visionRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const integrationRoutes = require('./routes/integrationRoutes');

// ─── Initialisation de l'application Express ────────────────────────────────
const app = express();

// ─── Middlewares globaux ─────────────────────────────────────────────────────

// CORS restreint aux origines autorisees (par defaut le frontend local).
// Configurable via CORS_ORIGINS (liste separee par des virgules).
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Requetes sans origine (curl, health checks, apps natives) autorisees.
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('Origine non autorisee par la politique CORS.'));
    },
  }),
);

// Parse automatiquement le corps des requêtes en JSON
app.use(express.json());

// Sert les images uploadÃ©es pour les conteneurs.
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));


// ─── Routes ──────────────────────────────────────────────────────────────────

// Module d'authentification (login, JWT)
app.use('/api/auth', authRoutes);

// Module de gestion des opérations portuaires
app.use('/api/operations', operationRoutes);

// Module de gestion des arrêts de travail (incidents terrain)
app.use('/api/arrets', arretRoutes);

// Module de gestion des conteneurs saisis par les portiqueurs
app.use('/api/containers', containerRoutes);

// Module Vision IA simule pour preparer le flux YOLO/OCR
app.use('/api/vision', visionRoutes);

// Module de gestion du personnel operationnel affectable
app.use('/api/personnel', personnelRoutes);

// Vue synthetique du dashboard : compteurs agreges (tous roles authentifies)
app.use('/api/dashboard', dashboardRoutes);

// Integration inter-services (MarsaBot Factory) : lecture seule, jeton de service.
app.use('/api/integration', integrationRoutes);

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
    // Secret JWT obligatoire : refuser de demarrer sans, plutot que de signer
    // des tokens avec une valeur indefinie (authentification silencieusement cassee).
    if (!process.env.JWT_SECRET) {
      console.error(
        '💥 JWT_SECRET manquant. Definissez-le dans backend/.env avant de demarrer le serveur.',
      );
      process.exit(1);
    }

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
