# MarsaTrack AI

Module de **gestion opérationnelle** du terminal à conteneurs de Casablanca,
pour **Marsa Maroc** : opérations, arrêts de travail, conteneurs, personnel, et
reconnaissance visuelle des matricules ISO 6346.

Ce dépôt héberge en plus la **coquille du portail MarsaPort AI** — navigation,
écran de connexion et mise en page — qui réunit les deux modules du produit
sous une seule interface.

---

## Place dans MarsaPort AI

MarsaPort AI est le **produit**. Il n'a pas de dépôt à lui : il se compose de
deux modules, développés et déployés dans **deux dépôts distincts**.

| Module | Rôle | Dépôt |
|---|---|---|
| **MarsaTrack AI** | gestion opérationnelle, reconnaissance visuelle, **et la coquille du portail** | **ce dépôt** |
| **MarsaBot Factory** | assistants WhatsApp, base de connaissances, moteur de génération | [`MarsaBot_Factory`](https://github.com/AyaFetheddine/MarsaBot_Factory) |

**Aucune fusion de code n'a eu lieu.** Chaque module garde son dépôt, son
backend et sa base de données. Ce que l'utilisateur perçoit comme une seule
application vient de trois liaisons, décrites plus bas : un cadre qui affiche la
console dans le portail, une session partagée entre les deux interfaces, et un
appel HTTP en lecture seule entre les deux serveurs.

Ce README décrit donc **ce dépôt**, et les liaisons qu'il porte. Le
fonctionnement interne des assistants est documenté dans l'autre dépôt.

---

## Ce que fait ce dépôt

**Suivre une opération de bout en bout.** Le responsable d'exploitation ouvre
une opération pour un navire à quai — escale, poste, shift, vacation — et y
affecte le personnel de terrain. Le chef d'équipe déclare les arrêts de travail
et leur motif. Le portiqueur saisit les conteneurs manutentionnés. Le chef de
services clôture l'opération, ce qui la fige définitivement.

**Lire un matricule de conteneur en photo.** Le portiqueur importe une image ou
prend une photo du marquage. Un modèle YOLO11 localise le matricule ISO 6346 et
le code taille/type, PaddleOCR les lit, et le chiffre de contrôle ISO tranche :
un code dont le chiffre de contrôle est faux n'est jamais annoncé comme valide.
En cas d'échec, le système bascule en saisie manuelle plutôt que de proposer une
valeur douteuse.

**Réunir les deux modules sous une seule interface.** Le portail porte la
navigation, l'authentification unique et l'affichage de la console des
assistants.

> Les assistants WhatsApp eux-mêmes — création des bots, base de connaissances,
> moteur de génération — relèvent du dépôt `MarsaBot_Factory`. Ce dépôt ne
> fournit que les **données** qu'ils lisent, par la passerelle décrite plus bas.

---

## Architecture du produit

Le schéma couvre **les deux dépôts** : la colonne de gauche est ce dépôt, celle
de droite l'autre.

```text
                    Navigateur — portail MarsaPort AI
                              :5173
                                │
             ┌──────────────────┴───────────────────┐
             │                                      │
   MarsaTrack AI (ce dépôt)              MarsaBot Factory (dépôt séparé)
             │                                      │
   ┌─────────┴─────────┐                  ┌─────────┴─────────┐
   │                   │                  │                   │
Backend Node       Vision service      Backend Node        Ollama
Express 5          FastAPI             Express             llama3.2
:3001              :8000               :3000               :11434
   │                   │                  │                   │
MySQL 8            YOLO11 + PaddleOCR  MySQL 8            WhatsApp
marsatrack_db                          marsabot_db        whatsapp-web.js
   │
   └──── GET /api/integration/etat-operationnel ────► lu par les bots
```

| Composant | Technologie | Port | Dossier |
|---|---|---|---|
| Portail et interface | React 19, Vite, Tailwind 3 | 5173 | [`frontend/`](frontend/) |
| API métier | Node 22, Express 5 | 3001 | [`backend/`](backend/) |
| Reconnaissance visuelle | Python 3.11, FastAPI, YOLO11, PaddleOCR | 8000 | [`vision-service/`](vision-service/) |
| Entraînement du modèle | Ultralytics, notebooks | — | [`vision-training/`](vision-training/) |
| Base de données | MySQL 8 | 3306 | `backend/database/` |

Le port **5174** est laissé à la console MarsaBot Factory, et **11434** à Ollama.

---

## Rôles

Cinq rôles de connexion, **chacun avec au moins une prérogative exclusive**. Un
rôle sans fonction réelle n'est pas conservé.

| Rôle | Prérogative exclusive |
|---|---|
| `Admin` | supprimer une opération, un arrêt ou un conteneur ; accès aux assistants |
| `Responsable_Exploitation` | ouvrir et annuler une opération, gérer le personnel |
| `Chef_Services` | clôturer une opération, ce qui la fige |
| `Chef_Equipe` | déclarer et clôturer un arrêt de travail |
| `Portiqueur` | saisir un conteneur et lancer la reconnaissance visuelle |

Le personnel de terrain affectable — équipage, conducteurs, pointeurs — vit dans
la table `personnel` et **n'a pas de compte** : il est désigné dans une
opération, il ne se connecte pas.

**Cinq comptes de connexion au total**, identifiés par leur matricule. La
console des assistants garde un écran de connexion propre, comme accès de
secours si le portail est indisponible, mais il attend le **même matricule et
le même mot de passe** : une seconde porte vers le même compte, pas un second
compte.

Le tableau de bord affiche les **mêmes compteurs pour tous les rôles** : ce sont
des agrégats, sans donnée nominative. Les listes détaillées, elles, restent
filtrées par rôle.

---

## Session unique

Les deux modules vivent sur des ports différents, donc sur des origines
différentes : leurs `localStorage` sont cloisonnés par le navigateur et le jeton
ne peut pas simplement être lu par la console encadrée.

Le portail le lui transmet donc par `postMessage`, après qu'elle a signalé être
prête à le recevoir, chaque message étant restreint à une origine écrite en dur.
Les deux services signent avec le **même `JWT_SECRET`** : un jeton MarsaTrack AI
est accepté par MarsaBot, qui exige en plus le rôle `Admin` — la signature
prouve l'identité, elle n'accorde aucun droit à elle seule.

L'utilisateur ne s'authentifie donc qu'une fois. Quand la session expire, c'est
tout MarsaPort AI qui se déconnecte et présente son propre écran, jamais un
second formulaire à l'intérieur du premier.

> ⚠️ `JWT_SECRET` doit porter **la même valeur** dans les deux dépôts. Une
> divergence déconnecte les utilisateurs sans message d'erreur explicite.

---

## Passerelle vers les assistants

`GET /api/integration/etat-operationnel` est la **seule** liaison entre les deux
applications, et elle est **strictement en lecture** : aucune route d'écriture
n'est exposée dans cet espace. Elle renvoie un instantané compact et borné —
10 opérations, 12 personnels et 5 arrêts par opération — libellé en clair pour
être exploitable par un modèle de langage.

Elle est protégée par un jeton de service `INTEGRATION_TOKEN`. Sans cette
variable, l'accès est **refusé** (503) plutôt qu'ouvert : une variable oubliée
ne doit jamais exposer les données.

Détail complet dans [`backend/README.md`](backend/README.md).

---

## Démarrage

### Avec Docker

```powershell
copy .env.example .env   # a la RACINE : docker compose y lit ses variables
docker compose up -d
```

> `JWT_SECRET` apparait dans quatre fichiers — `.env` et `backend/.env` de
> chaque dépôt, l'un pour Docker, l'autre pour le lancement natif. Les quatre
> doivent porter **la même valeur**.

Quatre services démarrent : MySQL, backend, vision et frontend. Le schéma
`backend/database/init.sql` est joué **une seule fois** sur une base vide ; les
évolutions passent ensuite par `backend/database/migrations/`, à appliquer dans
l'ordre.

### En natif

Quatre terminaux, dans cet ordre :

```powershell
# 1. MySQL doit tourner et la base marsatrack_db exister

# 2. Service de vision
cd vision-service
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --port 8000

# 3. API métier
cd backend
npm install
npm start

# 4. Portail
cd frontend
npm install
npm run dev
```

Le portail répond sur `http://localhost:5173`. Le serveur refuse de démarrer
sans `JWT_SECRET` ni connexion MySQL — un échec bruyant valant mieux qu'une
application à moitié fonctionnelle.

Pour les assistants, démarrer en plus Ollama et le dépôt `MarsaBot_Factory`.

---

## Vérification

```powershell
cd backend
npm test

cd ..rontend
npm run lint ; npm run build ; npm run test:camera

cd ..ision-service
.\.venv\Scripts\Activate.ps1 ; python -m pytest
```

Les tests du service de vision utilisent des doubles YOLO/OCR et ne dependent
pas des poids locaux : le test d'integration du vrai modele est ignore si le
poids ou Ultralytics est absent.

---

## Documentation détaillée

| Document | Contenu |
|---|---|
| [`backend/README.md`](backend/README.md) | rôles et permissions, endpoints, limitation des tentatives de connexion, passerelle d'intégration, base de données |
| [`frontend/README.md`](frontend/README.md) | navigation par rôle, capture caméra, contrôle qualité local des photos, limite connue du matricule vertical |
| [`vision-service/README.md`](vision-service/README.md) | pipeline YOLO + PaddleOCR, lecture verticale, correction des confusions et **règle inviolable** du chiffre de contrôle, limites connues |
| [`vision-training/README.md`](vision-training/README.md) | recette d'entraînement du modèle, jeu de données, mesures |

---

## Limites connues

**Matricule vertical photographié à la caméra.** Un matricule horizontal est lu
de façon fiable ; un matricule vertical pris à la caméra échoue souvent, là où
la même image importée depuis un fichier est correctement lue. La cause n'est
pas le chemin caméra mais la qualité de prise de vue : reflets, moiré et
résolution utile réduite dégradent une colonne de caractères fins bien plus
qu'une ligne. L'OCR ne restitue alors que 8 à 10 caractères sur 11, et il
n'existe plus de fenêtre de 11 caractères à corriger. Le système bascule en
saisie manuelle, ce qui est le comportement voulu.

Les limites propres aux assistants — qualité des réponses selon le modèle de
génération, notamment — relèvent du dépôt `MarsaBot_Factory` et y sont
documentées.

---

## Souveraineté des données

Aucune donnée opérationnelle ne quitte l'infrastructure. Dans ce dépôt, la
reconnaissance visuelle s'exécute **localement** : les images de conteneurs sont
traitées par le service de vision, sans aucun appel sortant, et aucune image
n'est versionnée.

Le module des assistants tient la même ligne — génération de texte locale par
Ollama — et documente ses propres appels sortants.
