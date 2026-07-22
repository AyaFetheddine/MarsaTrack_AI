# MarsaTrack AI - Frontend

## Capture camera des conteneurs

Le module Conteneurs permet au portiqueur d'importer une image ou de prendre une photo avant de lancer l'analyse Vision IA.

### Utilisation sur ordinateur

1. Ouvrir `http://localhost:5173` dans Edge ou Chrome.
2. Se connecter avec un compte Portiqueur autorise.
3. Dans Conteneurs, cliquer sur `Utiliser la camera`.
4. Autoriser le navigateur a utiliser la camera.
5. Placer le code ISO dans le cadre, prendre la photo, verifier la qualite puis choisir `Utiliser cette photo`.

### Utilisation sur mobile

La capture fonctionne sur `localhost` pendant le developpement. Sur un telephone accedant au projet par une adresse reseau, le navigateur exige une connexion HTTPS pour donner acces a la camera.

Avant la capture, verifier que :

- le code ISO est lisible et bien eclaire ;
- les caracteres occupent une partie suffisante de l'image ;
- les reflets et le flou sont limites ;
- l'orientation horizontale ou verticale correspond au code visible.

Le navigateur peut proposer plusieurs cameras. Le module privilegie la camera arriere lorsque le navigateur fournit cette information. Le flash et le zoom ne sont affiches que lorsqu'ils sont reels disponibles sur l'appareil.

### Controle qualite local

Avant d'envoyer une photo a l'analyse, le frontend verifie localement la resolution, la taille du fichier, la luminosite, le contraste et un indicateur simple de nettete. Les blocages imposent une nouvelle photo. Les avertissements laissent le choix au portiqueur lorsque le code reste lisible.

### Verification technique

```powershell
cd frontend
npm run lint
npm run build
npm run test:camera
```
