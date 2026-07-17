from __future__ import annotations

import io
import importlib.util
import re
from dataclasses import dataclass
from typing import Any

from PIL import Image, ImageEnhance, ImageFilter, ImageOps, UnidentifiedImageError

from app.config import settings
from app.utils.iso6346 import validate_container_code


SIMULATED_DETECTED_ISO = "MRKU6234191"
EXPECTED_CLASS_NAME = "container_code"
CONFIDENCE_YOLO_WEIGHT = 0.45
CONFIDENCE_OCR_WEIGHT = 0.55
MAX_CANDIDATES = 64

_yolo_model: Any = None
_yolo_load_attempted = False
_yolo_load_error: str | None = None
_ocr_engine: Any = None
_ocr_load_attempted = False
_ocr_load_error: str | None = None


class ModelUnavailableError(RuntimeError):
    pass


class InvalidImageError(ValueError):
    pass


class OcrUnavailableError(RuntimeError):
    pass


@dataclass
class OcrReading:
    text: str
    confidence: float
    variant: str
    detection_index: int
    yolo_confidence: float = 0.0


def reset_runtime_state() -> None:
    """Reset lazy singletons. Intended for tests only."""
    global _yolo_model, _yolo_load_attempted, _yolo_load_error
    global _ocr_engine, _ocr_load_attempted, _ocr_load_error
    _yolo_model = None
    _yolo_load_attempted = False
    _yolo_load_error = None
    _ocr_engine = None
    _ocr_load_attempted = False
    _ocr_load_error = None


def load_yolo_model() -> Any:
    if not settings.model_path.exists():
        raise ModelUnavailableError(
            f"Modele YOLO introuvable : {settings.public_model_path}."
        )

    try:
        from ultralytics import YOLO
    except ImportError as error:
        raise ModelUnavailableError(
            "Ultralytics n'est pas installe dans l'environnement Vision."
        ) from error

    try:
        return YOLO(str(settings.model_path))
    except Exception as error:
        raise ModelUnavailableError(
            f"Impossible de charger le modele YOLO : {error}"
        ) from error


def get_yolo_model() -> Any:
    global _yolo_model, _yolo_load_attempted, _yolo_load_error
    if _yolo_model is not None:
        return _yolo_model
    if _yolo_load_attempted:
        raise ModelUnavailableError(_yolo_load_error or "Modele YOLO indisponible.")

    _yolo_load_attempted = True
    try:
        _yolo_model = load_yolo_model()
        _yolo_load_error = None
        return _yolo_model
    except ModelUnavailableError as error:
        _yolo_load_error = str(error)
        raise


def load_ocr_engine() -> Any:
    if settings.ocr_engine.lower() != "paddleocr":
        raise OcrUnavailableError(
            f"Moteur OCR non pris en charge : {settings.ocr_engine}."
        )

    try:
        from paddleocr import PaddleOCR
    except ImportError as error:
        raise OcrUnavailableError(
            "PaddleOCR/PaddlePaddle n'est pas installe dans l'environnement Vision."
        ) from error

    try:
        return PaddleOCR(use_angle_cls=False, lang="en", show_log=False)
    except TypeError:
        # PaddleOCR 3.x renamed several constructor options.
        return PaddleOCR(
            lang="en",
            use_doc_orientation_classify=False,
            use_doc_unwarping=False,
            use_textline_orientation=False,
        )
    except Exception as error:
        raise OcrUnavailableError(f"Impossible d'initialiser PaddleOCR : {error}") from error


def get_ocr_engine() -> Any:
    global _ocr_engine, _ocr_load_attempted, _ocr_load_error
    if _ocr_engine is not None:
        return _ocr_engine
    if _ocr_load_attempted:
        raise OcrUnavailableError(_ocr_load_error or "PaddleOCR indisponible.")

    _ocr_load_attempted = True
    try:
        _ocr_engine = load_ocr_engine()
        _ocr_load_error = None
        return _ocr_engine
    except OcrUnavailableError as error:
        _ocr_load_error = str(error)
        raise


def decode_image(image_bytes: bytes) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(image_bytes))
        image.load()
        return ImageOps.exif_transpose(image).convert("RGB")
    except (UnidentifiedImageError, OSError, ValueError) as error:
        raise InvalidImageError("Le fichier fourni n'est pas une image valide.") from error


def _to_list(value: Any) -> list:
    if value is None:
        return []
    if hasattr(value, "cpu"):
        value = value.cpu()
    if hasattr(value, "numpy"):
        value = value.numpy()
    if hasattr(value, "tolist"):
        return value.tolist()
    return list(value)


def detect_container_code_regions(image: Image.Image) -> list[dict]:
    model = get_yolo_model()
    results = model.predict(
        source=image,
        conf=settings.yolo_confidence,
        iou=settings.yolo_iou,
        device=settings.device,
        verbose=False,
    )
    if not results:
        return []

    result = results[0]
    boxes = getattr(result, "boxes", None)
    if boxes is None:
        return []

    names = getattr(result, "names", None) or getattr(model, "names", {}) or {}
    coordinates = _to_list(getattr(boxes, "xyxy", None))
    confidences = _to_list(getattr(boxes, "conf", None))
    classes = _to_list(getattr(boxes, "cls", None))
    detections = []

    for index, coords in enumerate(coordinates):
        class_id = int(classes[index]) if index < len(classes) else 0
        class_name = names.get(class_id, str(class_id)) if isinstance(names, dict) else str(class_id)
        if class_name != EXPECTED_CLASS_NAME:
            continue
        confidence = float(confidences[index]) if index < len(confidences) else 0.0
        x1, y1, x2, y2 = (float(value) for value in coords[:4])
        detections.append(
            {
                "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                "yolo_confidence": confidence,
                "class_id": class_id,
                "class_name": class_name,
            }
        )

    return sorted(detections, key=lambda item: item["yolo_confidence"], reverse=True)


def crop_detected_region(image: Image.Image, bbox: dict) -> Image.Image:
    width, height = image.size
    box_width = max(1.0, bbox["x2"] - bbox["x1"])
    box_height = max(1.0, bbox["y2"] - bbox["y1"])
    margin_x = box_width * settings.crop_margin_percent
    margin_y = box_height * settings.crop_margin_percent
    left = max(0, int(bbox["x1"] - margin_x))
    top = max(0, int(bbox["y1"] - margin_y))
    right = min(width, int(bbox["x2"] + margin_x))
    bottom = min(height, int(bbox["y2"] + margin_y))
    return image.crop((left, top, max(left + 1, right), max(top + 1, bottom)))


def crop_detected_context(image: Image.Image, bbox: dict) -> Image.Image:
    """Return a wider crop when the printed code is split around the detected box."""
    width, height = image.size
    box_width = max(1.0, bbox["x2"] - bbox["x1"])
    box_height = max(1.0, bbox["y2"] - bbox["y1"])
    horizontal_context = box_width * getattr(
        settings, "crop_context_horizontal_factor", 1.25
    )
    vertical_context = box_height * getattr(settings, "crop_context_vertical_factor", 0.75)
    left = max(0, int(bbox["x1"] - horizontal_context))
    top = max(0, int(bbox["y1"] - vertical_context))
    right = min(width, int(bbox["x2"] + horizontal_context))
    bottom = min(height, int(bbox["y2"] + vertical_context))
    return image.crop((left, top, max(left + 1, right), max(top + 1, bottom)))


def generate_ocr_variants(crop: Image.Image, include_rotations: bool = False) -> list[tuple[str, Image.Image]]:
    upscaled = crop.resize((crop.width * 2, crop.height * 2), Image.Resampling.LANCZOS)
    gray = ImageOps.grayscale(upscaled)
    contrast = ImageEnhance.Contrast(gray).enhance(1.6)
    sharpened = contrast.filter(ImageFilter.SHARPEN)
    threshold = contrast.point(lambda pixel: 255 if pixel > 145 else 0)
    variants = [
        ("original", crop),
        ("upscaled", upscaled),
        ("upscaled_gray", gray.convert("RGB")),
        ("contrast", contrast.convert("RGB")),
        ("sharpen", sharpened.convert("RGB")),
        ("threshold", threshold.convert("RGB")),
    ]
    if include_rotations:
        variants.extend(
            [
                ("rotate_90", upscaled.rotate(90, expand=True)),
                ("rotate_minus_90", upscaled.rotate(-90, expand=True)),
            ]
        )
    return variants


def _extract_ocr_pairs(payload: Any) -> list[tuple[str, float]]:
    pairs: list[tuple[str, float]] = []

    def visit(value: Any) -> None:
        if value is None:
            return
        if isinstance(value, dict):
            text = value.get("rec_text") or value.get("text")
            score = value.get("rec_score") or value.get("score")
            if isinstance(text, str):
                pairs.append((text, float(score or 0.0)))
            for key in ("res", "result", "data", "json"):
                if key in value:
                    visit(value[key])
            return
        if hasattr(value, "json"):
            try:
                visit(value.json)
            except Exception:
                pass
        if isinstance(value, (list, tuple)):
            if (
                len(value) == 2
                and isinstance(value[0], str)
                and isinstance(value[1], (int, float))
            ):
                pairs.append((value[0], float(value[1])))
                return
            for item in value:
                visit(item)

    visit(payload)
    return pairs


def _run_ocr(engine: Any, image: Image.Image) -> list[tuple[str, float]]:
    try:
        import numpy as np

        array = np.asarray(image)
        if hasattr(engine, "ocr"):
            return _extract_ocr_pairs(engine.ocr(array, cls=False))
        if hasattr(engine, "predict"):
            return _extract_ocr_pairs(engine.predict(array))
    except Exception:
        raise
    return []


def normalize_ocr_text(text: str | None) -> str:
    return re.sub(r"[^A-Z0-9]", "", (text or "").upper())


def _read_variant(
    engine: Any, image: Image.Image, variant_name: str, detection_index: int
) -> list[OcrReading]:
    pairs = _run_ocr(engine, image)
    readings = [
        OcrReading(text, confidence, variant_name, detection_index)
        for text, confidence in pairs
    ]

    # PaddleOCR can return the owner, serial number, and check digit separately.
    if len(pairs) > 1:
        combined_text = "".join(normalize_ocr_text(text) for text, _ in pairs)
        if combined_text:
            combined_confidence = min(confidence for _, confidence in pairs)
            readings.append(
                OcrReading(
                    combined_text,
                    combined_confidence,
                    f"{variant_name}_combined",
                    detection_index,
                )
            )
    return readings


def recognize_container_code(crop: Image.Image, detection_index: int) -> list[OcrReading]:
    engine = get_ocr_engine()
    readings: list[OcrReading] = []
    for variant_name, variant in generate_ocr_variants(crop):
        readings.extend(_read_variant(engine, variant, variant_name, detection_index))

    if not any(select_best_iso_candidate([reading]) for reading in readings):
        for variant_name, variant in generate_ocr_variants(crop, include_rotations=True)[-2:]:
            readings.extend(_read_variant(engine, variant, variant_name, detection_index))
    return readings


def recognize_region_with_context(
    image: Image.Image, bbox: dict, detection_index: int
) -> list[OcrReading]:
    readings = recognize_container_code(crop_detected_region(image, bbox), detection_index)
    if select_best_iso_candidate(readings):
        return readings

    context_readings = recognize_container_code(
        crop_detected_context(image, bbox), detection_index
    )
    for reading in context_readings:
        reading.variant = f"context_{reading.variant}"
    return readings + context_readings


LETTER_SUBSTITUTIONS = {"0": "O", "1": "I", "5": "S", "8": "B", "2": "Z", "6": "G"}
DIGIT_SUBSTITUTIONS = {"O": "0", "Q": "0", "I": "1", "L": "1", "S": "5", "B": "8", "Z": "2", "G": "6"}


def _position_options(character: str, index: int) -> list[str]:
    expected_letters = index < 4
    if expected_letters:
        options = [character] if character.isalpha() else []
        replacement = LETTER_SUBSTITUTIONS.get(character)
    else:
        options = [character] if character.isdigit() else []
        replacement = DIGIT_SUBSTITUTIONS.get(character)
    if replacement and replacement not in options:
        options.append(replacement)
    return options


def generate_iso_candidates(text: str | None) -> list[tuple[str, int]]:
    normalized = normalize_ocr_text(text)
    windows = [normalized[index : index + 11] for index in range(max(1, len(normalized) - 10))]
    candidates: dict[str, int] = {}
    for window in windows:
        if len(window) != 11:
            continue
        variants = [("", 0)]
        for index, character in enumerate(window):
            options = _position_options(character, index)
            if not options:
                variants = []
                break
            next_variants = []
            for prefix, corrections in variants:
                for option in options:
                    next_variants.append(
                        (prefix + option, corrections + int(option != character))
                    )
            variants = next_variants[:MAX_CANDIDATES]
        for candidate, corrections in variants:
            previous = candidates.get(candidate)
            if previous is None or corrections < previous:
                candidates[candidate] = corrections
    return sorted(candidates.items(), key=lambda item: item[1])[:MAX_CANDIDATES]


def select_best_iso_candidate(readings: list[OcrReading]) -> dict | None:
    ranked = []
    for reading in readings:
        for candidate, corrections in generate_iso_candidates(reading.text):
            validation = validate_container_code(candidate)
            if validation["is_valid"]:
                ranked.append(
                    {
                        "candidate": candidate,
                        "corrections": corrections,
                        "reading": reading,
                        "validation": validation,
                    }
                )
    if not ranked:
        return None
    return max(
        ranked,
        key=lambda item: (
            item["reading"].confidence,
            -item["corrections"],
            item["reading"].yolo_confidence,
        ),
    )


def combine_confidences(yolo_confidence: float | None, ocr_confidence: float | None) -> float:
    yolo = max(0.0, min(1.0, float(yolo_confidence or 0.0)))
    ocr = max(0.0, min(1.0, float(ocr_confidence or 0.0)))
    return round(CONFIDENCE_YOLO_WEIGHT * yolo + CONFIDENCE_OCR_WEIGHT * ocr, 4)


def build_fallback_result(warning: str) -> dict:
    validation = validate_container_code(SIMULATED_DETECTED_ISO)
    return {
        "detected_iso": validation["normalized"],
        "raw_ocr_text": None,
        "confidence": 0.60,
        "yolo_confidence": None,
        "ocr_confidence": None,
        "is_valid_iso": validation["is_valid"],
        "is_valid_format": validation["is_valid_format"],
        "is_valid_check_digit": validation["is_valid_check_digit"],
        "owner_code": validation.get("owner_code"),
        "category": validation.get("category"),
        "serial_number": validation.get("serial_number"),
        "check_digit": validation.get("check_digit"),
        "expected_check_digit": validation.get("expected_check_digit"),
        "detection_mode": "fallback_mock",
        "ocr_variant": None,
        "bbox": None,
        "detections": [],
        "message": "Resultat simule de secours. Aucune detection reelle n'a ete effectuee.",
        "warning": warning,
    }


def _empty_result(mode: str, message: str, **extra: Any) -> dict:
    return {
        "detected_iso": None,
        "raw_ocr_text": None,
        "confidence": 0.0,
        "yolo_confidence": None,
        "ocr_confidence": None,
        "is_valid_iso": False,
        "is_valid_format": False,
        "is_valid_check_digit": False,
        "owner_code": None,
        "category": None,
        "serial_number": None,
        "check_digit": None,
        "expected_check_digit": None,
        "detection_mode": mode,
        "ocr_variant": None,
        "bbox": None,
        "detections": [],
        "message": message,
        "warning": None,
        **extra,
    }


def detect_container(image_bytes: bytes) -> dict:
    image = decode_image(image_bytes)
    try:
        regions = detect_container_code_regions(image)
    except ModelUnavailableError as error:
        if settings.fallback_enabled:
            return build_fallback_result(str(error))
        raise

    if not regions:
        return _empty_result(
            "no_detection",
            "Aucune zone de matricule conteneur detectee. Vous pouvez saisir le matricule manuellement.",
        )

    primary = regions[0]
    if not settings.ocr_enabled:
        detections = [
            {
                **region,
                "raw_ocr_text": None,
                "ocr_confidence": None,
                "candidate_iso": None,
                "is_valid_iso": False,
            }
            for region in regions
        ]
        return _empty_result(
            "ocr_disabled",
            "Zone detectee par YOLO. OCR desactive : saisissez le matricule manuellement.",
            confidence=round(primary["yolo_confidence"], 4),
            yolo_confidence=round(primary["yolo_confidence"], 4),
            bbox=primary["bbox"],
            detections=detections,
        )

    all_readings: list[OcrReading] = []
    ocr_error: str | None = None
    for index, region in enumerate(regions):
        try:
            region_readings = recognize_region_with_context(image, region["bbox"], index)
            for reading in region_readings:
                reading.yolo_confidence = region["yolo_confidence"]
            all_readings.extend(region_readings)
        except Exception as error:
            ocr_error = str(error)

    if not all_readings and ocr_error:
        detections = [
            {
                **region,
                "raw_ocr_text": None,
                "ocr_confidence": None,
                "candidate_iso": None,
                "is_valid_iso": False,
            }
            for region in regions
        ]
        return _empty_result(
            "ocr_error",
            "Zone detectee, mais l'OCR a echoue. Vous pouvez saisir le matricule manuellement.",
            confidence=round(primary["yolo_confidence"], 4),
            yolo_confidence=round(primary["yolo_confidence"], 4),
            bbox=primary["bbox"],
            detections=detections,
            warning=ocr_error,
        )

    best_valid = select_best_iso_candidate(all_readings)
    best_raw = max(all_readings, key=lambda item: item.confidence, default=None)
    detection_payloads = []
    for index, region in enumerate(regions):
        region_readings = [item for item in all_readings if item.detection_index == index]
        region_best = select_best_iso_candidate(region_readings)
        region_raw = max(region_readings, key=lambda item: item.confidence, default=None)
        detection_payloads.append(
            {
                **region,
                "raw_ocr_text": region_raw.text if region_raw else None,
                "ocr_confidence": round(region_raw.confidence, 4) if region_raw else None,
                "candidate_iso": region_best["candidate"] if region_best else None,
                "is_valid_iso": bool(region_best),
            }
        )

    if not best_valid:
        return _empty_result(
            "yolo_no_valid_iso",
            "Zone detectee, mais aucun code ISO 6346 valide n'a ete reconnu. Corrigez le matricule manuellement.",
            raw_ocr_text=best_raw.text if best_raw else None,
            confidence=combine_confidences(
                primary["yolo_confidence"], best_raw.confidence if best_raw else 0.0
            ),
            yolo_confidence=round(primary["yolo_confidence"], 4),
            ocr_confidence=round(best_raw.confidence, 4) if best_raw else None,
            ocr_variant=best_raw.variant if best_raw else None,
            bbox=primary["bbox"],
            detections=detection_payloads,
            warning=ocr_error,
        )

    reading = best_valid["reading"]
    validation = best_valid["validation"]
    selected_region = regions[reading.detection_index]
    return {
        "detected_iso": best_valid["candidate"],
        "raw_ocr_text": reading.text,
        "confidence": combine_confidences(selected_region["yolo_confidence"], reading.confidence),
        "yolo_confidence": round(selected_region["yolo_confidence"], 4),
        "ocr_confidence": round(reading.confidence, 4),
        "is_valid_iso": True,
        "is_valid_format": validation["is_valid_format"],
        "is_valid_check_digit": validation["is_valid_check_digit"],
        "owner_code": validation.get("owner_code"),
        "category": validation.get("category"),
        "serial_number": validation.get("serial_number"),
        "check_digit": validation.get("check_digit"),
        "expected_check_digit": validation.get("expected_check_digit"),
        "detection_mode": "yolo_paddleocr",
        "ocr_variant": reading.variant,
        "bbox": selected_region["bbox"],
        "detections": detection_payloads,
        "message": "Code conteneur detecte et valide.",
        "warning": ocr_error,
    }


def detect_container_from_image(image_content: bytes, content_type: str | None = None) -> dict:
    """Backward-compatible entry point used by the FastAPI controller."""
    return detect_container(image_content)


def get_runtime_status() -> dict:
    yolo_available = importlib.util.find_spec("ultralytics") is not None
    ocr_available = importlib.util.find_spec("paddleocr") is not None
    return {
        "model_path": settings.public_model_path,
        "model_exists": settings.model_path.exists(),
        "yolo_available": yolo_available,
        "model_loaded": _yolo_model is not None,
        "model_error": _yolo_load_error or (None if yolo_available else "ultralytics non installe"),
        "ocr_enabled": settings.ocr_enabled,
        "ocr_available": ocr_available,
        "ocr_loaded": _ocr_engine is not None,
        "ocr_engine": settings.ocr_engine,
        "ocr_error": _ocr_load_error or (None if ocr_available else "paddleocr non installe"),
        "device": settings.device,
        "fallback_enabled": settings.fallback_enabled,
    }
