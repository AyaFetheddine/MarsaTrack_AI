from app.utils.iso6346 import validate_container_code

SIMULATED_DETECTED_ISO = "MRKU6234191"


def detect_container_from_image(image_content: bytes, content_type: str) -> dict:
    """Return a deterministic mock result until YOLO/OCR is integrated."""
    validation = validate_container_code(SIMULATED_DETECTED_ISO)

    return {
        "detected_iso": validation["normalized"],
        "confidence": 0.60,
        "is_valid_iso": validation["is_valid"],
        "is_valid_format": validation["is_valid_format"],
        "is_valid_check_digit": validation["is_valid_check_digit"],
        "owner_code": validation.get("owner_code"),
        "category": validation.get("category"),
        "serial_number": validation.get("serial_number"),
        "check_digit": validation.get("check_digit"),
        "expected_check_digit": validation.get("expected_check_digit"),
        "detection_mode": "mock",
        "message": "Detection simulee reussie.",
    }
