# ── Stage 1 : Build Vite ──────────────────────────────────────────────────────
# Node 22 (et non 20) car Vite 8 exige Node >= 20.19 / >= 22.12.
FROM node:22-alpine AS builder

WORKDIR /app

# Copier les manifestes en premier pour bénéficier du cache Docker.
COPY package*.json ./
RUN npm ci

# Copier le code source puis produire le build de production dans /app/dist.
COPY . .
RUN npm run build

# ── Stage 2 : Serveur Nginx (image légère) ────────────────────────────────────
FROM nginx:alpine

# Remplacer la config Nginx par défaut par la nôtre (SPA + proxy API).
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copier les fichiers statiques buildés par Vite.
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
