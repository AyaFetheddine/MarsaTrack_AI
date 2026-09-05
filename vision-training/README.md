# MarsaTrack AI - Training YOLO

Ce dossier prepare la phase reelle d'entrainement YOLO pour detecter la zone du matricule ISO 6346 sur une image de conteneur.

## Objectif

Le modele YOLO ne lit pas le texte. Il localise uniquement la zone complete du matricule, par exemple `MRKU 623419 1`.

Pipeline vise :

```txt
Image
-> YOLO : localisation de la zone du code
-> recadrage
-> OCR : lecture des caracteres
-> normalisation
-> validation ISO 6346
-> validation ou correction par le portiqueur
```

## Deux versions du modele

Le detecteur a ete entraine en deux temps. **Les deux versions sont conservees**, et le service Vision les utilise toutes les deux : la V2 en production, la V1 en repli controle si la V2 devient indisponible.

| | **V2 — en production** | V1 — repli |
| --- | --- | --- |
| Classes | `container-number` + `iso-type` | `container_code` seul |
| Detecte | le matricule **et** le code taille/type | le matricule seul |
| Configuration | `config/container_code_type_v2.yaml` | `config/container_code.yaml` |
| Notebook | `notebooks/train_yolo11_container_code_type_v2.ipynb` | `notebooks/train_yolo11_container_code.ipynb` |
| Poids attendu | `container_code_type_yolo11n_v2_best.pt` | `container_code_yolo11n_best.pt` |

La V2 est nee d'un besoin metier apparu apres la V1 : le code taille/type (`22G1`) doit etre releve en meme temps que le matricule. Plutot que d'ajouter un second modele, une seule detection a deux classes a ete reentrainee.

## Classes YOLO

**V2 (deux classes)** :

```txt
0 container-number
1 iso-type
```

**V1 (une classe)** :

```txt
0 container_code
```

Une classe represente toute la zone du marquage, jamais un caractere isole. Le modele **localise** ; c'est PaddleOCR qui **lit**.

## Resultats de l'entrainement V2

Entrainement sur Kaggle, **26 minutes sur 2 GPU Tesla T4**, 70 epoques, images redimensionnees a 640 px.

Dataset Roboflow `Container-Shipping-Number2-1` : 745 images sources, 1 931 apres augmentation (1 779 entrainement, 115 validation, 37 test), 1 973 annotations `container-number` et 1 749 `iso-type`.

Mesures sur le jeu de test (37 images, 73 instances) :

| Metrique | Global | container-number | iso-type |
| --- | --- | --- | --- |
| Precision | 94,4 % | 94,9 % | 93,9 % |
| Recall | ~100 % | 100 % | 100 % |
| mAP50 | 99,2 % | 99,2 % | 99,2 % |
| mAP50-95 | 86,5 % | 87,1 % | 85,8 % |

Le notebook versionne conserve le code et les journaux d'entrainement. Les apercus d'images ont ete retires : ils pesaient 6 Mo a eux seuls, sans apporter d'information que les metriques ci-dessus ne donnent deja.

## Structure

```txt
vision-training/
├── README.md
├── DATASET_GUIDE.md
├── dataset/
│   ├── images/
│   │   ├── train/
│   │   ├── val/
│   │   └── test/
│   └── labels/
│       ├── train/
│       ├── val/
│       └── test/
├── config/
│   ├── container_code.yaml              # V1, une classe
│   └── container_code_type_v2.yaml      # V2, deux classes (production)
├── scripts/
│   ├── validate_dataset.py
│   ├── inspect_labels.py
│   └── split_dataset.py
├── notebooks/
│   ├── train_yolo11_container_code.ipynb
│   └── train_yolo11_container_code_type_v2.ipynb
├── models/
│   └── .gitkeep
└── results/
    └── .gitkeep
```

Le dossier `dataset/`, les resultats d'entrainement et les poids de modeles ne doivent pas etre versionnes.

## Format YOLO

Chaque image annotee doit avoir un fichier `.txt` du meme nom dans le dossier `labels`.

Exemple :

```txt
images/train/container_001.jpg
labels/train/container_001.txt
```

Chaque ligne d'annotation :

```txt
class_id x_center y_center width height
```

Les coordonnees sont normalisees entre 0 et 1.

Une image negative sans code exploitable peut avoir un fichier label vide.

## Roboflow

Workflow recommande :

1. Creer un projet `Object Detection`.
2. Creer uniquement la classe `container_code`.
3. Importer les images terrain.
4. Annoter les zones des matricules ISO.
5. Verifier la coherence des annotations.
6. Generer une version du dataset.
7. Appliquer uniquement des augmentations realistes.
8. Exporter au format YOLO11/Ultralytics.
9. Importer le dataset dans Kaggle.

Augmentations raisonnables :

- rotation faible ;
- luminosite ;
- contraste ;
- leger flou ;
- bruit leger ;
- perspective legere.

A eviter :

- rotation extreme ;
- retournement vertical ;
- deformation excessive ;
- crop qui coupe le code ;
- flou tres fort.

## Kaggle

Le notebook principal est :

```txt
vision-training/notebooks/train_yolo11_container_code.ipynb
```

Le fichier dataset YAML est :

```txt
vision-training/config/container_code.yaml
```

Dans Kaggle, le chemin `path` du YAML devra etre adapte selon l'emplacement reel du dataset. Ne pas utiliser de chemin Windows dans Kaggle.

Modele de depart recommande :

```txt
yolo11n.pt
```

Raison :

- leger ;
- rapide ;
- adapte au premier prototype ;
- simple a integrer ensuite dans le microservice.

## Scripts

Valider le dataset :

```bash
python vision-training/scripts/validate_dataset.py --dataset vision-training/dataset
```

Inspecter visuellement quelques labels :

```bash
python vision-training/scripts/inspect_labels.py --dataset vision-training/dataset --split train --count 12 --output vision-training/results/inspection
```

Separer un dataset source :

```bash
python vision-training/scripts/split_dataset.py \
  --images ./source/images \
  --labels ./source/labels \
  --output vision-training/dataset \
  --train 0.70 \
  --val 0.20 \
  --test 0.10 \
  --seed 42
```

## Metriques a relever

Pendant l'entrainement, il faut surveiller :

- Precision ;
- Recall ;
- mAP50 ;
- mAP50-95 ;
- matrice de confusion ;
- courbes Precision-Recall ;
- vrais positifs ;
- faux positifs ;
- faux negatifs.

Pour MarsaTrack AI :

- un faux negatif signifie que la zone du code n'a pas ete detectee ;
- un faux positif signifie qu'une autre zone a ete prise pour un matricule ;
- une bounding box imprecise peut reduire la qualite du futur OCR.

## Export

Le fichier principal attendu pour la suite est :

```txt
best.pt
```

Il ne doit jamais etre commite dans Git.

Plus tard, il pourra etre place localement dans :

```txt
vision-service/models/container_code_best.pt
```

Cette integration n'est pas faite dans cette etape.
