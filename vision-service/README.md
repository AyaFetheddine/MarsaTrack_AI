# MarsaTrack Vision Service

Microservice FastAPI dedie a la future Vision IA de MarsaTrack AI.

Le mode actuel est simule. Aucun modele YOLO/OCR reel n'est encore charge.

## Role

Le frontend envoie toujours l'image au backend Node.js. Le backend Node.js appelle ensuite ce microservice Python :

```txt
React -> Node.js /api/vision/detect-container -> FastAPI /detect-container
```

Cette architecture permet d'ajouter plus tard YOLO + OCR dans Python sans modifier le frontend.

## Installation

```powershell
cd vision-service
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

## Lancement

```powershell
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Endpoints

### GET /health

```json
{
  "status": "ok",
  "service": "marsatrack-vision",
  "mode": "mock"
}
```

### POST /detect-container

Requete multipart/form-data avec un fichier obligatoire nomme `image`.

Formats acceptes :

- PNG
- JPEG
- WebP

Taille maximale : 5 MB.

Reponse actuelle :

```json
{
  "status": "success",
  "data": {
    "detected_iso": "MRKU6234191",
    "confidence": 0.6,
    "is_valid_iso": true,
    "is_valid_format": true,
    "is_valid_check_digit": true,
    "owner_code": "MRK",
    "category": "U",
    "serial_number": "623419",
    "check_digit": "1",
    "expected_check_digit": "1",
    "detection_mode": "mock",
    "message": "Detection simulee reussie."
  }
}
```

## Tests

```powershell
cd vision-service
pytest
```

## Evolution prevue

Le futur code YOLO/OCR sera ajoute dans :

```txt
app/services/detection_service.py
```

Le contrat de reponse devra rester stable pour eviter de modifier le frontend.
