# MarsaPort AI - Frontend

Le frontend est le **portail unique MarsaPort AI**. Il reunit deux modules :

- **MarsaTrack AI** : tableau de bord, operations, arrets de travail, conteneurs et personnel ;
- **MarsaBot Factory** : bots, base de connaissances et parametres des assistants, **reserves a l'administrateur**.

La console d'assistants garde son propre depot, son backend et son authentification. Le portail se contente de l'afficher : elle detecte l'encadrement et masque sa propre barre laterale, de sorte qu'une seule navigation reste visible. Les deux ports etant des origines distinctes, la console demande sa propre connexion la premiere fois.

## Roles et navigation

Cinq roles de connexion, chacun avec au moins une prerogative exclusive :

| Role | Voit | Prerogative exclusive |
|---|---|---|
| Admin | tout, MarsaBot compris | supprimer |
| Responsable_Exploitation | tableau de bord, operations, arrets, conteneurs, personnel | ouvrir et annuler une operation, gerer le personnel |
| Chef_Services | idem | cloturer une operation |
| Chef_Equipe | tableau de bord, operations, arrets, personnel | declarer et cloturer un arret |
| Portiqueur | tableau de bord, operations, conteneurs | saisir un conteneur et lancer la Vision IA |

Le tableau de bord affiche les **memes compteurs pour tous les roles** : ce sont des agregats, sans donnee nominative. Les listes detaillees, elles, restent filtrees par role.

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

Le module demande la **camera arriere** lorsque l'appareil en expose une (`facingMode: environment`), et se rabat sur la camera par defaut sinon. Il n'offre en revanche **ni flash, ni zoom, ni selecteur de camera** : le cadrage se fait en approchant l'appareil.

### Limite connue : matricule vertical par camera

Un matricule **horizontal** est lu de facon fiable par la camera. Un matricule **vertical** photographie a la camera echoue en revanche souvent, la ou la meme image importee depuis un fichier est correctement lue.

La cause n'est pas le chemin camera, mais la qualite de la prise de vue : reflets, moire et resolution utile reduite degradent une colonne de caracteres fins bien plus qu'une ligne horizontale. L'OCR ne restitue alors que 8 a 10 caracteres sur 11, et il n'existe plus de fenetre de 11 caracteres a corriger. Le systeme bascule en saisie manuelle, ce qui est le comportement voulu.

En pratique : photographier une **impression papier** a plat plutot qu'un ecran, et remplir le cadre avec le marquage.

### Controle qualite local

Avant d'envoyer une photo a l'analyse, le frontend verifie localement la resolution, la taille du fichier, la luminosite, le contraste et un indicateur simple de nettete. Les blocages imposent une nouvelle photo. Les avertissements laissent le choix au portiqueur lorsque le code reste lisible.

### Verification technique

```powershell
cd frontend
npm run lint
npm run build
npm run test:camera
```
