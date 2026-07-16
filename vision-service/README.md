# MarsaTrack Vision Service

Microservice FastAPI charge de localiser et lire le matricule ISO 6346 d'un conteneur.

## Architecture

```text
Image complete
  -> YOLO11 localise la zone container_code
  -> le service recadre la meilleure zone avec une marge configurable
  -> PaddleOCR reconnait les caracteres sur plusieurs variantes du crop
  -> le texte est normalise et les confusions OCR plausibles sont corrigees
  -> le chiffre de controle ISO 6346 est verifie
  -> le resultat est transmis au backend Node puis au frontend
```

YOLO fait uniquement la **detection** de la zone. PaddleOCR fait la **reconnaissance** des caracteres. La validation ISO 6346 est une derniere etape deterministe : un texte dont le chiffre de controle est faux n'est jamais annonce comme valide.

La confiance globale est calculee ainsi :

```text
confidence = 0.45 * yolo_confidence + 0.55 * ocr_confidence
```

Le service fonctionne en CPU par defaut. Il ne lance aucun entrainement.

## Modele local

Le poids entraine doit etre place ici :

```text
models/container_code_yolo11n_best.pt
```

Les fichiers `*.pt` et `*.onnx` sont ignores par Git et ne doivent jamais etre pousses. Le modele final doit contenir une seule classe nommee `container_code`. Toute classe inattendue est ignoree.

## Installation Windows PowerShell

Python 3.11 est recommande pour la compatibilite Windows de PaddlePaddle.

```powershell
cd vision-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Le projet utilise `opencv-python-headless` pour eviter les dependances d'interface graphique. CUDA n'est pas requis.

## Configuration

Copier `.env.example` vers `.env`, puis ajuster si necessaire :

| Variable | Valeur par defaut | Role |
| --- | --- | --- |
| `VISION_MODEL_PATH` | `models/container_code_yolo11n_best.pt` | Poids YOLO local |
| `VISION_DEVICE` | `cpu` | Peripherique Ultralytics (`cpu`, `0`, `cuda`, etc.) |
| `VISION_YOLO_CONFIDENCE` | `0.25` | Seuil minimal YOLO |
| `VISION_YOLO_IOU` | `0.45` | Seuil IoU YOLO |
| `VISION_CROP_MARGIN_PERCENT` | `0.04` | Marge autour du crop |
| `VISION_OCR_ENABLED` | `true` | Active PaddleOCR |
| `VISION_OCR_ENGINE` | `paddleocr` | Moteur OCR attendu |
| `VISION_FALLBACK_ENABLED` | `true` | Autorise le mock seulement si le modele est indisponible |
| `VISION_MAX_IMAGE_SIZE_MB` | `5` | Taille maximale d'upload |

Le chemin du modele est toujours resolu depuis `vision-service`, quel que soit le dossier depuis lequel Uvicorn est lance.

## Lancement

```powershell
cd vision-service
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Endpoints

### `GET /health`

Retourne l'existence et l'etat de chargement du modele et de l'OCR sans exposer le chemin Windows complet :

```json
{
  "status": "ok",
  "model_path": "models/container_code_yolo11n_best.pt",
  "model_exists": true,
  "yolo_available": true,
  "model_loaded": false,
  "model_error": null,
  "ocr_enabled": true,
  "ocr_available": true,
  "ocr_loaded": false,
  "ocr_engine": "paddleocr",
  "ocr_error": null,
  "device": "cpu",
  "fallback_enabled": true
}
```

`yolo_available` et `ocr_available` indiquent si les bibliotheques sont installees. `model_loaded` et `ocr_loaded` passent a `true` apres leur premier chargement reussi. Le chargement est paresseux et n'est effectue qu'une fois par processus.

### `POST /detect-container`

Requete `multipart/form-data` avec un champ fichier `image`. Formats : PNG, JPEG ou WebP.

```powershell
curl.exe -X POST `
  -F "image=@C:\chemin\vers\image-conteneur.jpg" `
  http://localhost:8000/detect-container
```

Exemple de resultat reel attendu :

```json
{
  "status": "success",
  "data": {
    "detected_iso": "MRKU6234191",
    "raw_ocr_text": "MRKU 623419 1",
    "confidence": 0.91,
    "yolo_confidence": 0.95,
    "ocr_confidence": 0.88,
    "is_valid_iso": true,
    "owner_code": "MRK",
    "category": "U",
    "serial_number": "623419",
    "check_digit": "1",
    "detection_mode": "yolo_paddleocr",
    "ocr_variant": "upscaled_gray",
    "bbox": {"x1": 100, "y1": 50, "x2": 500, "y2": 150},
    "detections": [],
    "message": "Code conteneur detecte et valide.",
    "warning": null
  }
}
```

## Modes de detection et erreurs

- `yolo_paddleocr` : zone et code ISO valide trouves.
- `yolo_no_valid_iso` : zone trouvee, OCR disponible, aucun ISO valide. Le texte brut reste fourni.
- `ocr_disabled` : zone YOLO trouvee, OCR desactive.
- `ocr_error` : zone YOLO conservee malgre une erreur OCR.
- `no_detection` : aucune zone YOLO. Le mock n'est pas utilise.
- `fallback_mock` : modele absent ou impossible a charger et fallback active. Un avertissement precise qu'il ne s'agit pas d'une detection reelle.
- `model_unavailable` : modele indisponible avec fallback desactive ; HTTP 503.

La correction manuelle reste toujours disponible dans le frontend. Un resultat OCR invalide ne remplit pas automatiquement le matricule.

## Tests

```powershell
cd vision-service
.\.venv\Scripts\Activate.ps1
python -m pytest
curl.exe http://localhost:8000/health
```

Les tests automatises utilisent des doubles YOLO/OCR et ne dependent pas du poids local. Le test d'integration du vrai modele est ignore si le poids ou Ultralytics est absent. Aucune image sensible n'est versionnee.

## Limites connues

- La qualite OCR depend fortement du cadrage, de l'eclairage et de la resolution du code.
- Les rotations ne sont essayees qu'apres l'echec des variantes courantes pour limiter le temps CPU.
- Le premier appel est plus lent car YOLO et PaddleOCR chargent leurs poids en memoire.
- Les performances de PaddleOCR doivent etre mesurees sur des images Marsa Maroc representatives avant toute conclusion.
