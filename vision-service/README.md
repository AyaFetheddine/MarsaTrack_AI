# MarsaTrack Vision Service

Microservice FastAPI charge de localiser et lire le matricule ISO 6346 **et** le code taille/type d'un conteneur.

## Architecture (modele V2, deux classes)

```text
Image complete
  -> YOLO11 V2 localise deux classes : container-number et iso-type
  -> le service separe les detections par classe et recadre chaque zone
  -> l'orientation de chaque zone est estimee (horizontale / verticale)
  -> PaddleOCR reconnait les caracteres sur plusieurs variantes de chaque crop
  -> les fragments sont reconstruits par leur geometrie (colonnes triees de
     haut en bas), jamais concatenes a l'aveugle
  -> le texte est normalise et les confusions OCR plausibles sont corrigees
     (regles distinctes pour le matricule et pour le code taille/type)
  -> le chiffre de controle ISO 6346 est verifie pour le matricule
  -> la structure du code taille/type est validee (ex: 22G1)
  -> le resultat (matricule + taille/type, confiances et bbox separees)
     est transmis au backend Node puis au frontend
```

YOLO fait uniquement la **detection** des zones. PaddleOCR fait la **reconnaissance**. La validation ISO 6346 (matricule) et la validation de structure taille/type sont des etapes deterministes : un texte dont le chiffre de controle est faux n'est jamais annonce comme valide, et une correction agressive n'est jamais appliquee juste pour rendre un code valide.

La confiance globale de chaque valeur est calculee ainsi :

```text
confidence = 0.45 * yolo_confidence + 0.55 * ocr_confidence
```

Le service fonctionne en CPU par defaut. Il ne lance aucun entrainement.

## Modeles locaux : V1 et V2

| Version | Fichier | Classes | Role |
| --- | --- | --- | --- |
| **V2 (principal)** | `models/container_code_type_yolo11n_v2_best.pt` | `container-number`, `iso-type` | Detecte le matricule **et** le code taille/type |
| V1 (repli) | `models/container_code_yolo11n_best.pt` | `container_code` | Detecte uniquement le matricule |

La **V2 est le modele actif par defaut**. La V1 reste disponible comme **repli controle** et **n'est jamais supprimee**.

> Les fichiers `*.pt` et `*.onnx` **ne sont pas versionnes dans Git** (regle `*.pt` / `*.onnx` du `.gitignore` du service). Aucun poids IA ne doit etre pousse.

## Configuration

Variables lues depuis `vision-service/.env` :

| Variable | Valeur par defaut | Role |
| --- | --- | --- |
| `VISION_MODEL_VERSION` | `v2` | Version active : `v2` (deux classes) ou `v1` |
| `VISION_V2_MODEL_PATH` | `models/container_code_type_yolo11n_v2_best.pt` | Poids V2 |
| `VISION_V1_MODEL_PATH` | `models/container_code_yolo11n_best.pt` | Poids V1 (repli) |
| `VISION_MODEL_FALLBACK_TO_V1` | `true` | Autorise le repli V2 -> V1 |
| `VISION_MODEL_PATH` | *(legacy)* | Repli de defaut pour le chemin V1 |
| `VISION_DEVICE` | `cpu` | Peripherique Ultralytics (`cpu`, `0`, `cuda`, ...) |
| `VISION_YOLO_CONFIDENCE` | `0.25` | Seuil minimal YOLO |
| `VISION_YOLO_IOU` | `0.45` | Seuil IoU YOLO |
| `VISION_CROP_MARGIN_PERCENT` | `0.04` | Marge autour du crop (cas horizontal) |
| `VISION_VERTICAL_RATIO_THRESHOLD` | `1.6` | Ratio hauteur/largeur au-dela duquel une zone est verticale |
| `VISION_VERTICAL_CROP_MARGIN_X_PERCENT` | `0.30` | Marge X pour une colonne verticale (large) |
| `VISION_VERTICAL_CROP_MARGIN_Y_PERCENT` | `0.02` | Marge Y pour une colonne verticale (serree) |
| `VISION_CONTEXT_CROP_MARGIN_PERCENT` | `0.60` | Marge du crop contextuel (dernier recours) |
| `VISION_MIN_CROP_SIDE_PX` | `160` | Petit cote minimal vise apres agrandissement |
| `VISION_MAX_CROP_SIDE_PX` | `1100` | Plafond du grand cote apres agrandissement (perf) |
| `VISION_MAX_UPSCALE_FACTOR` | `8` | Plafond du facteur d'agrandissement |
| `VISION_MAX_OCR_VARIANTS` | `14` | Variantes OCR maximum par zone (garde-fou perf.) |
| `VISION_DEBUG_SAVE_CROPS` | `false` | Active le diagnostic local des crops |
| `VISION_DEBUG_OUTPUT_DIR` | `debug` | Dossier local du diagnostic (ignore par Git) |
| `VISION_OCR_ENABLED` | `true` | Active PaddleOCR |
| `VISION_OCR_ENGINE` | `paddleocr` | Moteur OCR attendu |
| `VISION_FALLBACK_ENABLED` | `true` | Autorise le mock si le modele est indisponible |
| `VISION_MAX_IMAGE_SIZE_MB` | `5` | Taille maximale d'upload |

Les chemins sont resolus depuis `vision-service` (portables Windows/Linux). **Aucun chemin Windows complet n'est expose dans les reponses API.**

### Strategie de repli (fallback modele)

La V1 est utilisee **uniquement** si :

- la V2 est absente ou illisible **et** `VISION_MODEL_FALLBACK_TO_V1=true` ; ou
- `VISION_MODEL_VERSION=v1` est explicitement demande.

En cas de repli, `/health` et la reponse de detection exposent un **avertissement clair** (`fallback_in_use: true`, `model_warning`) et le code taille/type reste indisponible. Il n'y a **jamais** de bascule silencieuse.

## Lancement

```powershell
cd vision-service
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Endpoints

### `GET /health`

```json
{
  "status": "ok",
  "model_path": "models/container_code_type_yolo11n_v2_best.pt",
  "model_exists": true,
  "model_version": "v2",
  "active_model": "v2",
  "model_classes": ["container-number", "iso-type"],
  "model_loaded": true,
  "model_warning": null,
  "fallback_enabled": true,
  "fallback_model_available": true,
  "fallback_in_use": false,
  "yolo_available": true,
  "ocr_enabled": true,
  "ocr_available": true,
  "ocr_loaded": true,
  "ocr_engine": "paddleocr",
  "device": "cpu"
}
```

`model_loaded` / `ocr_loaded` passent a `true` apres le premier chargement (paresseux, une fois par processus). `model_classes` est rempli une fois le modele charge.

### `POST /detect-container`

Requete `multipart/form-data`, champ fichier `image` (PNG, JPEG, WebP).

```powershell
curl.exe -X POST -F "image=@C:\chemin\image-conteneur.jpg" http://localhost:8000/detect-container
```

Exemple de resultat reel V2 (matricule + taille/type) :

```json
{
  "status": "success",
  "data": {
    "detected_iso": "SESU2072393",
    "raw_ocr_text": "SESU2072393",
    "confidence": 0.94,
    "yolo_confidence": 0.89,
    "ocr_confidence": 0.98,
    "is_valid_iso": true,
    "owner_code": "SES", "category": "U",
    "serial_number": "207239", "check_digit": "3",

    "iso_type": "22G1",
    "raw_iso_type_ocr_text": "22G",
    "iso_type_confidence": 0.87,
    "iso_type_yolo_confidence": 0.88,
    "iso_type_ocr_confidence": 0.86,
    "is_valid_iso_type_format": true,
    "iso_type_details": {
      "length_code": "2", "height_code": "2",
      "type_group": "G", "type_detail": "1",
      "length_label": "20 pieds", "height_label": "8'6\" (2591 mm)",
      "type_label": "Conteneur general (dry)"
    },
    "iso_type_ocr_variant": "upscaled",
    "iso_type_bbox": {"x1": 262, "y1": 123, "x2": 289, "y2": 143},
    "iso_type_detections": [ ... ],
    "iso_type_warning": null,

    "detection_mode": "yolo_v2_paddleocr",
    "model_version": "v2",
    "fallback_in_use": false,
    "bbox": {"x1": 219, "y1": 88, "x2": 324, "y2": 119},
    "detections": [ ... ],
    "message": "Code conteneur detecte et valide.",
    "warning": null,
    "warnings": []
  }
}
```

Le matricule et le code taille/type sont **independants** : chacun peut etre present ou absent (cas partiels geres). L'ancien schema (champs matricule) est conserve : un frontend V1 reste compatible.

## Lecture verticale (marquages en colonne)

Certains conteneurs portent leur matricule et leur code taille/type **ecrits
verticalement**, un caractere par ligne, parfois sur deux colonnes voisines
(matricule a gauche, taille/type a droite). YOLO localise correctement ces
zones, mais la lecture demande un traitement dedie :

- **Orientation** : chaque zone est classee horizontale / verticale / incertaine
  en croisant le ratio de la boite **et** la geometrie reelle des fragments OCR.
  Le ratio de la boite seul n'est jamais suffisant.
- **Marges adaptatives** : une colonne verticale est elargie en X (les
  caracteres debordent) mais gardee serree en Y (pour ne pas absorber les
  marquages voisins). Le cas horizontal conserve exactement la marge d'origine.
- **Agrandissement adaptatif** : les colonnes font parfois moins de 20 px de
  large ; le crop est agrandi jusqu'a un petit cote exploitable, plafonne pour
  ne pas exploser le temps de traitement.
- **Variantes progressives** : agrandissement, rotations +90 / -90 / 180,
  niveaux de gris, contraste, seuillage. La recherche **s'arrete des qu'un code
  valide et fiable est obtenu** ; on ne paie donc le cout des variantes lourdes
  que si necessaire.
- **Reconstruction spatiale** : les fragments sont regroupes par colonne, tries
  de haut en bas et fusionnes selon leur position. Deux colonnes voisines
  restent separees. **Aucune concatenation aveugle** dans l'ordre de retour de
  l'OCR.
- **Scoring** : la confiance OCR ne suffit jamais seule. Une lecture d'un seul
  caractere a 98 % est fortement penalisee ; la validation ISO 6346 prime sur un
  score OCR eleve. La confiance affichee a l'utilisateur est une **confiance
  metier** recalculee, jamais une confiance brute trompeuse.

Le cas horizontal (import de fichier, majorite des captures camera) est
**inchange** : il emprunte exactement le meme chemin qu'avant.

### Diagnostic local des crops

Pour investiguer un cas, activer `VISION_DEBUG_SAVE_CROPS=true`. Le service
ecrit alors, dans `<VISION_DEBUG_OUTPUT_DIR>/<id-requete>/` :

- l'image originale annotee des boites YOLO ;
- chaque crop et chaque variante OCR essayee ;
- une trace `trace.json` : boites, orientations, marges, lectures, candidats,
  corrections et raison de selection.

L'identifiant de requete est aleatoire et non sensible. **Aucun chemin Windows
complet, aucun nom d'utilisateur, aucun secret** n'est ecrit. Le dossier est
ignore par Git et n'est expose par **aucune route HTTP**.

## Modes de detection et erreurs

- `yolo_v2_paddleocr` : detection V2, matricule ISO valide trouve.
- `yolo_paddleocr` : detection V1 (ou repli), matricule ISO valide trouve.
- `yolo_no_valid_iso` : zone trouvee, aucun ISO valide (texte brut fourni).
- `ocr_disabled` / `ocr_error` : zone YOLO conservee, OCR desactive ou en erreur.
- `no_detection` : aucune zone YOLO (le mock n'est pas utilise).
- `fallback_mock` : microservice indisponible et fallback active ; ce n'est **jamais** une preuve de detection reelle.

La correction manuelle du matricule **et** du code taille/type reste toujours disponible dans le frontend.

## Tests

```powershell
cd vision-service
.\.venv\Scripts\Activate.ps1
python -m pytest
```

Les tests utilisent des doubles YOLO/OCR (classes V1 `container_code` et V2 `container-number` + `iso-type`) et ne dependent pas des poids locaux. Le test d'integration du vrai modele est ignore si le poids ou Ultralytics est absent. Aucune image sensible n'est versionnee.

## Limites connues

- Le mapping des libelles taille/type (longueur, hauteur, groupe de type) est **volontairement partiel et extensible** : un code structurellement valide mais dont le libelle detaille est inconnu est accepte avec un `warning` metier.
- La validation taille/type couvre la **structure** (4 caracteres, 3e = lettre), pas encore la table officielle ISO 6346 complete.
- La qualite OCR depend du cadrage, de l'eclairage et de la resolution.
- Le premier appel est plus lent (chargement des poids YOLO + PaddleOCR).
- **Lecture verticale** : la reconstruction et les rotations ameliorent nettement les colonnes verticales, mais un caractere physiquement illisible (masque par un filigrane, un reflet ou un flou fort) ne peut jamais etre recupere. Dans ce cas, la zone est signalee comme non fiable et la **correction manuelle** reste la voie normale.
- **Surface bombee / perspective** : sur un conteneur a paroi arrondie ou photographie de biais, certaines lettres du matricule sont deformees et confondues par l'OCR avec des chiffres (constate sur un cas reel : `TEMU` lu `TE20`, le `M` et le `U` etant lus `2` et `0`). Aucune correction positionnelle prudente ne peut inventer la bonne lettre : le matricule est alors affiche en lecture brute la plus complete pour faciliter la correction manuelle, mais n'est pas valide automatiquement. Le code taille/type, plus court, reste souvent recuperable (ex: `22G1` lu `2221` puis corrige via la preference "groupe de type connu").
- La lecture verticale ajoute des variantes OCR : sur une image ou aucun code valide n'est trouve, le temps de traitement d'une zone verticale est plus long que celui d'une zone horizontale (borne par `VISION_MAX_OCR_VARIANTS`, `VISION_MAX_CROP_SIDE_PX` et le timeout backend). Ordre de grandeur observe sur CPU : ~2 s pour une photo nette, jusqu'a ~30 s pour une grande image (1920x1080) dont le matricule vertical n'est pas lisible et declenche toutes les variantes.
```
