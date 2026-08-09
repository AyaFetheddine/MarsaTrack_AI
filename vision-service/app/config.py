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


def _public_path(path: Path) -> str:
    """Chemin relatif au service (portable, jamais un chemin Windows complet)."""
    try:
        return Path(path).resolve().relative_to(SERVICE_ROOT).as_posix()
    except (ValueError, OSError):
        return Path(path).name


# Valeurs par defaut portables (relatives au dossier vision-service).
_DEFAULT_V1_PATH = "models/container_code_yolo11n_best.pt"
_DEFAULT_V2_PATH = "models/container_code_type_yolo11n_v2_best.pt"


@dataclass(frozen=True)
class VisionSettings:
    # Version active du modele : "v2" (deux classes) par defaut, "v1" possible.
    model_version: str = os.getenv("VISION_MODEL_VERSION", "v2").strip().lower()

    # Chemins par version. VISION_MODEL_PATH (legacy) sert de defaut au chemin V1
    # afin de rester compatible avec les anciennes configurations.
    v1_model_path_value: str = os.getenv(
        "VISION_V1_MODEL_PATH",
        os.getenv("VISION_MODEL_PATH", _DEFAULT_V1_PATH),
    )
    v2_model_path_value: str = os.getenv("VISION_V2_MODEL_PATH", _DEFAULT_V2_PATH)

    # Repli controle vers la V1 si la V2 est absente / illisible.
    model_fallback_to_v1: bool = _as_bool("VISION_MODEL_FALLBACK_TO_V1", True)

    device: str = os.getenv("VISION_DEVICE", "cpu")
    yolo_confidence: float = _as_float("VISION_YOLO_CONFIDENCE", 0.25)
    yolo_iou: float = _as_float("VISION_YOLO_IOU", 0.45)
    crop_margin_percent: float = _as_float("VISION_CROP_MARGIN_PERCENT", 0.04)
    crop_context_horizontal_factor: float = _as_float(
        "VISION_CROP_CONTEXT_HORIZONTAL_FACTOR", 1.25
    )
    crop_context_vertical_factor: float = _as_float(
        "VISION_CROP_CONTEXT_VERTICAL_FACTOR", 0.75
    )

    # --- Lecture verticale -------------------------------------------------
    # Une zone est consideree verticale quand hauteur/largeur >= ce seuil.
    vertical_ratio_threshold: float = _as_float("VISION_VERTICAL_RATIO_THRESHOLD", 1.6)
    # Marges dediees aux zones verticales : plus larges en X (les colonnes sont
    # etroites et les caracteres debordent souvent), tres serrees en Y pour ne
    # pas absorber les marquages voisins.
    vertical_crop_margin_x_percent: float = _as_float(
        "VISION_VERTICAL_CROP_MARGIN_X_PERCENT", 0.30
    )
    vertical_crop_margin_y_percent: float = _as_float(
        "VISION_VERTICAL_CROP_MARGIN_Y_PERCENT", 0.02
    )
    # Crop contextuel (dernier recours) exprime en pourcentage de la boite.
    context_crop_margin_percent: float = _as_float(
        "VISION_CONTEXT_CROP_MARGIN_PERCENT", 0.60
    )
    # Agrandissement adaptatif : on vise un petit cote minimal plutot qu'un
    # facteur fixe, car les colonnes verticales sont tres etroites. On plafonne
    # le grand cote pour ne pas produire d'images enormes (perf OCR).
    min_crop_side_px: int = _as_int("VISION_MIN_CROP_SIDE_PX", 160)
    max_crop_side_px: int = _as_int("VISION_MAX_CROP_SIDE_PX", 1100)
    max_upscale_factor: int = _as_int("VISION_MAX_UPSCALE_FACTOR", 8)
    # Garde-fou de performance : nombre maximal de variantes OCR par zone.
    max_ocr_variants: int = _as_int("VISION_MAX_OCR_VARIANTS", 14)
    # Secours matricule vertical sur surface bombee (segmentation + reflow).
    vertical_segmentation_enabled: bool = _as_bool(
        "VISION_VERTICAL_SEGMENTATION_ENABLED", True
    )

    # --- Mode diagnostic local (desactive par defaut) ----------------------
    debug_save_crops: bool = _as_bool("VISION_DEBUG_SAVE_CROPS", False)
    debug_output_dir_value: str = os.getenv("VISION_DEBUG_OUTPUT_DIR", "debug")

    ocr_enabled: bool = _as_bool("VISION_OCR_ENABLED", True)
    ocr_engine: str = os.getenv("VISION_OCR_ENGINE", "paddleocr")
    # Desactive par defaut : si le modele est indisponible, mieux vaut une erreur
    # claire qu'un resultat simule (MRKU6234191) preremplissable par erreur.
    fallback_enabled: bool = _as_bool("VISION_FALLBACK_ENABLED", False)
    max_image_size_mb: int = _as_int("VISION_MAX_IMAGE_SIZE_MB", 5)

    def _resolve(self, value: str) -> Path:
        path = Path(value)
        return path if path.is_absolute() else (SERVICE_ROOT / path).resolve()

    @property
    def v1_model_path(self) -> Path:
        return self._resolve(self.v1_model_path_value)

    @property
    def v2_model_path(self) -> Path:
        return self._resolve(self.v2_model_path_value)

    @property
    def active_model_version(self) -> str:
        return "v1" if self.model_version == "v1" else "v2"

    @property
    def active_model_path(self) -> Path:
        return self.v1_model_path if self.active_model_version == "v1" else self.v2_model_path

    # --- Compat : anciens attributs utilises par le pipeline et les tests ---
    @property
    def model_path(self) -> Path:
        return self.active_model_path

    @property
    def public_model_path(self) -> str:
        return _public_path(self.active_model_path)

    def public_path_of(self, path: Path) -> str:
        return _public_path(path)

    @property
    def debug_output_dir(self) -> Path:
        return self._resolve(self.debug_output_dir_value)

    @property
    def max_image_size_bytes(self) -> int:
        return self.max_image_size_mb * 1024 * 1024


settings = VisionSettings()
