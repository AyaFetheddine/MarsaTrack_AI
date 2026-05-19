# Image de base : Node.js 20 sur Alpine Linux (distro minimaliste ~5 MB).
# Alpine réduit la surface d'attaque et la taille finale de l'image par rapport
# à l'image Debian standard (node:20).
FROM node:20-alpine

# Répertoire de travail dans le conteneur.
# Toutes les instructions suivantes (COPY, RUN, CMD) s'exécutent depuis ce chemin.
WORKDIR /usr/src/app

# --- Optimisation du cache Docker (layer caching) ---
# On copie UNIQUEMENT les manifestes de dépendances en premier.
# Docker met ce layer en cache : si package.json et package-lock.json
# n'ont pas changé, `npm install` ne sera PAS réexécuté lors du prochain build,
# même si le code source a été modifié. Gain de temps significatif en CI/CD.
COPY package.json package-lock.json ./

# Installation des dépendances de production à partir du lock file.
# `npm ci` est préféré à `npm install` en CI/CD : il est plus strict, plus rapide,
# et garantit une installation identique à celle définie dans package-lock.json.
RUN npm ci --omit=dev

# Copie du reste du code source applicatif dans le conteneur.
# Cette instruction est placée APRÈS npm ci pour bénéficier du cache sur les deps.
COPY . .

# Déclare le port sur lequel l'API Express écoute à l'intérieur du conteneur.
# Cette instruction est documentaire : le mapping host:conteneur se fait dans
# docker-compose.yml ou via `docker run -p 3001:3001`.
EXPOSE 3001

# Commande par défaut au démarrage du conteneur.
# Lance le script "start" défini dans package.json (ex: `node server.js`).
CMD ["npm", "start"]
