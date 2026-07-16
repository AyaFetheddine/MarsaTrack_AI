import io
from types import SimpleNamespace

from fastapi.testclient import TestClient
from PIL import Image

import app.main as main_module
from app.main import app


client = TestClient(app)


def make_png(width: int = 16, height: int = 16) -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (width, height), "white").save(output, format="PNG")
    return output.getvalue()


def test_health(monkeypatch):
    monkeypatch.setattr(
        main_module,
        "get_runtime_status",
        lambda: {
            "model_path": "models/container_code_yolo11n_best.pt",
            "model_exists": True,
            "model_loaded": False,
            "model_error": None,
            "ocr_enabled": True,
            "ocr_loaded": False,
            "ocr_engine": "paddleocr",
            "ocr_error": None,
            "device": "cpu",
            "fallback_enabled": True,
        },
    )
    payload = client.get("/health").json()
    assert payload["status"] == "ok"
    assert payload["model_exists"] is True
    assert payload["ocr_engine"] == "paddleocr"
    assert "Aya" not in payload["model_path"]


def test_detect_container_success(monkeypatch):
    monkeypatch.setattr(
        main_module,
        "detect_container_from_image",
        lambda *_: {
            "detected_iso": "MRKU6234191",
            "confidence": 0.91,
            "is_valid_iso": True,
            "detection_mode": "yolo_paddleocr",
            "detections": [],
        },
    )
    response = client.post(
        "/detect-container",
        files={"image": ("container.png", make_png(), "image/png")},
    )
    assert response.status_code == 200
    assert response.json()["data"]["detected_iso"] == "MRKU6234191"


def test_detect_container_missing_file():
    response = client.post("/detect-container")
    assert response.status_code == 400
    assert response.json()["message"] == "Une image du conteneur est obligatoire."


def test_detect_container_invalid_file_type():
    response = client.post(
        "/detect-container",
        files={"image": ("notes.txt", b"not an image", "text/plain")},
    )
    assert response.status_code == 400
    assert "Format image invalide" in response.json()["message"]


def test_detect_container_invalid_image():
    response = client.post(
        "/detect-container",
        files={"image": ("fake.png", b"not a png", "image/png")},
    )
    assert response.status_code == 400
    assert "image valide" in response.json()["message"]


def test_detect_container_too_large(monkeypatch):
    monkeypatch.setattr(
        main_module,
        "settings",
        SimpleNamespace(max_image_size_bytes=1024 * 1024, max_image_size_mb=1),
    )
    response = client.post(
        "/detect-container",
        files={"image": ("large.png", b"0" * (1024 * 1024 + 1), "image/png")},
    )
    assert response.status_code == 413
    assert "1 MB" in response.json()["message"]
