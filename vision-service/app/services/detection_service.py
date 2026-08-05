from __future__ import annotations

import io
import importlib.util
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from PIL import Image, ImageEnhance, ImageFilter, ImageOps, UnidentifiedImageError

from app.config import settings
from app.utils.iso6346 import validate_container_code
from app.utils.iso_size_type import (
    parse_iso_size_type,
    validate_iso_size_type_format,
)
from app.utils.orientation import (
    HORIZONTAL,
    UNCERTAIN,
    VERTICAL,
    TextFragment,
    associate_regions,
    classify_orientation,
    reconstruct_reading_order,
)
from app.utils.vision_debug import DebugRecorder


SIMULATED_DETECTED_ISO = "MRKU6234191"
EXPECTED_CLASS_NAME = "container_code"

# Longueurs attendues, utilisees pour penaliser les lectures trop courtes.
ISO_EXPECTED_LENGTH = 11
ISO_TYPE_EXPECTED_LENGTH = 4

# Noms de classes acceptes selon la version du modele.
# V1 : une seule classe "container_code". V2 : "container-number" + "iso-type".
CONTAINER_NUMBER_CLASS_NAMES = {
    "container-number",
    "container_number",
    "container_code",
    "container-code",
    "container",
}
ISO_TYPE_CLASS_NAMES = {"iso-type", "iso_type", "isotype"}

CONFIDENCE_YOLO_WEIGHT = 0.45
CONFIDENCE_OCR_WEIGHT = 0.55
MAX_CANDIDATES = 64

_yolo_model: Any = None
_yolo_load_attempted = False
_yolo_load_error: str | None = None
_active_model_version: str | None = None
_fallback_in_use = False
_model_classes: list[str] = []
_model_warning: str | None = None
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
    # Geometrie des fragments a l'origine de la lecture (vide si le moteur
    # n'expose pas de boites). Sert a la reconstruction et a la tracabilite.
    fragments: list[TextFragment] = field(default_factory=list)
    orientation: str = UNCERTAIN


def reset_runtime_state() -> None:
    """Reset lazy singletons. Intended for tests only."""
    global _yolo_model, _yolo_load_attempted, _yolo_load_error
    global _active_model_version, _fallback_in_use, _model_classes, _model_warning
    global _ocr_engine, _ocr_load_attempted, _ocr_load_error
    _yolo_model = None
    _yolo_load_attempted = False
    _yolo_load_error = None
    _active_model_version = None
    _fallback_in_use = False
    _model_classes = []
    _model_warning = None
    _ocr_engine = None
    _ocr_load_attempted = False
    _ocr_load_error = None


# ─── Classification des classes YOLO ─────────────────────────────────────────
def classify_kind(class_name: str | None) -> str | None:
    """Regroupe un nom de classe YOLO en 'container_number', 'iso_type' ou None."""
    if not class_name:
        return None
    key = str(class_name).strip().lower()
    if key in CONTAINER_NUMBER_CLASS_NAMES:
        return "container_number"
    if key in ISO_TYPE_CLASS_NAMES:
        return "iso_type"
    return None


def _model_class_names(model: Any) -> list[str]:
    names = getattr(model, "names", None)
    if isinstance(names, dict):
        return [str(value).strip().lower() for value in names.values()]
    if isinstance(names, (list, tuple)):
        return [str(value).strip().lower() for value in names]
    return []


def _validate_model_classes(version: str, classes: list[str]) -> str | None:
    if not classes:
        # Modele factice (tests) ou noms indisponibles : pas de warning bloquant.
        return None
    has_number = any(classify_kind(name) == "container_number" for name in classes)
    if version == "v2":
        has_type = any(classify_kind(name) == "iso_type" for name in classes)
        if not (has_number and has_type):
            return (
                "Classes du modele inattendues pour la V2 (attendu container-number "
                f"+ iso-type, trouve : {', '.join(classes) or 'aucune'})."
            )
        return None
    if not has_number:
        return (
            "Classe du modele inattendue pour la V1 (attendu container_code, "
            f"trouve : {', '.join(classes)})."
        )
    return None


# ─── Chargement des modeles ──────────────────────────────────────────────────
def _public_model_path(path: Any = None) -> str:
    if path is None:
        return getattr(settings, "public_model_path", "modele")
    resolver = getattr(settings, "public_path_of", None)
    if callable(resolver):
        return resolver(Path(path))
    return Path(path).name


def load_yolo_model(path: Any = None) -> Any:
    target = Path(path) if path is not None else settings.model_path

    if not target.exists():
        raise ModelUnavailableError(
            f"Modele YOLO introuvable : {_public_model_path(path)}."
        )

    try:
        from ultralytics import YOLO
    except ImportError as error:
        raise ModelUnavailableError(
            "Ultralytics n'est pas installe dans l'environnement Vision."
        ) from error

    try:
        return YOLO(str(target))
    except Exception as error:
        raise ModelUnavailableError(
            f"Impossible de charger le modele YOLO : {error}"
        ) from error


def _load_active_model() -> dict:
    """Charge le modele actif avec repli V1 controle. Retourne un dict d'etat."""
    version = getattr(settings, "active_model_version", "v2")
    fallback_enabled = getattr(settings, "model_fallback_to_v1", True)
    v1_path = getattr(settings, "v1_model_path", None)

    try:
        model = load_yolo_model()  # modele actif (patchable par les tests)
        classes = _model_class_names(model)
        return {
            "model": model,
            "version": version,
            "fallback_in_use": False,
            "classes": classes,
            "warning": _validate_model_classes(version, classes),
        }
    except ModelUnavailableError as primary_error:
        # Repli controle vers la V1 : uniquement si le modele actif est la V2,
        # le fallback est active, et un chemin V1 distinct est disponible.
        if version == "v2" and fallback_enabled and v1_path is not None:
            try:
                model = load_yolo_model(v1_path)
            except ModelUnavailableError:
                raise primary_error
            classes = _model_class_names(model)
            warning = (
                f"Modele V2 indisponible ({primary_error}). Repli sur le modele V1 : "
                "matricule detecte, code taille/type indisponible."
            )
            return {
                "model": model,
                "version": "v1",
                "fallback_in_use": True,
                "classes": classes,
                "warning": warning,
            }
        raise


def get_yolo_model() -> Any:
    global _yolo_model, _yolo_load_attempted, _yolo_load_error
    global _active_model_version, _fallback_in_use, _model_classes, _model_warning
    if _yolo_model is not None:
        return _yolo_model
    if _yolo_load_attempted:
        raise ModelUnavailableError(_yolo_load_error or "Modele YOLO indisponible.")

    _yolo_load_attempted = True
    try:
        state = _load_active_model()
        _yolo_model = state["model"]
        _active_model_version = state["version"]
        _fallback_in_use = state["fallback_in_use"]
        _model_classes = state["classes"]
        _model_warning = state["warning"]
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


# ─── Detection YOLO (une seule inference, toutes classes) ────────────────────
def run_yolo_detections(image: Image.Image) -> list[dict]:
    """Execute YOLO une seule fois et retourne toutes les detections (avec kind)."""
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
        class_name = (
            names.get(class_id, str(class_id)) if isinstance(names, dict) else str(class_id)
        )
        confidence = float(confidences[index]) if index < len(confidences) else 0.0
        x1, y1, x2, y2 = (float(value) for value in coords[:4])
        detections.append(
            {
                "bbox": {"x1": x1, "y1": y1, "x2": x2, "y2": y2},
                "yolo_confidence": confidence,
                "class_id": class_id,
                "class_name": class_name,
                "kind": classify_kind(class_name),
            }
        )

    return detections


def _regions_of_kind(detections: list[dict], kind: str) -> list[dict]:
    filtered = [item for item in detections if item.get("kind") == kind]
    return sorted(filtered, key=lambda item: item["yolo_confidence"], reverse=True)


def detect_container_code_regions(image: Image.Image) -> list[dict]:
    """Zones 'container-number' uniquement (compat V1 + tests existants)."""
    return _regions_of_kind(run_yolo_detections(image), "container_number")


def detect_iso_type_regions(image: Image.Image) -> list[dict]:
    """Zones 'iso-type' uniquement."""
    return _regions_of_kind(run_yolo_detections(image), "iso_type")


def crop_with_margins(
    image: Image.Image, bbox: dict, margin_x_percent: float, margin_y_percent: float
) -> Image.Image:
    """Recadre une boite avec des marges X et Y independantes.

    Toutes les coordonnees sont bornees aux dimensions de l'image.
    """
    width, height = image.size
    box_width = max(1.0, bbox["x2"] - bbox["x1"])
    box_height = max(1.0, bbox["y2"] - bbox["y1"])
    left = max(0, int(bbox["x1"] - box_width * margin_x_percent))
    top = max(0, int(bbox["y1"] - box_height * margin_y_percent))
    right = min(width, int(bbox["x2"] + box_width * margin_x_percent))
    bottom = min(height, int(bbox["y2"] + box_height * margin_y_percent))
    return image.crop((left, top, max(left + 1, right), max(top + 1, bottom)))


def crop_detected_region(image: Image.Image, bbox: dict) -> Image.Image:
    """Crop de base, marge uniforme (comportement historique, cas horizontal)."""
    margin = settings.crop_margin_percent
    return crop_with_margins(image, bbox, margin, margin)


def bbox_orientation(bbox: dict) -> str:
    """Oriente une zone YOLO a partir du seul ratio de sa boite."""
    threshold = getattr(settings, "vertical_ratio_threshold", 1.6)
    return classify_orientation(
        max(1.0, bbox["x2"] - bbox["x1"]),
        max(1.0, bbox["y2"] - bbox["y1"]),
        threshold=threshold,
    )


def crop_oriented_region(image: Image.Image, bbox: dict, orientation: str) -> Image.Image:
    """Crop adapte a l'orientation.

    Une colonne verticale est etroite : elargir en X recupere les caracteres
    qui debordent de la boite, alors qu'elargir en Y ferait entrer les
    marquages voisins. Le cas horizontal garde la marge uniforme d'origine,
    ce qui preserve strictement les detections deja validees.
    """
    if orientation != VERTICAL:
        return crop_detected_region(image, bbox)
    return crop_with_margins(
        image,
        bbox,
        getattr(settings, "vertical_crop_margin_x_percent", 0.30),
        getattr(settings, "vertical_crop_margin_y_percent", 0.02),
    )


def upscale_for_ocr(crop: Image.Image) -> Image.Image:
    """Agrandit un crop jusqu'a ce que son petit cote soit exploitable.

    Un facteur fixe ne suffit pas : une colonne verticale peut ne faire que
    quelques dizaines de pixels de large, la ou une bande horizontale est deja
    lisible. On vise donc un petit cote minimal.

    Deux garde-fous de performance :
    - un crop dont le petit cote est deja suffisant n'est pas agrandi ;
    - le grand cote est plafonne, pour ne jamais produire d'image geante
      (une colonne de 700 px n'a pas besoin de passer a 1400 px : c'est autant
      de temps OCR gaspille, repete sur chaque variante).
    """
    minimum = max(1, getattr(settings, "min_crop_side_px", 160))
    maximum = max(1, getattr(settings, "max_upscale_factor", 8))
    max_long = max(minimum, getattr(settings, "max_crop_side_px", 1100))
    smallest = max(1, min(crop.width, crop.height))
    longest = max(crop.width, crop.height)

    if smallest >= minimum:
        return crop

    factor = min(maximum, -(-minimum // smallest))  # ceil division
    while factor > 1 and longest * factor > max_long:
        factor -= 1
    if factor <= 1:
        return crop
    return crop.resize(
        (crop.width * factor, crop.height * factor), Image.Resampling.LANCZOS
    )


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


def crop_oriented_context(image: Image.Image, bbox: dict, orientation: str) -> Image.Image:
    """Crop contextuel, dernier recours quand le code deborde de la boite."""
    if orientation != VERTICAL:
        return crop_detected_context(image, bbox)
    margin = getattr(settings, "context_crop_margin_percent", 0.60)
    return crop_with_margins(image, bbox, margin, margin / 4)


def generate_ocr_variants(crop: Image.Image, include_rotations: bool = False) -> list[tuple[str, Image.Image]]:
    """Variantes historiques (cas horizontal). Comportement inchange."""
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


def generate_vertical_ocr_variants(crop: Image.Image) -> list[tuple[str, Image.Image]]:
    """Variantes ordonnees pour une zone verticale, de la moins chere a la plus chere.

    L'ordre est important : le pipeline s'arrete des qu'un candidat valide et
    suffisamment fiable est obtenu, donc les variantes qui fonctionnent le plus
    souvent doivent venir en premier.

    Les rotations sont ici essentielles : sur un marquage vertical, chaque
    glyphe est lui-meme pivote d'environ 90 degres. PaddleOCR redresse seul les
    boites tres allongees, mais pas de facon fiable a basse resolution.
    """
    upscaled = upscale_for_ocr(crop)
    gray = ImageOps.grayscale(upscaled)
    variants: list[tuple[str, Image.Image]] = [
        ("upscaled", upscaled),
        ("rotate_90", upscaled.rotate(90, expand=True)),
        ("rotate_minus_90", upscaled.rotate(-90, expand=True)),
        ("rotate_180", upscaled.rotate(180, expand=True)),
        ("upscaled_gray", gray.convert("RGB")),
        ("gray_rotate_90", gray.convert("RGB").rotate(90, expand=True)),
        ("gray_rotate_minus_90", gray.convert("RGB").rotate(-90, expand=True)),
    ]

    contrast = ImageEnhance.Contrast(gray).enhance(1.8)
    sharpened = contrast.filter(ImageFilter.SHARPEN).convert("RGB")
    variants.extend(
        [
            ("sharpen_rotate_90", sharpened.rotate(90, expand=True)),
            ("contrast", contrast.convert("RGB")),
            ("original", crop),
        ]
    )

    # Note : seuillage et inversion ont ete retires du parcours par defaut.
    # Sur les photos reelles a faible contraste (conteneur peint, surface
    # bombee), ils ne produisent aucune lecture exploitable et coutent une
    # passe OCR chacun. Le plafond `max_ocr_variants` reste applique.
    limit = max(1, getattr(settings, "max_ocr_variants", 14))
    return variants[:limit]


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


def _invoke_ocr(engine: Any, image: Image.Image) -> Any:
    import numpy as np

    array = np.asarray(image)
    if hasattr(engine, "ocr"):
        return engine.ocr(array, cls=False)
    if hasattr(engine, "predict"):
        return engine.predict(array)
    raise AttributeError("Le moteur OCR n'expose ni 'ocr' ni 'predict'.")


def _run_ocr(engine: Any, image: Image.Image) -> list[tuple[str, float]]:
    """Lecture simple (texte + confiance), sans geometrie."""
    try:
        return _extract_ocr_pairs(_invoke_ocr(engine, image))
    except AttributeError:
        return []


def _polygon_bounds(polygon: Any) -> tuple[float, float, float, float] | None:
    """Convertit un polygone PaddleOCR en boite englobante (x1, y1, x2, y2)."""
    try:
        points = [(float(point[0]), float(point[1])) for point in polygon]
    except (TypeError, ValueError, IndexError):
        return None
    if len(points) < 2:
        return None
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return min(xs), min(ys), max(xs), max(ys)


def _extract_ocr_fragments(payload: Any) -> list[TextFragment]:
    """Extrait texte + confiance + geometrie locale des fragments PaddleOCR.

    Deux formats sont couverts :
      - PaddleOCR 2.x : [[ [polygone, (texte, score)], ... ]]
      - PaddleOCR 3.x : dict avec rec_texts / rec_scores / rec_polys (ou dt_polys)
    Un format inconnu renvoie une liste vide : l'appelant se rabat alors sur la
    lecture sans geometrie, sans jamais echouer.
    """
    fragments: list[TextFragment] = []

    def visit(value: Any) -> None:
        if value is None:
            return
        if isinstance(value, dict):
            texts = value.get("rec_texts")
            scores = value.get("rec_scores")
            polygons = value.get("rec_polys") or value.get("dt_polys") or value.get("rec_boxes")
            if isinstance(texts, (list, tuple)) and texts:
                for index, text in enumerate(texts):
                    if not isinstance(text, str):
                        continue
                    score = 0.0
                    if isinstance(scores, (list, tuple)) and index < len(scores):
                        score = float(scores[index] or 0.0)
                    bounds = None
                    if isinstance(polygons, (list, tuple)) and index < len(polygons):
                        bounds = _polygon_bounds(polygons[index])
                    fragments.append(_fragment_from(text, score, bounds))
                return
            for key in ("res", "result", "data", "json"):
                if key in value:
                    visit(value[key])
            return
        if hasattr(value, "json"):
            try:
                visit(value.json)
                return
            except Exception:  # noqa: BLE001 - format inattendu, on continue
                pass
        if isinstance(value, (list, tuple)):
            # Format 2.x : [polygone, (texte, score)]
            if (
                len(value) == 2
                and isinstance(value[1], (list, tuple))
                and len(value[1]) == 2
                and isinstance(value[1][0], str)
            ):
                bounds = _polygon_bounds(value[0])
                fragments.append(
                    _fragment_from(value[1][0], float(value[1][1] or 0.0), bounds)
                )
                return
            for item in value:
                visit(item)

    visit(payload)
    return fragments


def _fragment_from(
    text: str, confidence: float, bounds: tuple[float, float, float, float] | None
) -> TextFragment:
    if bounds is None:
        return TextFragment(text=text, confidence=confidence, has_geometry=False)
    x1, y1, x2, y2 = bounds
    return TextFragment(text=text, confidence=confidence, x1=x1, y1=y1, x2=x2, y2=y2)


def _ocr_fragments(engine: Any, image: Image.Image) -> list[TextFragment]:
    """Fragments avec geometrie, avec repli sur la lecture simple.

    Le repli garantit qu'un moteur (ou un double de test) n'exposant pas de
    boites continue de fonctionner : les fragments sont alors marques
    `has_geometry=False` et la reconstruction spatiale est desactivee.
    """
    try:
        fragments = _extract_ocr_fragments(_invoke_ocr(engine, image))
    except AttributeError:
        fragments = []
    if fragments:
        return fragments
    return [
        TextFragment(text=text, confidence=confidence, has_geometry=False)
        for text, confidence in _run_ocr(engine, image)
    ]


def normalize_ocr_text(text: str | None) -> str:
    return re.sub(r"[^A-Z0-9]", "", (text or "").upper())


def _code_like_fragments(fragments: list[TextFragment]) -> list[TextFragment]:
    """Fragments plausibles pour un marquage de conteneur (capitales/chiffres)."""
    return [
        fragment
        for fragment in fragments
        if any(character.isupper() or character.isdigit() for character in fragment.text)
    ]


def _read_variant(
    engine: Any,
    image: Image.Image,
    variant_name: str,
    detection_index: int,
    orientation: str = HORIZONTAL,
) -> list[OcrReading]:
    """Lit une variante et reconstruit les lectures possibles.

    PaddleOCR renvoie souvent le proprietaire, le numero de serie et le chiffre
    de controle separement — et, sur un marquage vertical, un caractere par
    fragment. Les fragments ne sont jamais concatenes dans leur ordre de
    retour : l'ordre vient de leur geometrie (colonnes triees de haut en bas,
    ou lignes triees de gauche a droite).
    """
    fragments = _ocr_fragments(engine, image)
    if not fragments:
        return []

    readings = [
        OcrReading(
            fragment.text,
            fragment.confidence,
            variant_name,
            detection_index,
            fragments=[fragment],
            orientation=orientation,
        )
        for fragment in fragments
    ]
    if len(fragments) < 2:
        return readings

    lowest = min(fragment.confidence for fragment in fragments)
    geometric = [f for f in fragments if f.has_geometry]

    if geometric:
        ordered_texts = reconstruct_reading_order(geometric, orientation)
        for index, text in enumerate(ordered_texts):
            normalized = normalize_ocr_text(text)
            if not normalized:
                continue
            # La premiere reconstruction porte le nom historique "_combined"
            # (ordre de lecture naturel) ; les suivantes sont les colonnes.
            suffix = "combined" if index == 0 else f"column{index}"
            readings.append(
                OcrReading(
                    normalized,
                    lowest,
                    f"{variant_name}_{suffix}",
                    detection_index,
                    fragments=geometric,
                    orientation=orientation,
                )
            )

        # Variante "propre" : les marquages de conteneur sont en capitales et
        # en chiffres. Les fragments entierement en minuscules sont presque
        # toujours du bruit (filigrane, texte d'arriere-plan). On ne les
        # supprime pas : on ajoute simplement une reconstruction sans eux, et
        # le classement des candidats tranche.
        cleaned = _code_like_fragments(geometric)
        if 1 < len(cleaned) < len(geometric):
            for index, text in enumerate(reconstruct_reading_order(cleaned, orientation)):
                normalized = normalize_ocr_text(text)
                if normalized:
                    readings.append(
                        OcrReading(
                            normalized,
                            min(fragment.confidence for fragment in cleaned),
                            f"{variant_name}_clean{index}",
                            detection_index,
                            fragments=cleaned,
                            orientation=orientation,
                        )
                    )
        return readings

    # Moteur sans geometrie : repli sur la concatenation historique.
    combined_text = "".join(normalize_ocr_text(f.text) for f in fragments)
    if combined_text:
        readings.append(
            OcrReading(
                combined_text,
                lowest,
                f"{variant_name}_combined",
                detection_index,
                orientation=orientation,
            )
        )
    return readings


def _detect_crop_orientation(crop: Image.Image, readings: list[OcrReading], hint: str) -> str:
    """Affine l'orientation d'un crop avec la geometrie reellement observee."""
    fragments = [
        fragment
        for reading in readings
        for fragment in reading.fragments
        if fragment.has_geometry
    ]
    threshold = getattr(settings, "vertical_ratio_threshold", 1.6)
    observed = classify_orientation(crop.width, crop.height, fragments, threshold=threshold)
    return observed if observed != UNCERTAIN else hint


def recognize_container_code(
    crop: Image.Image, detection_index: int, orientation: str = UNCERTAIN
) -> list[OcrReading]:
    """Lit un crop de matricule, en s'arretant des qu'un code valide est sur.

    Strategie progressive : les variantes sont evaluees dans l'ordre et la
    boucle s'interrompt des qu'un candidat ISO 6346 valide et suffisamment
    couvrant est trouve. On ne paie donc le cout des rotations et des
    pretraitements lourds que lorsque c'est necessaire.
    """
    engine = get_ocr_engine()
    readings: list[OcrReading] = []

    if orientation == VERTICAL:
        variants = generate_vertical_ocr_variants(crop)
    else:
        variants = generate_ocr_variants(crop)

    for variant_name, variant in variants:
        readings.extend(
            _read_variant(engine, variant, variant_name, detection_index, orientation)
        )
        if _has_reliable_iso(readings):
            return readings

    if orientation == VERTICAL:
        return readings

    # Cas horizontal ou incertain : la zone etait peut-etre verticale malgre
    # tout. On confirme avec la geometrie observee avant d'essayer les
    # variantes verticales, plutot que de faire tourner des rotations a l'aveugle.
    refined = _detect_crop_orientation(crop, readings, orientation)
    if refined == VERTICAL:
        for variant_name, variant in generate_vertical_ocr_variants(crop):
            readings.extend(
                _read_variant(engine, variant, variant_name, detection_index, VERTICAL)
            )
            if _has_reliable_iso(readings):
                return readings
        return readings

    if not any(select_best_iso_candidate([reading]) for reading in readings):
        for variant_name, variant in generate_ocr_variants(crop, include_rotations=True)[-2:]:
            readings.extend(
                _read_variant(engine, variant, variant_name, detection_index, orientation)
            )
    return readings


def recognize_region_with_context(
    image: Image.Image, bbox: dict, detection_index: int
) -> list[OcrReading]:
    """Lit une zone matricule : crop adapte, puis crop contextuel si besoin."""
    orientation = bbox_orientation(bbox)
    readings = recognize_container_code(
        crop_oriented_region(image, bbox, orientation), detection_index, orientation
    )
    if select_best_iso_candidate(readings):
        return readings

    # Le crop contextuel n'a d'interet que si des caracteres debordent de la
    # boite. Si une lecture couvre deja toute la longueur attendue, la zone est
    # complete : le contexte n'apporterait rien et couterait une seconde passe
    # OCR entiere. On l'evite (gain de performance sur les zones verticales).
    best_coverage = max(
        (reading_coverage(reading.text, ISO_EXPECTED_LENGTH) for reading in readings),
        default=0.0,
    )
    if best_coverage >= 0.9:
        return readings

    context_readings = recognize_container_code(
        crop_oriented_context(image, bbox, orientation), detection_index, orientation
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


def reading_coverage(text: str | None, expected_length: int) -> float:
    """Part de la longueur attendue reellement lue (0 a 1)."""
    if expected_length <= 0:
        return 0.0
    return min(1.0, len(normalize_ocr_text(text)) / expected_length)


def reading_reliability(
    confidence: float | None, text: str | None, expected_length: int
) -> float:
    """Confiance metier d'une lecture, penalisee par sa couverture.

    Une confiance OCR elevee sur un seul caractere n'est pas une lecture
    fiable du matricule : elle est fortement penalisee, afin que l'interface
    n'affiche jamais 98 % pour un texte de trois caracteres.
    """
    base = max(0.0, min(1.0, float(confidence or 0.0)))
    return round(base * (0.30 + 0.70 * reading_coverage(text, expected_length)), 4)


def _candidate_score(item: dict, expected_length: int) -> float:
    """Score global d'un candidat deja valide.

    La validation structurelle a deja filtre les candidats : ce score ne sert
    qu'a departager. Il combine confiance OCR, confiance YOLO, couverture de
    la lecture d'origine et parcimonie des corrections, de sorte qu'un
    candidat obtenu au prix de nombreuses substitutions ne batte pas un
    candidat lu presque tel quel.
    """
    reading = item["reading"]
    coverage = reading_coverage(reading.text, expected_length)
    corrections_penalty = min(1.0, item["corrections"] / 4)
    return (
        0.35 * max(0.0, min(1.0, reading.confidence))
        + 0.25 * max(0.0, min(1.0, reading.yolo_confidence))
        + 0.25 * coverage
        + 0.15 * (1.0 - corrections_penalty)
    )


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
            round(_candidate_score(item, ISO_EXPECTED_LENGTH), 6),
            -item["corrections"],
            item["reading"].confidence,
        ),
    )


def _has_reliable_iso(readings: list[OcrReading]) -> bool:
    """Un candidat ISO valide issu d'une lecture reellement couvrante."""
    best = select_best_iso_candidate(readings)
    if best is None:
        return False
    return reading_coverage(best["reading"].text, ISO_EXPECTED_LENGTH) >= 0.9


# ─── OCR dedie au code taille/type (iso-type) ────────────────────────────────
ISO_TYPE_LETTER_TO_DIGIT = {"O": "0", "Q": "0", "I": "1", "L": "1", "S": "5", "B": "8", "Z": "2", "G": "6"}
ISO_TYPE_DIGIT_TO_LETTER = {"0": "O", "1": "I", "5": "S", "8": "B", "2": "Z", "6": "G"}

# Confusions specifiques au groupe de type (3e caractere). Les glyphes ronds
# sont massivement confondus avec G, et 8 avec B. Ces alternatives sont
# seulement proposees : un candidat corrige ne gagne que s'il designe un
# groupe de type reellement connu.
ISO_TYPE_GROUP_CONFUSIONS = {
    "O": ("G",),
    "Q": ("G",),
    "C": ("G",),
    "0": ("G",),
    "6": ("G",),
    "8": ("B",),
    "5": ("S",),
    # Sur une surface bombee/inclinee, un G est frequemment lu comme un 2
    # (constate sur conteneur reel : "22G1" lu "2221"). On propose donc G en
    # plus de Z ; la preference "groupe connu" du classement tranche vers G.
    "2": ("G", "Z"),
}


def _iso_type_position_options(character: str, index: int) -> list[str]:
    """Corrections OCR prudentes selon la position attendue (ex: 22G1)."""
    if index == 2:
        # groupe de type : une lettre est attendue (G, R, U, P, T, ...)
        options = [character] if character.isalpha() else []
        replacement = ISO_TYPE_DIGIT_TO_LETTER.get(character)
        # Glyphes ronds : O, Q, C, 0 et 6 sont regulierement lus a la place
        # d'un G. On propose le groupe de type connu en alternative, sans
        # jamais supprimer la lecture d'origine : le classement tranchera.
        for alternative in ISO_TYPE_GROUP_CONFUSIONS.get(character, ()):
            if alternative not in options:
                options.append(alternative)
    elif index == 3:
        # detail de type : un chiffre est attendu
        options = [character] if character.isdigit() else []
        replacement = ISO_TYPE_LETTER_TO_DIGIT.get(character)
    else:
        # longueur / hauteur : alphanumerique accepte tel quel ; correction
        # vers un chiffre proposee en secours si c'est une lettre ambigue.
        options = [character] if character.isalnum() else []
        replacement = ISO_TYPE_LETTER_TO_DIGIT.get(character) if character.isalpha() else None
    if replacement and replacement not in options:
        options.append(replacement)
    return options


def generate_iso_type_candidates(text: str | None) -> list[tuple[str, int]]:
    normalized = normalize_ocr_text(text)
    windows = [normalized[index : index + 4] for index in range(max(1, len(normalized) - 3))]
    candidates: dict[str, int] = {}
    for window in windows:
        if len(window) != 4:
            continue
        variants = [("", 0)]
        for index, character in enumerate(window):
            options = _iso_type_position_options(character, index)
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


def _is_known_type_group(candidate: str) -> bool:
    """True si le 3e caractere designe un groupe de type documente."""
    parsed = parse_iso_size_type(candidate)
    return bool(parsed["is_valid_format"] and parsed["type_label"])


def _has_known_iso_type(readings: list[OcrReading]) -> bool:
    """Un candidat taille/type valide ET dont le groupe de type est connu."""
    best = select_best_iso_type_candidate(readings)
    return bool(best and _is_known_type_group(best["candidate"]))


def select_best_iso_type_candidate(readings: list[OcrReading]) -> dict | None:
    ranked = []
    for reading in readings:
        for candidate, corrections in generate_iso_type_candidates(reading.text):
            if validate_iso_size_type_format(candidate):
                ranked.append(
                    {"candidate": candidate, "corrections": corrections, "reading": reading}
                )
    if not ranked:
        return None
    return max(
        ranked,
        key=lambda item: (
            # Un code dont le groupe de type est reellement connu prime sur un
            # code seulement valide structurellement : "42G1" bat "42O1", meme
            # si ce dernier a ete lu sans aucune correction.
            _is_known_type_group(item["candidate"]),
            round(_candidate_score(item, ISO_TYPE_EXPECTED_LENGTH), 6),
            -item["corrections"],
            item["reading"].confidence,
        ),
    )


def recognize_iso_type(
    crop: Image.Image, detection_index: int = 0, orientation: str = UNCERTAIN
) -> list[OcrReading]:
    """Lit un crop taille/type, rotations comprises quand la zone est verticale.

    Sans cette prise en charge, un code `42G1` ecrit verticalement n'etait
    jamais lu : aucune rotation n'etait essayee sur cette classe.
    """
    engine = get_ocr_engine()
    readings: list[OcrReading] = []

    variants = (
        generate_vertical_ocr_variants(crop)
        if orientation == VERTICAL
        else generate_ocr_variants(crop)
    )
    for variant_name, variant in variants:
        readings.extend(
            _read_variant(engine, variant, variant_name, detection_index, orientation)
        )
        # On ne s'arrete que sur un groupe de type reellement connu. Un code
        # seulement valide structurellement (ex: "22Z1", groupe Z inconnu) ne
        # doit pas interrompre la recherche : une rotation suivante peut donner
        # le vrai code (ex: "22G1").
        if _has_known_iso_type(readings):
            return readings

    if orientation == VERTICAL:
        return readings

    refined = _detect_crop_orientation(crop, readings, orientation)
    if refined == VERTICAL:
        for variant_name, variant in generate_vertical_ocr_variants(crop):
            readings.extend(
                _read_variant(engine, variant, variant_name, detection_index, VERTICAL)
            )
            if _has_known_iso_type(readings):
                return readings
    return readings


def combine_confidences(yolo_confidence: float | None, ocr_confidence: float | None) -> float:
    yolo = max(0.0, min(1.0, float(yolo_confidence or 0.0)))
    ocr = max(0.0, min(1.0, float(ocr_confidence or 0.0)))
    return round(CONFIDENCE_YOLO_WEIGHT * yolo + CONFIDENCE_OCR_WEIGHT * ocr, 4)


def _success_mode() -> str:
    return "yolo_v2_paddleocr" if _active_model_version == "v2" else "yolo_paddleocr"


# ─── Structures iso-type ─────────────────────────────────────────────────────
def _iso_type_empty() -> dict:
    return {
        "iso_type": None,
        "raw_iso_type_ocr_text": None,
        "iso_type_confidence": None,
        "iso_type_yolo_confidence": None,
        "iso_type_ocr_confidence": None,
        "is_valid_iso_type_format": False,
        "iso_type_details": None,
        "iso_type_ocr_variant": None,
        "iso_type_bbox": None,
        "iso_type_detections": [],
        "iso_type_warning": None,
    }


def _iso_type_detection_payload(region: dict, raw: OcrReading | None, best: dict | None) -> dict:
    return {
        **region,
        "raw_ocr_text": raw.text if raw else None,
        "ocr_confidence": round(raw.confidence, 4) if raw else None,
        "candidate_iso_type": best["candidate"] if best else None,
        "is_valid_iso_type_format": bool(best),
    }


def _process_iso_type(
    image: Image.Image,
    regions: list[dict],
    associated: dict | None = None,
    recorder: DebugRecorder | None = None,
) -> dict:
    if not regions:
        return _iso_type_empty()

    primary = regions[0]
    if not settings.ocr_enabled:
        base = _iso_type_empty()
        base.update(
            {
                "iso_type_yolo_confidence": round(primary["yolo_confidence"], 4),
                "iso_type_bbox": primary["bbox"],
                "iso_type_detections": [
                    _iso_type_detection_payload(region, None, None) for region in regions
                ],
                "iso_type_warning": (
                    "Zone taille/type detectee. OCR desactive : saisissez le code manuellement."
                ),
            }
        )
        return base

    ocr_error: str | None = None
    per_region: list[tuple[dict, dict | None, OcrReading | None]] = []
    detection_payloads: list[dict] = []
    for region in regions:
        orientation = bbox_orientation(region["bbox"])
        crop = crop_oriented_region(image, region["bbox"], orientation)
        try:
            readings = recognize_iso_type(crop, 0, orientation)
        except Exception as error:  # noqa: BLE001 - OCR non bloquant
            ocr_error = str(error)
            readings = []
        region_best = select_best_iso_type_candidate(readings)
        region_raw = max(readings, key=lambda item: item.confidence, default=None)
        detection_payloads.append(_iso_type_detection_payload(region, region_raw, region_best))
        if recorder is not None:
            recorder.save_image(f"iso_type_{orientation}", crop)
            recorder.log(
                "iso_type_region",
                bbox=region["bbox"],
                yolo_confidence=region["yolo_confidence"],
                orientation=orientation,
                crop_size=list(crop.size),
                readings=[
                    {"text": r.text, "confidence": round(r.confidence, 4), "variant": r.variant}
                    for r in readings[:40]
                ],
                candidate=region_best["candidate"] if region_best else None,
                corrections=region_best["corrections"] if region_best else None,
            )
        per_region.append((region, region_best, region_raw))

    valid = [(region, best, raw) for region, best, raw in per_region if best]
    if valid:
        region, best, raw = max(
            valid,
            key=lambda item: (
                # une zone spatialement coherente avec le matricule prime
                item[0] is associated,
                round(_candidate_score(item[1], ISO_TYPE_EXPECTED_LENGTH), 6),
                -item[1]["corrections"],
                item[0]["yolo_confidence"],
            ),
        )
        reading = best["reading"]
        parsed = parse_iso_size_type(best["candidate"])
        return {
            "iso_type": best["candidate"],
            "raw_iso_type_ocr_text": reading.text,
            "iso_type_confidence": combine_confidences(region["yolo_confidence"], reading.confidence),
            "iso_type_yolo_confidence": round(region["yolo_confidence"], 4),
            "iso_type_ocr_confidence": round(reading.confidence, 4),
            "is_valid_iso_type_format": True,
            "iso_type_details": {
                "length_code": parsed["length_code"],
                "height_code": parsed["height_code"],
                "type_group": parsed["type_group"],
                "type_detail": parsed["type_detail"],
                "length_label": parsed["length_label"],
                "height_label": parsed["height_label"],
                "type_label": parsed["type_label"],
            },
            "iso_type_ocr_variant": reading.variant,
            "iso_type_bbox": region["bbox"],
            "iso_type_detections": detection_payloads,
            "iso_type_warning": parsed["warning"] or ocr_error,
        }

    raw = max(
        (item[2] for item in per_region if item[2]),
        key=lambda item: item.confidence,
        default=None,
    )
    base = _iso_type_empty()
    base.update(
        {
            "raw_iso_type_ocr_text": raw.text if raw else None,
            "iso_type_yolo_confidence": round(primary["yolo_confidence"], 4),
            # Confiance metier : une lecture trop courte ne peut pas etre
            # annoncee comme fiable, meme si le score brut de l'OCR est eleve.
            "iso_type_ocr_confidence": (
                reading_reliability(raw.confidence, raw.text, ISO_TYPE_EXPECTED_LENGTH)
                if raw
                else None
            ),
            "iso_type_ocr_variant": raw.variant if raw else None,
            "iso_type_bbox": primary["bbox"],
            "iso_type_detections": detection_payloads,
            "iso_type_warning": ocr_error
            or (
                "La zone du code taille/type a ete detectee, mais les caracteres "
                "n'ont pas pu etre lus avec fiabilite. Renseignez le code manuellement."
            ),
        }
    )
    return base


# ─── Resultats container-number ──────────────────────────────────────────────
def build_fallback_result(warning: str) -> dict:
    validation = validate_container_code(SIMULATED_DETECTED_ISO)
    result = {
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
    result.update(_iso_type_empty())
    result.update(_model_metadata())
    return _finalize(result)


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


def _process_container_number(
    image: Image.Image, regions: list[dict], recorder: DebugRecorder | None = None
) -> dict:
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
            if recorder is not None and recorder.enabled:
                orientation = bbox_orientation(region["bbox"])
                recorder.save_image(
                    f"matricule_{index}_{orientation}",
                    crop_oriented_region(image, region["bbox"], orientation),
                )
                recorder.save_image(
                    f"matricule_{index}_context",
                    crop_oriented_context(image, region["bbox"], orientation),
                )
                recorder.log(
                    "matricule_region",
                    index=index,
                    bbox=region["bbox"],
                    yolo_confidence=round(region["yolo_confidence"], 4),
                    orientation=orientation,
                    readings=[
                        {
                            "text": item.text,
                            "confidence": round(item.confidence, 4),
                            "variant": item.variant,
                            "coverage": round(
                                reading_coverage(item.text, ISO_EXPECTED_LENGTH), 3
                            ),
                        }
                        for item in region_readings[:60]
                    ],
                )
        except Exception as error:  # noqa: BLE001 - OCR non bloquant
            ocr_error = str(error)
        # Zones triees par confiance : des qu'une zone donne un matricule
        # valide et fiable, il est inutile de derouler le pipeline (couteux en
        # vertical) sur les zones secondaires, souvent des detections parasites.
        if _has_reliable_iso(all_readings):
            break

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
    # Lecture brute a afficher : on privilegie la plus COMPLETE (couverture),
    # pas le fragment le plus confiant. Sinon un "31005" lu a 0.75 masquerait un
    # "TE203108252" lu a 0.72, alors que ce dernier est bien plus utile a
    # l'operateur pour corriger le matricule a la main.
    best_raw = max(
        all_readings,
        key=lambda item: (reading_coverage(item.text, ISO_EXPECTED_LENGTH), item.confidence),
        default=None,
    )
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
                # tracabilite : combien de substitutions OCR ont ete necessaires
                "corrections": region_best["corrections"] if region_best else None,
                "orientation": bbox_orientation(region["bbox"]),
            }
        )

    if not best_valid:
        # Confiance metier : le score brut de l'OCR ne dit rien de la validite
        # d'une lecture partielle. Un fragment de trois caracteres lu a 95 % ne
        # doit pas s'afficher comme une lecture fiable du matricule.
        reliability = (
            reading_reliability(best_raw.confidence, best_raw.text, ISO_EXPECTED_LENGTH)
            if best_raw
            else 0.0
        )
        return _empty_result(
            "yolo_no_valid_iso",
            "La zone du matricule a ete detectee, mais les caracteres n'ont pas pu "
            "etre lus avec fiabilite. Verifiez l'image ou corrigez la valeur manuellement.",
            raw_ocr_text=best_raw.text if best_raw else None,
            confidence=combine_confidences(primary["yolo_confidence"], reliability),
            yolo_confidence=round(primary["yolo_confidence"], 4),
            ocr_confidence=reliability if best_raw else None,
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
        "detection_mode": _success_mode(),
        "ocr_variant": reading.variant,
        "bbox": selected_region["bbox"],
        "detections": detection_payloads,
        "message": "Code conteneur detecte et valide.",
        "warning": ocr_error,
    }


def _model_metadata() -> dict:
    return {
        "model_version": _active_model_version,
        "fallback_in_use": _fallback_in_use,
        "model_warning": _model_warning,
    }


def _finalize(result: dict) -> dict:
    warnings: list[str] = []
    for key in ("warning", "iso_type_warning", "model_warning"):
        value = result.get(key)
        if value and value not in warnings:
            warnings.append(value)
    result["warnings"] = warnings
    return result


def _business_message(result: dict) -> str:
    """Message metier coherent avec les deux resultats simultanement.

    Le matricule et le code taille/type sont independants : le message doit
    refleter la combinaison reelle, sans jamais laisser croire qu'une lecture
    partielle est fiable.
    """
    has_iso = bool(result.get("is_valid_iso"))
    has_type = bool(result.get("is_valid_iso_type_format"))
    mode = result.get("detection_mode")

    if has_iso and has_type:
        return "Matricule et code taille/type reconnus et verifies."
    if has_iso and not has_type:
        return (
            "Le matricule a ete valide. Le code taille/type n'a pas ete reconnu "
            "et peut etre renseigne manuellement."
        )
    if has_type and not has_iso:
        return (
            "Le code taille/type a ete reconnu. Le matricule doit etre verifie "
            "ou corrige."
        )
    if mode == "no_detection":
        return result.get("message") or "Aucune information n'a pu etre extraite de l'image."
    return (
        "Les informations du conteneur n'ont pas pu etre lues avec fiabilite. "
        "Verifiez l'image ou saisissez les valeurs manuellement."
    )


def _annotate_detections(image: Image.Image, detections: list[dict]) -> Image.Image:
    """Copie annotee de l'image, pour le mode diagnostic local uniquement."""
    from PIL import ImageDraw

    annotated = image.copy()
    draw = ImageDraw.Draw(annotated)
    colors = {"container_number": (0, 255, 0), "iso_type": (0, 128, 255)}
    for detection in detections:
        bbox = detection["bbox"]
        draw.rectangle(
            [bbox["x1"], bbox["y1"], bbox["x2"], bbox["y2"]],
            outline=colors.get(detection.get("kind"), (255, 0, 0)),
            width=2,
        )
    return annotated


def detect_container(image_bytes: bytes) -> dict:
    image = decode_image(image_bytes)
    recorder = DebugRecorder()
    try:
        all_detections = run_yolo_detections(image)
    except ModelUnavailableError as error:
        if settings.fallback_enabled:
            return build_fallback_result(str(error))
        raise

    for detection in all_detections:
        if not detection.get("kind"):
            detection["kind"] = classify_kind(detection.get("class_name"))

    container_regions = _regions_of_kind(all_detections, "container_number")
    iso_type_regions = _regions_of_kind(all_detections, "iso_type")

    if recorder.enabled:
        recorder.save_image("original_annotated", _annotate_detections(image, all_detections))
        recorder.log(
            "yolo",
            image_size=list(image.size),
            detections=[
                {
                    "kind": item.get("kind"),
                    "class_name": item.get("class_name"),
                    "yolo_confidence": round(item["yolo_confidence"], 4),
                    "bbox": item["bbox"],
                    "orientation": bbox_orientation(item["bbox"]),
                }
                for item in all_detections
            ],
        )

    # Association spatiale : on ne rapproche le code taille/type du matricule
    # que si les deux zones sont geometriquement coherentes, afin de ne jamais
    # associer le matricule d'un conteneur avec le type d'un autre.
    associated = (
        associate_regions(container_regions[0]["bbox"], iso_type_regions)
        if container_regions and iso_type_regions
        else None
    )

    result = _process_container_number(image, container_regions, recorder)
    result.update(_process_iso_type(image, iso_type_regions, associated, recorder))
    result.update(_model_metadata())
    result["message"] = _business_message(result)

    if recorder.enabled:
        recorder.log(
            "result",
            detected_iso=result.get("detected_iso"),
            iso_type=result.get("iso_type"),
            detection_mode=result.get("detection_mode"),
            confidence=result.get("confidence"),
        )
        recorder.flush()
    return _finalize(result)


def detect_container_from_image(image_content: bytes, content_type: str | None = None) -> dict:
    """Backward-compatible entry point used by the FastAPI controller."""
    return detect_container(image_content)


def get_runtime_status() -> dict:
    yolo_available = importlib.util.find_spec("ultralytics") is not None
    ocr_available = importlib.util.find_spec("paddleocr") is not None
    configured_version = getattr(settings, "active_model_version", "v2")

    v1_path = getattr(settings, "v1_model_path", None)
    v2_path = getattr(settings, "v2_model_path", None)
    v1_exists = bool(v1_path and Path(v1_path).exists())
    v2_exists = bool(v2_path and Path(v2_path).exists())
    fallback_model_available = v1_exists if configured_version == "v2" else v2_exists

    return {
        "model_path": settings.public_model_path,
        "model_exists": settings.model_path.exists(),
        "model_version": configured_version,
        "active_model": _active_model_version or configured_version,
        "model_classes": _model_classes,
        "model_loaded": _yolo_model is not None,
        "model_error": _yolo_load_error or (None if yolo_available else "ultralytics non installe"),
        "model_warning": _model_warning,
        "fallback_enabled": settings.fallback_enabled,
        "fallback_model_available": fallback_model_available,
        "fallback_in_use": _fallback_in_use,
        "yolo_available": yolo_available,
        "ocr_enabled": settings.ocr_enabled,
        "ocr_available": ocr_available,
        "ocr_loaded": _ocr_engine is not None,
        "ocr_engine": settings.ocr_engine,
        "ocr_error": _ocr_load_error or (None if ocr_available else "paddleocr non installe"),
        "device": settings.device,
    }
