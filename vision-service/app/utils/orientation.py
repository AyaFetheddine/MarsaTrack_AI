"""Analyse geometrique des zones de texte : orientation, colonnes, association.

Ce module est volontairement sans dependance a PIL, YOLO ou PaddleOCR : il ne
manipule que des nombres et des fragments de texte. Il reste donc entierement
testable unitairement, sans modele ni image.

Il repond a trois besoins du pipeline Vision :

1. Classer une zone comme horizontale, verticale ou incertaine, en croisant le
   ratio de la boite et la geometrie reelle des fragments OCR (le ratio seul
   n'est pas fiable : une boite large peut contenir du texte vertical, et un
   modele mal calibre peut produire une boite trop serree).
2. Reconstruire un texte a partir de fragments disperses : regroupement par
   colonne, tri de haut en bas, separation de deux colonnes voisines.
3. Associer une zone matricule et une zone taille/type qui appartiennent
   reellement au meme conteneur.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from statistics import median

HORIZONTAL = "horizontal"
VERTICAL = "vertical"
UNCERTAIN = "uncertain"

DEFAULT_VERTICAL_RATIO_THRESHOLD = 1.6
# Marge de dominance exigee avant de conclure a partir des seuls fragments.
FRAGMENT_DOMINANCE = 1.5


@dataclass
class TextFragment:
    """Un fragment lu par l'OCR, avec sa geometrie locale si disponible."""

    text: str
    confidence: float = 0.0
    x1: float = 0.0
    y1: float = 0.0
    x2: float = 0.0
    y2: float = 0.0
    has_geometry: bool = True

    @property
    def width(self) -> float:
        return max(0.0, self.x2 - self.x1)

    @property
    def height(self) -> float:
        return max(0.0, self.y2 - self.y1)

    @property
    def center_x(self) -> float:
        return (self.x1 + self.x2) / 2

    @property
    def center_y(self) -> float:
        return (self.y1 + self.y2) / 2


@dataclass
class ReconstructedColumn:
    """Une colonne de fragments reconstruite, triee de haut en bas."""

    text: str
    confidence: float
    center_x: float
    top: float
    bottom: float
    fragments: list[TextFragment] = field(default_factory=list)

    @property
    def length(self) -> int:
        return len(self.text)


# ─── 1. Orientation ──────────────────────────────────────────────────────────
def classify_box_orientation(
    width: float,
    height: float,
    threshold: float = DEFAULT_VERTICAL_RATIO_THRESHOLD,
) -> str:
    """Oriente une boite a partir de son seul ratio hauteur/largeur."""
    if width <= 0 or height <= 0 or threshold <= 0:
        return UNCERTAIN
    ratio = height / width
    if ratio >= threshold:
        return VERTICAL
    if ratio <= 1 / threshold:
        return HORIZONTAL
    return UNCERTAIN


def classify_fragment_orientation(fragments: list[TextFragment] | None) -> str:
    """Oriente une zone a partir de la dispersion des centres de fragments.

    Un texte vertical produit des fragments empiles : la dispersion en Y
    domine largement la dispersion en X. L'inverse pour un texte horizontal.
    """
    usable = [f for f in (fragments or []) if f.has_geometry]
    if len(usable) < 2:
        # Un fragment unique : on se rabat sur sa propre forme.
        if len(usable) == 1 and usable[0].width > 0 and usable[0].height > 0:
            return classify_box_orientation(usable[0].width, usable[0].height)
        return UNCERTAIN

    spread_x = max(f.center_x for f in usable) - min(f.center_x for f in usable)
    spread_y = max(f.center_y for f in usable) - min(f.center_y for f in usable)

    if spread_y > spread_x * FRAGMENT_DOMINANCE:
        return VERTICAL
    if spread_x > spread_y * FRAGMENT_DOMINANCE:
        return HORIZONTAL
    return UNCERTAIN


def classify_orientation(
    width: float,
    height: float,
    fragments: list[TextFragment] | None = None,
    threshold: float = DEFAULT_VERTICAL_RATIO_THRESHOLD,
) -> str:
    """Combine ratio de boite et geometrie OCR.

    En cas de desaccord, la geometrie des fragments l'emporte : elle decrit le
    texte reellement lu, alors que le ratio ne decrit que la boite proposee.
    """
    by_box = classify_box_orientation(width, height, threshold)
    by_fragments = classify_fragment_orientation(fragments)

    if by_fragments == UNCERTAIN:
        return by_box
    if by_box == UNCERTAIN:
        return by_fragments
    return by_fragments


# ─── 2. Reconstruction spatiale ──────────────────────────────────────────────
def group_fragments_into_columns(
    fragments: list[TextFragment] | None,
    tolerance_ratio: float = 0.8,
) -> list[list[TextFragment]]:
    """Regroupe les fragments en colonnes selon leur centre X.

    La tolerance est proportionnelle a la largeur mediane des fragments : elle
    s'adapte donc a la taille des caracteres sans constante magique en pixels.
    Deux colonnes voisines (matricule et taille/type) restent separees.
    """
    usable = [f for f in (fragments or []) if f.has_geometry]
    if not usable:
        return []

    widths = [f.width for f in usable if f.width > 0]
    tolerance = max(1.0, median(widths) * tolerance_ratio) if widths else 1.0

    columns: list[list[TextFragment]] = []
    centers: list[float] = []
    for fragment in sorted(usable, key=lambda item: item.center_x):
        placed = False
        for index, center in enumerate(centers):
            if abs(fragment.center_x - center) <= tolerance:
                columns[index].append(fragment)
                # moyenne glissante : la colonne se recentre au fil des ajouts
                centers[index] = sum(f.center_x for f in columns[index]) / len(columns[index])
                placed = True
                break
        if not placed:
            columns.append([fragment])
            centers.append(fragment.center_x)
    return columns


def sort_column_top_down(column: list[TextFragment]) -> list[TextFragment]:
    """Trie une colonne de haut en bas (puis de gauche a droite a egalite)."""
    return sorted(column, key=lambda item: (item.center_y, item.center_x))


def sort_row_left_right(row: list[TextFragment]) -> list[TextFragment]:
    """Trie une ligne de gauche a droite (puis de haut en bas a egalite)."""
    return sorted(row, key=lambda item: (item.center_x, item.center_y))


def build_column(column: list[TextFragment]) -> ReconstructedColumn:
    """Assemble une colonne triee en un texte unique et sa confiance."""
    ordered = sort_column_top_down(column)
    text = "".join(fragment.text for fragment in ordered)
    confidence = min((fragment.confidence for fragment in ordered), default=0.0)
    centers = [fragment.center_x for fragment in ordered]
    return ReconstructedColumn(
        text=text,
        confidence=confidence,
        center_x=sum(centers) / len(centers) if centers else 0.0,
        top=min((fragment.y1 for fragment in ordered), default=0.0),
        bottom=max((fragment.y2 for fragment in ordered), default=0.0),
        fragments=ordered,
    )


def reconstruct_columns(
    fragments: list[TextFragment] | None,
    tolerance_ratio: float = 0.8,
) -> list[ReconstructedColumn]:
    """Reconstruit toutes les colonnes, la plus longue en premier.

    La colonne la plus longue est la candidate naturelle pour le matricule,
    une colonne courte de 4 caracteres pour le code taille/type. Le choix final
    reste fait par le validateur ISO, jamais par cette fonction.
    """
    columns = [build_column(column) for column in group_fragments_into_columns(fragments, tolerance_ratio)]
    return sorted(columns, key=lambda column: (-column.length, column.center_x))


def reconstruct_reading_order(
    fragments: list[TextFragment] | None,
    orientation: str,
    tolerance_ratio: float = 0.8,
) -> list[str]:
    """Retourne les textes candidats issus d'une reconstruction spatiale.

    - vertical : une chaine par colonne, plus la concatenation des colonnes
      dans l'ordre de lecture (gauche vers droite) en dernier recours ;
    - horizontal / incertain : une seule chaine triee de gauche a droite.

    Aucune concatenation aveugle : l'ordre vient toujours de la geometrie.
    """
    usable = [f for f in (fragments or []) if f.has_geometry]
    if not usable:
        return []

    if orientation == VERTICAL:
        columns = reconstruct_columns(usable, tolerance_ratio)
        candidates = [column.text for column in columns if column.text]
        if len(columns) > 1:
            ordered = sorted(columns, key=lambda column: column.center_x)
            candidates.append("".join(column.text for column in ordered))
        return candidates

    return ["".join(fragment.text for fragment in sort_row_left_right(usable))]


# ─── 3. Association spatiale ─────────────────────────────────────────────────
def _box_center(bbox: dict) -> tuple[float, float]:
    return (bbox["x1"] + bbox["x2"]) / 2, (bbox["y1"] + bbox["y2"]) / 2


def _box_diagonal(bbox: dict) -> float:
    width = max(0.0, bbox["x2"] - bbox["x1"])
    height = max(0.0, bbox["y2"] - bbox["y1"])
    return max(1.0, (width**2 + height**2) ** 0.5)


def region_distance(first: dict, second: dict) -> float:
    """Distance euclidienne entre les centres de deux boites."""
    x1, y1 = _box_center(first)
    x2, y2 = _box_center(second)
    return ((x1 - x2) ** 2 + (y1 - y2) ** 2) ** 0.5


def associate_regions(
    reference_bbox: dict,
    candidate_regions: list[dict] | None,
    max_distance_factor: float = 3.0,
) -> dict | None:
    """Choisit la zone candidate qui appartient au meme conteneur.

    Le critere est la distance des centres, normalisee par la diagonale de la
    zone de reference : une zone taille/type situee a plusieurs longueurs de
    matricule appartient probablement a un autre conteneur et est ecartee.
    A distance comparable, la confiance YOLO departage.
    """
    if not candidate_regions:
        return None

    limit = _box_diagonal(reference_bbox) * max_distance_factor
    scored = []
    for region in candidate_regions:
        distance = region_distance(reference_bbox, region["bbox"])
        if distance <= limit:
            scored.append((distance, region))

    if not scored:
        return None
    return min(
        scored,
        key=lambda item: (round(item[0], 3), -item[1].get("yolo_confidence", 0.0)),
    )[1]
