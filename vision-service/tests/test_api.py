from fastapi.testclient import TestClient

from app.main import app
from app.utils.iso6346 import validate_container_code

client = TestClient(app)

PNG_1X1 = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01"
    b"\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde"
    b"\x00\x00\x00\nIDATx\x9cc\xf8\x0f\x00\x01\x01\x01"
    b"\x00\x18\xdd\x8d\xb0\x00\x00\x00\x00IEND\xaeB`\x82"
)
JPEG_MINIMAL = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00H\x00H\x00\x00\xff\xd9"


def test_health():
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "marsatrack-vision",
        "mode": "mock",
    }


def test_detect_container_png():
    response = client.post(
        "/detect-container",
        files={"image": ("container.png", PNG_1X1, "image/png")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "success"
    assert payload["data"]["detected_iso"] == "MRKU6234191"
    assert payload["data"]["is_valid_iso"] is True
    assert payload["data"]["detection_mode"] == "mock"


def test_detect_container_jpeg():
    response = client.post(
        "/detect-container",
        files={"image": ("container.jpg", JPEG_MINIMAL, "image/jpeg")},
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
    assert response.json()["message"] == "Format image invalide. Formats acceptes : PNG, JPEG ou WebP."


def test_detect_container_too_large():
    response = client.post(
        "/detect-container",
        files={"image": ("large.png", b"0" * (5 * 1024 * 1024 + 1), "image/png")},
    )

    assert response.status_code == 413
    assert response.json()["message"] == "Image trop lourde. Taille maximale autorisee : 5 MB."


def test_iso_valid():
    result = validate_container_code("MRKU6234191")

    assert result["is_valid"] is True
    assert result["expected_check_digit"] == "1"


def test_iso_invalid_check_digit():
    result = validate_container_code("MRKU6234192")

    assert result["is_valid"] is False
    assert result["is_valid_format"] is True
    assert result["expected_check_digit"] == "1"


def test_iso_invalid_format():
    result = validate_container_code("ABC123")

    assert result["is_valid"] is False
    assert result["is_valid_format"] is False


def test_iso_normalized_valid():
    result = validate_container_code("mrku-623419-1")

    assert result["normalized"] == "MRKU6234191"
    assert result["is_valid"] is True
