import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


SERVICE_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(SERVICE_ROOT / ".env")


def _as_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _as_float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _as_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


@dataclass(frozen=True)
class VisionSettings:
    model_path_value: str = os.getenv(
        "VISION_MODEL_PATH", "models/container_code_yolo11n_best.pt"
    )
    device: str = os.getenv("VISION_DEVICE", "cpu")
    yolo_confidence: float = _as_float("VISION_YOLO_CONFIDENCE", 0.25)
    yolo_iou: float = _as_float("VISION_YOLO_IOU", 0.45)
    crop_margin_percent: float = _as_float("VISION_CROP_MARGIN_PERCENT", 0.04)
    ocr_enabled: bool = _as_bool("VISION_OCR_ENABLED", True)
    ocr_engine: str = os.getenv("VISION_OCR_ENGINE", "paddleocr")
    fallback_enabled: bool = _as_bool("VISION_FALLBACK_ENABLED", True)
    max_image_size_mb: int = _as_int("VISION_MAX_IMAGE_SIZE_MB", 5)

    @property
    def model_path(self) -> Path:
        path = Path(self.model_path_value)
        return path if path.is_absolute() else (SERVICE_ROOT / path).resolve()

    @property
    def public_model_path(self) -> str:
        try:
            return self.model_path.relative_to(SERVICE_ROOT).as_posix()
        except ValueError:
            return self.model_path.name

    @property
    def max_image_size_bytes(self) -> int:
        return self.max_image_size_mb * 1024 * 1024


settings = VisionSettings()
