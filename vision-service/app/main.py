from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse

from app.config import settings
from app.services.detection_service import (
    InvalidImageError,
    ModelUnavailableError,
    detect_container_from_image,
    get_runtime_status,
)


ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}

app = FastAPI(
    title="MarsaTrack Vision Service",
    description="Detection YOLO de la zone container_code et reconnaissance PaddleOCR.",
    version="1.0.0",
)


@app.get("/health")
async def health():
    return {"status": "ok", **get_runtime_status()}


@app.post("/detect-container")
async def detect_container(image: UploadFile | None = File(None)):
    if not image:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "message": "Une image du conteneur est obligatoire."},
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
    if len(content) > settings.max_image_size_bytes:
        return JSONResponse(
            status_code=413,
            content={
                "status": "error",
                "message": f"Image trop lourde. Taille maximale autorisee : {settings.max_image_size_mb} MB.",
            },
        )

    try:
        result = detect_container_from_image(content, image.content_type)
    except InvalidImageError as error:
        return JSONResponse(
            status_code=400,
            content={"status": "error", "message": str(error)},
        )
    except ModelUnavailableError as error:
        return JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "detection_mode": "model_unavailable",
                "message": str(error),
            },
        )
    return {"status": "success", "data": result}
