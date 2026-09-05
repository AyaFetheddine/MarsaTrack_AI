import io
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image

from app.services import detection_service as service
from app.utils.iso6346 import calculate_check_digit, validate_container_code


def make_image_bytes(width: int = 160, height: int = 80) -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (width, height), "white").save(output, format="PNG")
    return output.getvalue()


def fake_settings(tmp_path, **overrides):
    values = {
        "model_path": tmp_path / "model.pt",
        "public_model_path": "models/model.pt",
        "public_path_of": lambda path: "models/model.pt",
        "active_model_version": "v2",
        "model_fallback_to_v1": True,
        "v1_model_path": tmp_path / "v1.pt",
        "v2_model_path": tmp_path / "v2.pt",
        "device": "cpu",
        "yolo_confidence": 0.25,
        "yolo_iou": 0.45,
        "crop_margin_percent": 0.04,
        "crop_context_horizontal_factor": 1.25,
        "crop_context_vertical_factor": 0.75,
        "ocr_enabled": True,
        "ocr_engine": "paddleocr",
        "fallback_enabled": True,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


class FakeBoxes:
    def __init__(self, boxes):
        self.xyxy = [item[0] for item in boxes]
        self.conf = [item[1] for item in boxes]
        self.cls = [item[2] for item in boxes]


class FakeResult:
    names = {0: "container_code", 1: "unexpected"}

    def __init__(self, boxes):
        self.boxes = FakeBoxes(boxes)


class FakeModel:
    names = FakeResult.names

    def __init__(self, boxes):
        self.boxes = boxes
        self.calls = 0

    def predict(self, **_kwargs):
        self.calls += 1
        return [FakeResult(self.boxes)]


class FakeResultV2:
    names = {0: "container-number", 1: "iso-type"}

    def __init__(self, boxes):
        self.boxes = FakeBoxes(boxes)


class FakeModelV2:
    names = FakeResultV2.names

    def __init__(self, boxes):
        self.boxes = boxes

    def predict(self, **_kwargs):
        return [FakeResultV2(self.boxes)]


def container_detection(confidence=0.9, class_name="container-number"):
    return {
        "bbox": {"x1": 1, "y1": 2, "x2": 100, "y2": 40},
        "yolo_confidence": confidence,
        "class_id": 0,
        "class_name": class_name,
        "kind": "container_number",
    }


def iso_type_detection(confidence=0.9):
    return {
        "bbox": {"x1": 120, "y1": 5, "x2": 150, "y2": 30},
        "yolo_confidence": confidence,
        "class_id": 1,
        "class_name": "iso-type",
        "kind": "iso_type",
    }


@pytest.fixture(autouse=True)
def reset_state():
    service.reset_runtime_state()
    yield
    service.reset_runtime_state()


# ─── Chargement du modele ────────────────────────────────────────────────────
def test_model_loaded_once(monkeypatch):
    model = object()
    calls = {"count": 0}

    def loader(path=None):
        calls["count"] += 1
        return model

    monkeypatch.setattr(service, "load_yolo_model", loader)
    assert service.get_yolo_model() is model
    assert service.get_yolo_model() is model
    assert calls["count"] == 1


def test_model_absent(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", fake_settings(tmp_path))
    with pytest.raises(service.ModelUnavailableError, match="introuvable"):
        service.load_yolo_model()


def test_v2_classes_detected_and_split(monkeypatch):
    model = FakeModelV2(
        [
            ([10, 5, 120, 50], 0.88, 0),  # container-number
            ([130, 10, 155, 32], 0.77, 1),  # iso-type
        ]
    )
    monkeypatch.setattr(service, "get_yolo_model", lambda: model)
    image = Image.new("RGB", (200, 80))
    numbers = service.detect_container_code_regions(image)
    types = service.detect_iso_type_regions(image)
    assert len(numbers) == 1 and numbers[0]["kind"] == "container_number"
    assert len(types) == 1 and types[0]["kind"] == "iso_type"


def test_model_classes_validation_flags_wrong_classes():
    assert service._validate_model_classes("v2", ["foo", "bar"]) is not None
    assert service._validate_model_classes("v2", ["container-number", "iso-type"]) is None
    assert service._validate_model_classes("v1", ["container_code"]) is None
    assert service._validate_model_classes("v2", []) is None  # modele factice


def test_fallback_to_v1_when_v2_missing(monkeypatch, tmp_path):
    v1 = tmp_path / "v1.pt"
    v1.write_bytes(b"x")
    monkeypatch.setattr(
        service,
        "settings",
        fake_settings(
            tmp_path,
            model_path=tmp_path / "v2.pt",  # absent
            active_model_version="v2",
            v1_model_path=v1,
            model_fallback_to_v1=True,
        ),
    )

    def loader(path=None):
        target = Path(path) if path is not None else service.settings.model_path
        if not target.exists():
            raise service.ModelUnavailableError("introuvable")
        return SimpleNamespace(names={0: "container_code"})

    monkeypatch.setattr(service, "load_yolo_model", loader)
    model = service.get_yolo_model()
    assert model is not None
    assert service._active_model_version == "v1"
    assert service._fallback_in_use is True


def test_no_fallback_when_disabled(monkeypatch, tmp_path):
    monkeypatch.setattr(
        service,
        "settings",
        fake_settings(
            tmp_path,
            model_path=tmp_path / "v2.pt",
            active_model_version="v2",
            model_fallback_to_v1=False,
        ),
    )

    def loader(path=None):
        raise service.ModelUnavailableError("introuvable")

    monkeypatch.setattr(service, "load_yolo_model", loader)
    with pytest.raises(service.ModelUnavailableError):
        service.get_yolo_model()


# ─── Fallback mock / detection vide ──────────────────────────────────────────
def test_fallback_enabled(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", fake_settings(tmp_path, fallback_enabled=True))
    monkeypatch.setattr(
        service,
        "run_yolo_detections",
        lambda _image: (_ for _ in ()).throw(service.ModelUnavailableError("absent")),
    )
    result = service.detect_container(make_image_bytes())
    assert result["detection_mode"] == "fallback_mock"
    assert result["warning"] == "absent"
    assert result["iso_type"] is None


def test_fallback_disabled(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", fake_settings(tmp_path, fallback_enabled=False))
    monkeypatch.setattr(
        service,
        "run_yolo_detections",
        lambda _image: (_ for _ in ()).throw(service.ModelUnavailableError("absent")),
    )
    with pytest.raises(service.ModelUnavailableError):
        service.detect_container(make_image_bytes())


def test_one_yolo_detection(monkeypatch):
    model = FakeModel([([10, 5, 120, 50], 0.91, 0)])
    monkeypatch.setattr(service, "get_yolo_model", lambda: model)
    detections = service.detect_container_code_regions(Image.new("RGB", (160, 80)))
    assert len(detections) == 1
    assert detections[0]["class_name"] == "container_code"


def test_multiple_yolo_detections_sorted(monkeypatch):
    model = FakeModel(
        [([10, 5, 80, 30], 0.55, 0), ([20, 20, 150, 70], 0.93, 0), ([0, 0, 5, 5], 0.99, 1)]
    )
    monkeypatch.setattr(service, "get_yolo_model", lambda: model)
    detections = service.detect_container_code_regions(Image.new("RGB", (160, 80)))
    assert [item["yolo_confidence"] for item in detections] == [0.93, 0.55]


def test_no_detection(monkeypatch):
    monkeypatch.setattr(service, "run_yolo_detections", lambda _image: [])
    result = service.detect_container(make_image_bytes())
    assert result["detection_mode"] == "no_detection"
    assert result["detections"] == []
    assert result["detected_iso"] is None
    assert result["iso_type"] is None


# ─── OCR matricule ISO 6346 ──────────────────────────────────────────────────
def reading(text, confidence=0.9):
    return service.OcrReading(text, confidence, "upscaled_gray", 0, 0.9)


@pytest.mark.parametrize(
    "raw_text",
    ["MRKU6234191", "MRKU 623419 1", "MRKU\n623419\n1"],
)
def test_ocr_valid_with_separators(raw_text):
    best = service.select_best_iso_candidate([reading(raw_text)])
    assert best["candidate"] == "MRKU6234191"


def test_ocr_confusion_o_zero():
    base = "MSCU023456"
    raw = f"MSCUO23456{calculate_check_digit(base)}"
    assert service.select_best_iso_candidate([reading(raw)])["candidate"] == base + calculate_check_digit(base)


def test_ocr_confusion_i_one():
    base = "MSCU123456"
    raw = f"MSCUI23456{calculate_check_digit(base)}"
    assert service.select_best_iso_candidate([reading(raw)])["candidate"] == base + calculate_check_digit(base)


def test_ocr_confusion_s_five():
    base = "MSCU123456"
    raw = f"MSCU1234S6{calculate_check_digit(base)}"
    assert service.select_best_iso_candidate([reading(raw)])["candidate"] == base + calculate_check_digit(base)


def test_ocr_invalid_text():
    assert service.select_best_iso_candidate([reading("HELLO PORT")]) is None


def test_combined_ocr_fragments_form_a_valid_iso(monkeypatch):
    monkeypatch.setattr(
        service,
        "_run_ocr",
        lambda *_: [("BBCU", 0.99), ("217241", 0.99), ("8", 0.99)],
    )
    monkeypatch.setattr(service, "get_ocr_engine", lambda: object())
    readings = service.recognize_container_code(Image.new("RGB", (160, 80)), 0)
    assert service.select_best_iso_candidate(readings)["candidate"] == "BBCU2172418"


def test_context_crop_expands_beyond_detected_box(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", fake_settings(tmp_path))
    image = Image.new("RGB", (400, 200))
    crop = service.crop_detected_context(
        image, {"x1": 160, "y1": 70, "x2": 240, "y2": 130}
    )
    assert crop.width > 80
    assert crop.height > 60


def test_wrong_check_digit_is_not_valid():
    result = validate_container_code("MRKU6234192")
    assert result["is_valid"] is False
    assert service.select_best_iso_candidate([reading("MRKU6234192")]) is None


def test_invalid_image():
    with pytest.raises(service.InvalidImageError):
        service.decode_image(b"not an image")


# ─── OCR code taille/type (iso-type) ─────────────────────────────────────────
def test_iso_type_candidate_valid():
    best = service.select_best_iso_type_candidate([reading("22G1", 0.9)])
    assert best["candidate"] == "22G1"


def test_iso_type_candidate_with_separators():
    best = service.select_best_iso_type_candidate([reading("22 G1", 0.9)])
    assert best["candidate"] == "22G1"


def test_iso_type_candidate_position_correction():
    # OCR lit un 6 (chiffre) la ou un G (lettre) est attendu en position 2.
    best = service.select_best_iso_type_candidate([reading("2261", 0.9)])
    assert best is not None
    assert best["candidate"][2] == "G"


def test_iso_type_candidate_invalid_text():
    assert service.select_best_iso_type_candidate([reading("PORT", 0.9)]) is None


# ─── Cas partiels V2 (integration detect_container) ──────────────────────────
def _valid_container_reading(*_args, **_kwargs):
    return [service.OcrReading("MRKU 623419 1", 0.88, "upscaled_gray", 0, 0.95)]


def test_case_a_matricule_and_type(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", fake_settings(tmp_path))
    monkeypatch.setattr(
        service,
        "run_yolo_detections",
        lambda _image: [container_detection(0.95), iso_type_detection(0.9)],
    )
    monkeypatch.setattr(service, "recognize_region_with_context", _valid_container_reading)
    monkeypatch.setattr(service, "recognize_iso_type", lambda *_a, **_k: [reading("22G1", 0.84)])
    result = service.detect_container(make_image_bytes())
    assert result["is_valid_iso"] is True
    assert result["detected_iso"] == "MRKU6234191"
    assert result["iso_type"] == "22G1"
    assert result["is_valid_iso_type_format"] is True
    assert result["iso_type_details"]["type_group"] == "G"


def test_case_b_matricule_without_type(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", fake_settings(tmp_path))
    monkeypatch.setattr(
        service, "run_yolo_detections", lambda _image: [container_detection(0.95)]
    )
    monkeypatch.setattr(service, "recognize_region_with_context", _valid_container_reading)
    result = service.detect_container(make_image_bytes())
    assert result["is_valid_iso"] is True
    assert result["iso_type"] is None
    assert result["is_valid_iso_type_format"] is False


def test_case_c_type_without_valid_matricule(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", fake_settings(tmp_path))
    monkeypatch.setattr(
        service,
        "run_yolo_detections",
        lambda _image: [container_detection(0.9), iso_type_detection(0.9)],
    )
    monkeypatch.setattr(
        service,
        "recognize_region_with_context",
        lambda *_a, **_k: [service.OcrReading("HELLO PORT", 0.5, "contrast", 0, 0.9)],
    )
    monkeypatch.setattr(service, "recognize_iso_type", lambda *_a, **_k: [reading("45R1", 0.9)])
    result = service.detect_container(make_image_bytes())
    assert result["is_valid_iso"] is False
    assert result["detection_mode"] == "yolo_no_valid_iso"
    assert result["iso_type"] == "45R1"


def test_case_multiple_iso_types_keeps_best(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", fake_settings(tmp_path))
    monkeypatch.setattr(
        service,
        "run_yolo_detections",
        lambda _image: [
            container_detection(0.95),
            iso_type_detection(0.6),
            iso_type_detection(0.9),
        ],
    )
    monkeypatch.setattr(service, "recognize_region_with_context", _valid_container_reading)
    monkeypatch.setattr(service, "recognize_iso_type", lambda *_a, **_k: [reading("22G1", 0.8)])
    result = service.detect_container(make_image_bytes())
    assert result["iso_type"] == "22G1"
    assert len(result["iso_type_detections"]) == 2


def test_ocr_disabled_preserves_yolo(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", fake_settings(tmp_path, ocr_enabled=False))
    monkeypatch.setattr(
        service,
        "run_yolo_detections",
        lambda _image: [container_detection(0.88)],
    )
    result = service.detect_container(make_image_bytes())
    assert result["detection_mode"] == "ocr_disabled"
    assert result["bbox"] is not None
    assert result["detected_iso"] is None


def test_ocr_error_preserves_yolo(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", fake_settings(tmp_path))
    monkeypatch.setattr(
        service,
        "run_yolo_detections",
        lambda _image: [container_detection(0.88)],
    )
    monkeypatch.setattr(
        service,
        "recognize_container_code",
        lambda *_: (_ for _ in ()).throw(RuntimeError("OCR panne")),
    )
    result = service.detect_container(make_image_bytes())
    assert result["detection_mode"] == "ocr_error"
    assert result["bbox"] is not None
    assert "OCR panne" in result["warning"]


def test_yolo_valid_ocr_result(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", fake_settings(tmp_path))
    monkeypatch.setattr(
        service,
        "run_yolo_detections",
        lambda _image: [container_detection(0.95)],
    )
    monkeypatch.setattr(service, "recognize_container_code", lambda *_: [reading("MRKU 623419 1", 0.88)])
    result = service.detect_container(make_image_bytes())
    assert result["detection_mode"] == "yolo_paddleocr"
    assert result["confidence"] == pytest.approx(0.9115)
    assert result["is_valid_iso"] is True


def test_success_mode_is_v2_when_active(monkeypatch):
    monkeypatch.setattr(service, "_active_model_version", "v2")
    assert service._success_mode() == "yolo_v2_paddleocr"
    monkeypatch.setattr(service, "_active_model_version", "v1")
    assert service._success_mode() == "yolo_paddleocr"


# ─── Lecture verticale : orientation, marges, variantes, reconstruction ──────
def vertical_settings(tmp_path, **overrides):
    values = {
        "vertical_ratio_threshold": 1.6,
        "vertical_crop_margin_x_percent": 0.30,
        "vertical_crop_margin_y_percent": 0.02,
        "context_crop_margin_percent": 0.60,
        "min_crop_side_px": 160,
        "max_upscale_factor": 8,
        "max_ocr_variants": 14,
        "debug_save_crops": False,
    }
    values.update(overrides)
    return fake_settings(tmp_path, **values)


def vertical_bbox():
    """Boite reelle relevee sur le Cas vertical A (ratio hauteur/largeur 7,95)."""
    return {"x1": 352, "y1": 51, "x2": 383, "y2": 297}


def horizontal_bbox():
    return {"x1": 20, "y1": 10, "x2": 220, "y2": 50}


def test_bbox_orientation_detects_the_vertical_column(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", vertical_settings(tmp_path))
    assert service.bbox_orientation(vertical_bbox()) == "vertical"
    assert service.bbox_orientation(horizontal_bbox()) == "horizontal"


def test_vertical_crop_widens_in_x_not_in_y(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", vertical_settings(tmp_path))
    image = Image.new("RGB", (736, 426))
    bbox = vertical_bbox()
    base = service.crop_detected_region(image, bbox)
    vertical = service.crop_oriented_region(image, bbox, "vertical")
    assert vertical.width > base.width
    # la hauteur reste serree : on n'absorbe pas les marquages voisins
    assert vertical.height <= base.height


def test_horizontal_crop_is_unchanged(monkeypatch, tmp_path):
    """Non-regression : le cas horizontal garde exactement la marge d'origine."""
    monkeypatch.setattr(service, "settings", vertical_settings(tmp_path))
    image = Image.new("RGB", (400, 200))
    bbox = horizontal_bbox()
    assert service.crop_oriented_region(image, bbox, "horizontal").size == (
        service.crop_detected_region(image, bbox).size
    )


def test_crop_coordinates_are_clamped_to_the_image(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", vertical_settings(tmp_path))
    image = Image.new("RGB", (60, 60))
    crop = service.crop_with_margins(image, {"x1": 2, "y1": 2, "x2": 58, "y2": 58}, 3.0, 3.0)
    assert crop.size == (60, 60)


def test_vertical_context_crop_is_wider_than_the_region(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", vertical_settings(tmp_path))
    image = Image.new("RGB", (736, 426))
    bbox = vertical_bbox()
    region = service.crop_oriented_region(image, bbox, "vertical")
    context = service.crop_oriented_context(image, bbox, "vertical")
    assert context.width > region.width


def test_upscale_targets_a_minimum_side(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", vertical_settings(tmp_path))
    # colonne reelle du Cas A : 17 px de large -> inexploitable sans agrandissement
    narrow = service.upscale_for_ocr(Image.new("RGB", (17, 86)))
    assert min(narrow.size) >= 100
    # un crop deja confortable n'est pas agrandi au dela du plafond
    wide = service.upscale_for_ocr(Image.new("RGB", (400, 120)))
    assert wide.size == (800, 240)


def test_vertical_variants_include_all_rotations(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", vertical_settings(tmp_path))
    names = [name for name, _ in service.generate_vertical_ocr_variants(Image.new("RGB", (20, 90)))]
    assert "rotate_90" in names
    assert "rotate_minus_90" in names
    assert "rotate_180" in names
    # la premiere variante est la moins chere : strategie progressive
    assert names[0] == "upscaled"


def test_max_ocr_variants_is_enforced(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", vertical_settings(tmp_path, max_ocr_variants=3))
    variants = service.generate_vertical_ocr_variants(Image.new("RGB", (20, 90)))
    assert len(variants) == 3


def test_iso_type_tries_rotations_when_vertical(monkeypatch, tmp_path):
    """Regression du Cas A : aucune rotation n'etait tentee sur l'iso-type."""
    monkeypatch.setattr(service, "settings", vertical_settings(tmp_path))
    monkeypatch.setattr(service, "get_ocr_engine", lambda: object())
    seen = []

    def fake_read(_engine, _image, variant_name, _index, _orientation=service.HORIZONTAL):
        seen.append(variant_name)
        return []

    monkeypatch.setattr(service, "_read_variant", fake_read)
    service.recognize_iso_type(Image.new("RGB", (17, 86)), 0, "vertical")
    assert any("rotate" in name for name in seen)


def test_vertical_reading_stops_as_soon_as_the_code_is_valid(monkeypatch, tmp_path):
    """Strategie progressive : on n'essaie pas toutes les variantes pour rien."""
    monkeypatch.setattr(service, "settings", vertical_settings(tmp_path))
    monkeypatch.setattr(service, "get_ocr_engine", lambda: object())
    calls = {"count": 0}

    def fake_read(_engine, _image, variant_name, index, orientation=service.HORIZONTAL):
        calls["count"] += 1
        return [service.OcrReading("MRKU6234191", 0.9, variant_name, index, 0.9)]

    monkeypatch.setattr(service, "_read_variant", fake_read)
    service.recognize_container_code(Image.new("RGB", (20, 90)), 0, "vertical")
    assert calls["count"] == 1


def test_fragments_are_reassembled_by_geometry_not_by_ocr_order(monkeypatch, tmp_path):
    """Le matricule est reconstruit de haut en bas, pas dans l'ordre de retour."""
    monkeypatch.setattr(service, "settings", vertical_settings(tmp_path))
    # Fragments donnes dans le desordre : la geometrie (Y) doit primer.
    payload = [
        [[[10, 120], [30, 120], [30, 140], [10, 140]], ("19", 0.81)],
        [[[10, 0], [30, 0], [30, 20], [10, 20]], ("MRKU", 0.92)],
        [[[10, 60], [30, 60], [30, 80], [10, 80]], ("6234", 0.88)],
        [[[10, 180], [30, 180], [30, 200], [10, 200]], ("1", 0.79)],
    ]
    monkeypatch.setattr(service, "_invoke_ocr", lambda *_: [payload])
    readings = service._read_variant(object(), Image.new("RGB", (40, 220)), "upscaled", 0, "vertical")
    texts = {reading.text for reading in readings}
    # ordre correct de haut en bas
    assert "MRKU6234191" in texts
    # l'ordre de retour de l'OCR ("19" en tete) ne doit produire aucun candidat
    assert "19MRKU62341" not in texts


def test_two_columns_are_not_mixed(monkeypatch, tmp_path):
    """Colonne longue = matricule, colonne courte = taille/type."""
    monkeypatch.setattr(service, "settings", vertical_settings(tmp_path))
    payload = []
    for index, character in enumerate("MRKU6234191"):
        top = index * 20
        payload.append([[[10, top], [26, top], [26, top + 16], [10, top + 16]], (character, 0.9)])
    for index, character in enumerate("22G1"):
        top = index * 20
        payload.append([[[80, top], [96, top], [96, top + 16], [80, top + 16]], (character, 0.85)])

    monkeypatch.setattr(service, "_invoke_ocr", lambda *_: [payload])
    readings = service._read_variant(object(), Image.new("RGB", (120, 240)), "upscaled", 0, "vertical")
    texts = {reading.text for reading in readings}
    assert "MRKU6234191" in texts
    assert "22G1" in texts


def test_lowercase_watermark_is_excluded_from_a_clean_reconstruction(monkeypatch, tmp_path):
    """Le filigrane 'alamy' du Cas A ne doit pas polluer le matricule."""
    monkeypatch.setattr(service, "settings", vertical_settings(tmp_path))
    payload = [
        [[[10, 0], [30, 0], [30, 20], [10, 20]], ("MRKU", 0.92)],
        [[[10, 40], [30, 40], [30, 60], [10, 60]], ("alamy", 0.88)],
        [[[10, 80], [30, 80], [30, 100], [10, 100]], ("623419", 0.9)],
        [[[10, 120], [30, 120], [30, 140], [10, 140]], ("1", 0.86)],
    ]
    monkeypatch.setattr(service, "_invoke_ocr", lambda *_: [payload])
    readings = service._read_variant(object(), Image.new("RGB", (40, 160)), "upscaled", 0, "vertical")
    assert service.select_best_iso_candidate(readings)["candidate"] == "MRKU6234191"


def test_engine_without_geometry_falls_back_to_blind_concatenation(monkeypatch):
    """Compatibilite : un moteur sans boites continue de fonctionner."""
    monkeypatch.setattr(service, "_run_ocr", lambda *_: [("BBCU", 0.99), ("2172418", 0.98)])
    fragments = service._ocr_fragments(object(), Image.new("RGB", (10, 10)))
    assert [f.text for f in fragments] == ["BBCU", "2172418"]
    assert all(f.has_geometry is False for f in fragments)


def test_paddleocr_v3_payload_is_understood():
    payload = {
        "rec_texts": ["22G1"],
        "rec_scores": [0.93],
        "rec_polys": [[[0, 0], [40, 0], [40, 18], [0, 18]]],
    }
    fragments = service._extract_ocr_fragments(payload)
    assert len(fragments) == 1
    assert fragments[0].text == "22G1"
    assert fragments[0].has_geometry is True


def test_unknown_payload_is_tolerated():
    assert service._extract_ocr_fragments({"inattendu": 1}) == []
    assert service._extract_ocr_fragments(None) == []


# ─── Scoring des candidats ───────────────────────────────────────────────────
def test_short_reading_is_heavily_penalised():
    """Cas A : '412' lu a 95 % ne doit pas s'afficher comme fiable."""
    penalised = service.reading_reliability(0.95, "412", service.ISO_EXPECTED_LENGTH)
    assert penalised < 0.55
    full = service.reading_reliability(0.95, "MRKU6234191", service.ISO_EXPECTED_LENGTH)
    assert full == 0.95


def test_single_character_at_98_percent_is_almost_worthless():
    assert service.reading_reliability(0.98, "a", service.ISO_EXPECTED_LENGTH) < 0.40


def test_coverage_is_capped_at_one():
    assert service.reading_coverage("MRKU6234191XXXX", service.ISO_EXPECTED_LENGTH) == 1.0
    assert service.reading_coverage("", service.ISO_EXPECTED_LENGTH) == 0.0


def test_complete_reading_beats_a_more_confident_partial_one():
    """La validation ISO prime sur une confiance OCR elevee."""
    partial = service.OcrReading("MRKU6234191", 0.55, "upscaled_column1", 0, 0.9)
    best = service.select_best_iso_candidate([partial, reading("HELLO", 0.99)])
    assert best["candidate"] == "MRKU6234191"


def test_fewer_corrections_wins_at_equal_confidence():
    clean = service.OcrReading("MSCU1234561", 0.9, "a", 0, 0.9)
    validation = validate_container_code("MSCU1234561")
    if not validation["is_valid"]:  # garde-fou : on construit un code valide
        base = "MSCU123456"
        clean = service.OcrReading(base + calculate_check_digit(base), 0.9, "a", 0, 0.9)
    best = service.select_best_iso_candidate([clean])
    assert best["corrections"] == 0


def test_unreliable_iso_does_not_stop_the_progressive_search():
    partial = service.OcrReading("MRKU623419", 0.9, "upscaled", 0, 0.9)
    assert service._has_reliable_iso([partial]) is False


def test_known_type_group_beats_a_structurally_valid_unknown_one():
    """Cas A : l'OCR lit '42O1', le code reel est '42G1'."""
    best = service.select_best_iso_type_candidate([reading("42O1", 0.7)])
    assert best["candidate"] == "42G1"


def test_g_read_as_2_is_recovered():
    """Conteneur reel Test_V : '22G1' lu '2221' (G bombe lu comme 2)."""
    best = service.select_best_iso_type_candidate([reading("2221", 0.63)])
    assert best["candidate"] == "22G1"


def test_early_stop_waits_for_a_known_type_group(monkeypatch, tmp_path):
    """La recherche ne s'arrete pas sur un groupe inconnu (ex: Z)."""
    monkeypatch.setattr(service, "settings", vertical_settings(tmp_path))
    monkeypatch.setattr(service, "get_ocr_engine", lambda: object())
    variants_seen = []

    # 1re variante -> "2Z1..." (groupe Z inconnu) ; 2e -> "22G1" (connu).
    scripted = iter([[("22Z9", 0.6)], [("22G1", 0.9)]])

    def fake_read(_engine, _image, variant_name, index, orientation=service.HORIZONTAL):
        variants_seen.append(variant_name)
        try:
            pairs = next(scripted)
        except StopIteration:
            return []
        return [service.OcrReading(t, c, variant_name, index, 0.9) for t, c in pairs]

    monkeypatch.setattr(service, "_read_variant", fake_read)
    readings = service.recognize_iso_type(Image.new("RGB", (20, 90)), 0, "vertical")
    best = service.select_best_iso_type_candidate(readings)
    assert best["candidate"] == "22G1"
    # la 2e variante a bien ete essayee (pas d'arret premature sur le groupe Z)
    assert len(variants_seen) >= 2


def test_best_raw_prefers_the_most_complete_reading(monkeypatch, tmp_path):
    """Test_V : afficher 'TE203108252' (complet) plutot que '31005' (fragment)."""
    monkeypatch.setattr(service, "settings", vertical_settings(tmp_path))
    monkeypatch.setattr(
        service, "run_yolo_detections", lambda _image: [container_detection(0.82)]
    )
    monkeypatch.setattr(
        service,
        "recognize_region_with_context",
        lambda *_a, **_k: [
            service.OcrReading("31005", 0.75, "sharpen_rotate_90", 0, 0.82),
            service.OcrReading("TE203108252", 0.72, "upscaled", 0, 0.82),
        ],
    )
    result = service.detect_container(make_image_bytes())
    assert result["detection_mode"] == "yolo_no_valid_iso"
    assert result["raw_ocr_text"] == "TE203108252"


def test_large_crop_is_not_upscaled(monkeypatch, tmp_path):
    """Perf : une colonne deja haute n'est pas agrandie (evite les images geantes)."""
    monkeypatch.setattr(
        service, "settings", vertical_settings(tmp_path, min_crop_side_px=160, max_crop_side_px=1100)
    )
    # crop reel Test_V : 130 x 712 -> x2 donnerait 1424 (> plafond) donc inchange
    tall = Image.new("RGB", (130, 712))
    assert service.upscale_for_ocr(tall).size == (130, 712)
    # un petit crop reste agrandi
    tiny = Image.new("RGB", (17, 86))
    assert min(service.upscale_for_ocr(tiny).size) > 17


def test_secondary_matricule_region_is_skipped_once_valid(monkeypatch, tmp_path):
    """Perf : on ne deroule pas le pipeline sur une 2e zone si la 1re valide."""
    monkeypatch.setattr(service, "settings", vertical_settings(tmp_path))
    monkeypatch.setattr(
        service,
        "run_yolo_detections",
        lambda _image: [container_detection(0.95), container_detection(0.6)],
    )
    calls = {"count": 0}

    def fake_region(_image, _bbox, index):
        calls["count"] += 1
        return [service.OcrReading("MRKU 623419 1", 0.9, "upscaled", index, 0.9)]

    monkeypatch.setattr(service, "recognize_region_with_context", fake_region)
    result = service.detect_container(make_image_bytes())
    assert result["is_valid_iso"] is True
    # la 2e zone n'a pas ete lue
    assert calls["count"] == 1


def test_context_pass_skipped_when_reading_is_complete(monkeypatch, tmp_path):
    """Perf : pas de passe contextuelle si une lecture couvre deja tout."""
    monkeypatch.setattr(service, "settings", vertical_settings(tmp_path))
    monkeypatch.setattr(service, "get_ocr_engine", lambda: object())
    crops_read = []

    def fake_recognize(crop, index, orientation=service.UNCERTAIN):
        crops_read.append(crop.size)
        # lecture complete (11 caracteres) mais invalide -> ne validera pas
        return [service.OcrReading("TE203108252", 0.72, "upscaled", index, 0.82)]

    monkeypatch.setattr(service, "recognize_container_code", fake_recognize)
    service.recognize_region_with_context(
        Image.new("RGB", (736, 426)), vertical_bbox(), 0
    )
    # une seule passe (region), pas de passe contextuelle supplementaire
    assert len(crops_read) == 1


def test_iso_type_reading_is_penalised_when_too_short():
    assert service.reading_reliability(0.98, "a", service.ISO_TYPE_EXPECTED_LENGTH) < 0.60


# ─── Messages metier ─────────────────────────────────────────────────────────
def test_message_when_only_the_type_is_recognised():
    message = service._business_message(
        {"is_valid_iso": False, "is_valid_iso_type_format": True, "detection_mode": "yolo_no_valid_iso"}
    )
    assert "taille/type a ete reconnu" in message
    assert "matricule doit etre verifie" in message


def test_message_when_only_the_matricule_is_recognised():
    message = service._business_message(
        {"is_valid_iso": True, "is_valid_iso_type_format": False, "detection_mode": "yolo_v2_paddleocr"}
    )
    assert "matricule a ete valide" in message
    assert "renseigne manuellement" in message


def test_message_when_nothing_is_reliable():
    message = service._business_message(
        {"is_valid_iso": False, "is_valid_iso_type_format": False, "detection_mode": "yolo_no_valid_iso"}
    )
    assert "fiabilite" in message


def test_no_technical_name_leaks_into_user_messages(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", vertical_settings(tmp_path))
    monkeypatch.setattr(
        service, "run_yolo_detections", lambda _image: [container_detection(0.95)]
    )
    monkeypatch.setattr(service, "recognize_region_with_context", _valid_container_reading)
    result = service.detect_container(make_image_bytes())
    for field in ("message", "warning"):
        value = result.get(field) or ""
        assert "YOLO" not in value
        assert "Paddle" not in value.replace("PaddleOCR", "Paddle")


# ─── Association spatiale au niveau du pipeline ──────────────────────────────
def test_far_away_iso_type_is_not_selected(monkeypatch, tmp_path):
    """Le type d'un autre conteneur ne prend pas la place du bon."""
    monkeypatch.setattr(service, "settings", vertical_settings(tmp_path))
    close = {
        "bbox": {"x1": 110, "y1": 5, "x2": 140, "y2": 30},
        "yolo_confidence": 0.55,
        "class_id": 1,
        "class_name": "iso-type",
        "kind": "iso_type",
    }
    far = {
        "bbox": {"x1": 4000, "y1": 3000, "x2": 4030, "y2": 3025},
        "yolo_confidence": 0.95,
        "class_id": 1,
        "class_name": "iso-type",
        "kind": "iso_type",
    }
    monkeypatch.setattr(
        service, "run_yolo_detections", lambda _image: [container_detection(0.95), far, close]
    )
    monkeypatch.setattr(service, "recognize_region_with_context", _valid_container_reading)
    monkeypatch.setattr(service, "recognize_iso_type", lambda *_a, **_k: [reading("22G1", 0.8)])
    result = service.detect_container(make_image_bytes())
    assert result["iso_type_bbox"] == close["bbox"]
    # toutes les detections restent tracees, aucune n'est supprimee
    assert len(result["iso_type_detections"]) == 2


def test_debug_mode_is_inactive_by_default(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", vertical_settings(tmp_path))
    monkeypatch.setattr(service, "run_yolo_detections", lambda _image: [])
    service.detect_container(make_image_bytes())
    assert not (tmp_path / "debug").exists()


def test_api_result_never_exposes_a_local_path(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", vertical_settings(tmp_path))
    monkeypatch.setattr(
        service, "run_yolo_detections", lambda _image: [container_detection(0.95)]
    )
    monkeypatch.setattr(service, "recognize_region_with_context", _valid_container_reading)
    serialized = repr(service.detect_container(make_image_bytes()))
    assert "C:\\" not in serialized
    assert str(tmp_path) not in serialized


# ─── Secours matricule vertical : segmentation + reflow (surface bombee) ─────
def _stacked_chars_image(count: int, width: int = 60, cell: int = 60, gap: int = 20):
    """Colonne verticale synthetique : `count` blocs blancs empiles sur fond noir."""
    from PIL import ImageDraw

    height = count * (cell + gap) + gap
    image = Image.new("RGB", (width, height), "black")
    draw = ImageDraw.Draw(image)
    for index in range(count):
        top = gap + index * (cell + gap)
        draw.rectangle([15, top, width - 15, top + cell], fill="white")
    return image


def test_segment_characters_isolates_each_block():
    pytest.importorskip("cv2")
    import numpy as np

    import cv2

    image = _stacked_chars_image(6)
    gray = cv2.cvtColor(np.asarray(image), cv2.COLOR_RGB2GRAY)
    boxes = service._segment_characters(gray)
    assert len(boxes) == 6
    # tries de haut en bas
    tops = [y for (_x, y, _w, _h) in boxes]
    assert tops == sorted(tops)


def test_reflow_vertical_crop_returns_two_polarities():
    pytest.importorskip("cv2")
    variants = service.reflow_vertical_crop(_stacked_chars_image(7))
    names = [name for name, _ in variants]
    assert names == ["reflow_inverted", "reflow"]
    # la ligne recomposee est plus large que haute (reflow horizontal reussi)
    for _name, image in variants:
        assert image.width > image.height


def test_reflow_returns_empty_when_too_few_characters():
    pytest.importorskip("cv2")
    # 2 blocs : sous le minimum plausible d'un matricule -> pas de reflow
    assert service.reflow_vertical_crop(_stacked_chars_image(2)) == []


def test_vertical_segmentation_respects_disable_flag(monkeypatch, tmp_path):
    monkeypatch.setattr(
        service, "settings", vertical_settings(tmp_path, vertical_segmentation_enabled=False)
    )
    monkeypatch.setattr(service, "get_ocr_engine", lambda: object())
    assert service.recognize_vertical_by_segmentation(_stacked_chars_image(6)) == []


def test_vertical_fallback_triggers_segmentation_when_variants_fail(monkeypatch, tmp_path):
    """Si les variantes verticales ne donnent rien de valide, le secours est utilise."""
    monkeypatch.setattr(service, "settings", vertical_settings(tmp_path))
    monkeypatch.setattr(service, "get_ocr_engine", lambda: object())
    # aucune variante classique ne produit de lecture
    monkeypatch.setattr(service, "generate_vertical_ocr_variants", lambda _crop: [])
    called = {"seg": 0}

    def fake_segmentation(_crop, index=0):
        called["seg"] += 1
        return [service.OcrReading("MRKU6234191", 0.9, "reflow_inverted", index, 0.82)]

    monkeypatch.setattr(service, "recognize_vertical_by_segmentation", fake_segmentation)
    readings = service.recognize_container_code(Image.new("RGB", (40, 300)), 0, "vertical")
    assert called["seg"] == 1
    assert service.select_best_iso_candidate(readings)["candidate"] == "MRKU6234191"


def test_vertical_fallback_skipped_when_variant_already_valid(monkeypatch, tmp_path):
    """Si une variante classique suffit, on ne paie pas le cout de la segmentation."""
    monkeypatch.setattr(service, "settings", vertical_settings(tmp_path))
    monkeypatch.setattr(service, "get_ocr_engine", lambda: object())
    monkeypatch.setattr(
        service,
        "generate_vertical_ocr_variants",
        lambda _crop: [("upscaled", Image.new("RGB", (300, 40)))],
    )
    monkeypatch.setattr(
        service,
        "_read_variant",
        lambda *_a, **_k: [service.OcrReading("MRKU6234191", 0.9, "upscaled", 0, 0.9)],
    )
    called = {"seg": 0}
    monkeypatch.setattr(
        service,
        "recognize_vertical_by_segmentation",
        lambda *_a, **_k: called.__setitem__("seg", called["seg"] + 1) or [],
    )
    service.recognize_container_code(Image.new("RGB", (40, 300)), 0, "vertical")
    assert called["seg"] == 0


MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "container_code_yolo11n_best.pt"


@pytest.mark.skipif(not MODEL_PATH.exists(), reason="Modele YOLO local absent")
def test_real_model_optional(monkeypatch, tmp_path):
    pytest.importorskip("ultralytics")
    monkeypatch.setattr(
        service,
        "settings",
        fake_settings(
            tmp_path,
            model_path=MODEL_PATH,
            public_model_path="models/container_code_yolo11n_best.pt",
            active_model_version="v1",
            ocr_enabled=False,
        ),
    )
    service.reset_runtime_state()
    result = service.detect_container(make_image_bytes(320, 160))
    assert result["detection_mode"] in {"no_detection", "ocr_disabled"}


# ─── Matricule vertical : lettres du code proprietaire lues comme chiffres ────
# Sur un marquage vertical, PaddleOCR lit tres souvent les 4 lettres du code
# proprietaire comme des chiffres (U -> 0, I -> 0, L -> 1 ...). Le pipeline doit
# pouvoir remonter au vrai code, SANS jamais accepter une correction dont le
# chiffre de controle ISO 6346 serait faux.


def test_vertical_confusion_zero_u_recovers_tclu():
    """Cas reel : TCLU3361509 lu 'TCL03361509' (U lu 0)."""
    best = service.select_best_iso_candidate([reading("TCL03361509")])

    assert best is not None, "aucun candidat : le U n'est pas atteignable depuis 0"
    assert best["candidate"] == "TCLU3361509"
    assert validate_container_code(best["candidate"])["is_valid"]


def test_vertical_confusion_zero_i_and_zero_u_recovers_lfiu():
    """Cas reel : LFIU2043087 lu 'LF002043087' (I lu 0 ET U lu 0).

    Deux lettres du code proprietaire sont lues comme des chiffres dans la meme
    lecture. La table doit permettre de remonter au vrai code, sans qu'aucun
    autre candidat ne satisfasse le chiffre de controle.
    """
    best = service.select_best_iso_candidate([reading("LF002043087")])

    assert best is not None, "aucun candidat : ni I ni U ne sont atteignables depuis 0"
    assert best["candidate"] == "LFIU2043087"
    assert validate_container_code(best["candidate"])["is_valid"]


def test_unreachable_letter_never_yields_a_lucky_valid_code():
    """Garde-fou : une lettre non couverte ne doit pas produire un code faux.

    TEMU3108252 lu 'TE203108252' : le M lu 2 n'est pas une confusion couverte,
    le vrai code est donc hors d'atteinte. Elargir '0' a D et Q ferait alors
    apparaitre TEZD3108252, dont le chiffre de controle est valide par hasard.
    Livrer ce code serait exactement le risque "ISO valide mais OCR faux" :
    la seule reponse acceptable est de ne rien retenir.
    """
    best = service.select_best_iso_candidate([reading("TE203108252")])

    assert best is None, f"code faux accepte : {best['candidate'] if best else None}"


def test_ambiguous_candidates_from_one_reading_are_refused():
    """Deux corrections differentes donnent deux codes ISO valides : on refuse.

    '06122199350' peut se corriger en UGIZ2199350 (le vrai code) comme en
    OGLZ2199350, tous deux valides au sens du chiffre de controle. Choisir
    l'un des deux reviendrait a livrer un matricule potentiellement faux :
    la seule reponse sure est de ne rien retenir et de basculer en saisie
    manuelle.
    """
    candidats = service.generate_iso_candidates("06122199350")
    valides = {code for code, _ in candidats if validate_container_code(code)["is_valid"]}

    assert len(valides) >= 2, f"cas non ambigu, candidats valides : {valides}"
    assert service.select_best_iso_candidate([reading("06122199350")]) is None


def test_ambiguous_candidates_from_several_readings_are_refused():
    """Deux lectures produisant deux codes valides differents : on refuse."""
    readings = [reading("MRKU6234191"), reading("BBCU2172418")]

    assert service.select_best_iso_candidate(readings) is None


def test_vertical_code_already_correct_is_not_over_corrected():
    """Un matricule vertical deja bien lu ne doit subir aucune correction."""
    best = service.select_best_iso_candidate([reading("TCLU3361509")])

    assert best is not None
    assert best["candidate"] == "TCLU3361509"
    assert best["corrections"] == 0


@pytest.mark.parametrize("code", ["BBCU2172418", "MRSU6010390", "MRKU6234191"])
def test_horizontal_valid_codes_stay_unchanged(code):
    """Non-regression : les codes horizontaux deja valides restent identiques."""
    best = service.select_best_iso_candidate([reading(code)])

    assert best is not None
    assert best["candidate"] == code
    assert best["corrections"] == 0
