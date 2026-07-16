import io
import os
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
        "device": "cpu",
        "yolo_confidence": 0.25,
        "yolo_iou": 0.45,
        "crop_margin_percent": 0.04,
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


@pytest.fixture(autouse=True)
def reset_state():
    service.reset_runtime_state()
    yield
    service.reset_runtime_state()


def test_model_loaded_once(monkeypatch):
    model = object()
    calls = {"count": 0}

    def loader():
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


def test_fallback_enabled(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", fake_settings(tmp_path, fallback_enabled=True))
    monkeypatch.setattr(
        service, "detect_container_code_regions", lambda _image: (_ for _ in ()).throw(service.ModelUnavailableError("absent"))
    )
    result = service.detect_container(make_image_bytes())
    assert result["detection_mode"] == "fallback_mock"
    assert result["warning"] == "absent"


def test_fallback_disabled(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", fake_settings(tmp_path, fallback_enabled=False))
    monkeypatch.setattr(
        service, "detect_container_code_regions", lambda _image: (_ for _ in ()).throw(service.ModelUnavailableError("absent"))
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
    monkeypatch.setattr(service, "detect_container_code_regions", lambda _image: [])
    result = service.detect_container(make_image_bytes())
    assert result["detection_mode"] == "no_detection"
    assert result["detections"] == []
    assert result["detected_iso"] is None


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


def test_wrong_check_digit_is_not_valid():
    result = validate_container_code("MRKU6234192")
    assert result["is_valid"] is False
    assert service.select_best_iso_candidate([reading("MRKU6234192")]) is None


def test_invalid_image():
    with pytest.raises(service.InvalidImageError):
        service.decode_image(b"not an image")


def test_ocr_disabled_preserves_yolo(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", fake_settings(tmp_path, ocr_enabled=False))
    monkeypatch.setattr(
        service,
        "detect_container_code_regions",
        lambda _image: [{"bbox": {"x1": 1, "y1": 2, "x2": 30, "y2": 20}, "yolo_confidence": 0.88, "class_id": 0, "class_name": "container_code"}],
    )
    result = service.detect_container(make_image_bytes())
    assert result["detection_mode"] == "ocr_disabled"
    assert result["bbox"] is not None
    assert result["detected_iso"] is None


def test_ocr_error_preserves_yolo(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", fake_settings(tmp_path))
    monkeypatch.setattr(
        service,
        "detect_container_code_regions",
        lambda _image: [{"bbox": {"x1": 1, "y1": 2, "x2": 30, "y2": 20}, "yolo_confidence": 0.88, "class_id": 0, "class_name": "container_code"}],
    )
    monkeypatch.setattr(service, "recognize_container_code", lambda *_: (_ for _ in ()).throw(RuntimeError("OCR panne")))
    result = service.detect_container(make_image_bytes())
    assert result["detection_mode"] == "ocr_error"
    assert result["bbox"] is not None
    assert "OCR panne" in result["warning"]


def test_yolo_valid_ocr_result(monkeypatch, tmp_path):
    monkeypatch.setattr(service, "settings", fake_settings(tmp_path))
    monkeypatch.setattr(
        service,
        "detect_container_code_regions",
        lambda _image: [{"bbox": {"x1": 1, "y1": 2, "x2": 100, "y2": 40}, "yolo_confidence": 0.95, "class_id": 0, "class_name": "container_code"}],
    )
    monkeypatch.setattr(service, "recognize_container_code", lambda *_: [reading("MRKU 623419 1", 0.88)])
    result = service.detect_container(make_image_bytes())
    assert result["detection_mode"] == "yolo_paddleocr"
    assert result["confidence"] == pytest.approx(0.9115)
    assert result["is_valid_iso"] is True


MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "container_code_yolo11n_best.pt"


@pytest.mark.skipif(not MODEL_PATH.exists(), reason="Modele YOLO local absent")
def test_real_model_optional(monkeypatch, tmp_path):
    pytest.importorskip("ultralytics")
    monkeypatch.setattr(
        service,
        "settings",
        fake_settings(tmp_path, model_path=MODEL_PATH, public_model_path="models/container_code_yolo11n_best.pt", ocr_enabled=False),
    )
    service.reset_runtime_state()
    result = service.detect_container(make_image_bytes(320, 160))
    assert result["detection_mode"] in {"no_detection", "ocr_disabled"}
