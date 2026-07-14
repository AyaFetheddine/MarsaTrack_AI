from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse

from app.services.detection_service import detect_container_from_image

MAX_IMAGE_SIZE = 5 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}

app = FastAPI(
    title="MarsaTrack Vision Service",
    description="Microservice Vision IA prepare pour YOLO/OCR. Mode actuel : mock.",
    version="0.1.0",
)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "marsatrack-vision",
        "mode": "mock",
    }


@app.post("/detect-container")
async def detect_container(image: UploadFile | None = File(None)):
    if not image:
        return JSONResponse(
            status_code=400,
            content={
                "status": "error",
                "message": "Une image du conteneur est obligatoire.",
            },
        )

    if image.content_type not in ALLOWED_IMAGE_TYPES:
        return JSONResponse(
            status_code=400,
            content={
                "status": "error",
                "message": "Format image invalide. Formats acceptes : PNG, JPEG ou WebP.",
            },
        )

    content = await image.read()

    if len(content) > MAX_IMAGE_SIZE:
        return JSONResponse(
            status_code=413,
            content={
                "status": "error",
                "message": "Image trop lourde. Taille maximale autorisee : 5 MB.",
            },
        )

    result = detect_container_from_image(content, image.content_type)
    return {"status": "success", "data": result}
