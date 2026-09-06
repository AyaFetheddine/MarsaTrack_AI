# MarsaTrack AI - Backend

API Express qui porte l'authentification, les donnees operationnelles du
terminal et le relais vers le microservice Vision.

Node 22, Express 5, MySQL 8. Demarrage : `npm start` (ou `npm run dev`).
Le serveur refuse de demarrer sans `JWT_SECRET` et sans connexion MySQL.

`JWT_SECRET` est **partage avec MarsaBot Factory** : le portail transmet son jeton a la console encadree, qui doit pouvoir le verifier. Les deux services doivent porter la meme valeur, sans quoi les utilisateurs sont deconnectes en silence. Cote MarsaBot, le middleware exige en plus le role `Admin` : la signature seule n'ouvre pas la gestion des assistants a un Portiqueur.

---

## Roles de connexion

Cinq roles, chacun avec au moins une prerogative exclusive. Le personnel de
terrain affectable (equipage, conducteurs, pointeurs) vit dans la table
`personnel` et **n'a pas de compte**.

| Role | Prerogative exclusive |
| --- | --- |
| `Admin` | supprimer une operation, un arret ou un conteneur |
| `Responsable_Exploitation` | ouvrir et annuler une operation, gerer le personnel |
| `Chef_Services` | cloturer une operation, ce qui la fige |
| `Chef_Equipe` | declarer et cloturer un arret de travail |
| `Portiqueur` | saisir un conteneur et lancer la detection Vision IA |

`authorizeRoles` court-circuite le controle pour `Admin` : il passe partout
sans etre liste.

Ouvrir une operation impose d'y affecter du personnel, ce qui releve du
planificateur : le terrain documente une operation, il n'en definit pas le
perimetre. Une operation `cloturee` ou `annulee` est figee, plus aucun
conteneur ne peut y etre rattache.

---

## Endpoints

| Methode | Route | Acces |
| --- | --- | --- |
| GET | `/api/health` | public |
| POST | `/api/auth/login` | public, limite en cas d'echecs repetes |
| GET POST PUT DELETE | `/api/operations`, `/:id/cloturer`, `/:id/annuler`, `/:id` | selon role |
| GET POST PUT DELETE | `/api/arrets`, `/:id/cloturer`, `/:id` | selon role |
| GET POST DELETE | `/api/containers`, `/:id` | selon role |
| POST | `/api/vision/detect-container` | Admin, Portiqueur |
| GET | `/api/personnel` | selon role |
| GET | `/api/dashboard/stats` | tout utilisateur authentifie |
| GET | `/api/integration/etat-operationnel` | jeton de service |

### Limitation des tentatives de connexion

Seules les tentatives **echouees** sont comptees : la protection vise le
devinement de mot de passe, or une connexion reussie n'en est pas une. Les
compter penalisait des usages legitimes, comme plusieurs personnes derriere la
meme adresse. Reglable par `LOGIN_RATE_MAX` et `LOGIN_RATE_WINDOW_MS`.

### Indicateurs du tableau de bord

`/api/dashboard/stats` renvoie des **compteurs agreges**, sans donnee
nominative : tout role authentifie y accede et voit donc les memes chiffres.
Les listes detaillees, elles, restent filtrees par role.

---

## Integration avec MarsaBot Factory

`GET /api/integration/etat-operationnel` est la **seule** passerelle entre les
deux applications. Elle est **strictement en lecture** : aucune route
d'ecriture n'est exposee dans cet espace.

MarsaBot interroge une URL fixe a chaque message recu et injecte la reponse
entiere dans le contexte du modele de langage. La reponse est donc un
instantane **compact**, borne en volume et libelle en clair : operations en
cours ou du jour, personnels affectes (nom et fonction uniquement), arrets de
travail encore ouverts avec leur motif, shift et vacation deduits de l'heure.

Bornes : 10 operations, 12 personnels et 5 arrets par operation. Reponse
observee autour de 1,7 Ko, plafond de l'ordre de 6 Ko.

### Authentification

Jeton de service `INTEGRATION_TOKEN`, accepte de deux facons :

```
Authorization: Bearer <jeton>          voie preferee
?token=<jeton>                         voie de compatibilite
```

La seconde existe parce que MarsaBot appelle ses sources API avec une simple
URL et n'envoie aucun en-tete personnalise. Un jeton place dans l'URL apparait
dans les journaux de l'appelant : preferer l'en-tete des que l'appelant sait en
envoyer.

Sans `INTEGRATION_TOKEN` configure, l'acces est **refuse** (503) plutot
qu'ouvert : une variable oubliee ne doit jamais exposer les donnees.

### Cote MarsaBot

Le garde anti-SSRF de MarsaBot refuse par defaut les adresses locales. Pour
qu'un bot puisse interroger MarsaTrack, declarer l'hote dans son `.env` :

```
ALLOWED_INTERNAL_HOSTS=localhost:3001,127.0.0.1:3001
```

---

## Base de donnees

Schema initial : `database/init.sql`, execute **une seule fois** sur une base
vide. Les evolutions ulterieures passent par `database/migrations/`, a
appliquer dans l'ordre sur une base deja creee.

`database/seed_demo.sql` contient un jeu de donnees **fictif** de
demonstration. Il n'est jamais execute automatiquement.

---

## Tests

```powershell
cd backend
npm test
```
