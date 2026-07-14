# Guide Dataset - container_code

Ce guide definit les regles de constitution et d'annotation du dataset YOLO pour MarsaTrack AI.

## Tache YOLO

Le modele doit detecter la zone complete du matricule ISO 6346.

Classe unique :

```txt
0 container_code
```

La bounding box doit encadrer :

- les trois lettres du proprietaire ;
- la lettre de categorie ;
- les six chiffres du numero de serie ;
- le chiffre de controle.

Exemple :

```txt
MRKU 623419 1
```

Ne pas creer les classes `lettre`, `chiffre`, `proprietaire`, `numero_serie` ou `container`.

## Images a collecter

Le dataset doit contenir des images variees :

- conteneurs vus de face ;
- conteneurs vus de cote ;
- images proches ;
- images eloignees ;
- differents angles ;
- lumiere forte ;
- faible luminosite ;
- ombres ;
- pluie ou ciel couvert ;
- code legerement sale ;
- rouille ;
- peinture abimee ;
- flou leger ;
- resolutions differentes ;
- couleurs de conteneurs variees ;
- compagnies et codes proprietaires varies ;
- code horizontal ;
- code vertical si present sur le terrain ;
- images prises depuis un telephone.

## Images a eviter

Eviter :

- les images sans matricule visible, sauf pour un petit lot negatif ;
- les matricules totalement illisibles ;
- les duplications massives de la meme image ;
- un dataset uniquement propre, frontal et parfait ;
- les images artificielles non representatives du terrain portuaire.

## Images negatives

Il est utile d'ajouter quelques images sans code exploitable pour reduire les faux positifs.

Regle :

- conserver un fichier label `.txt` vide pour ces images ;
- ne pas creer une annotation incorrecte ;
- ne pas annoter une zone qui ne contient pas un code exploitable.

## Regles d'annotation

- Annoter une bounding box par zone de matricule visible.
- Encadrer le code complet.
- Garder une petite marge autour du texte.
- Ne pas encadrer tout le conteneur.
- Ne pas couper le premier caractere.
- Ne pas couper le chiffre de controle.
- Si deux codes complets sont visibles, annoter les deux.
- Si le code est trop masque ou totalement illisible, ne pas l'annoter.
- Si le code est partiellement lisible mais la zone est clairement identifiable, garder une regle constante sur tout le dataset.
- Documenter toute decision particuliere dans ce guide.

Regle retenue pour le MVP :

```txt
Annoter uniquement les zones dont le code complet est visible ou presque complet.
Ne pas annoter les codes trop masques pour etre lus par un OCR.
```

## Controle qualite

Avant entrainement :

- verifier que les boxes entourent le texte, pas le conteneur complet ;
- verifier que les labels sont bien en classe `0` ;
- verifier qu'une image et son label ont le meme nom ;
- inspecter visuellement plusieurs exemples par split ;
- eviter les doublons entre train, val et test.

## Repartition conseillee

Repartition initiale :

```txt
train : 70 %
val   : 20 %
test  : 10 %
```

Le split de test doit rester stable et ne pas etre utilise pour ajuster les hyperparametres.
