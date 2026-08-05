"""Tests du module geometrique : orientation, colonnes, association spatiale."""

from app.utils.orientation import (
    HORIZONTAL,
    UNCERTAIN,
    VERTICAL,
    TextFragment,
    associate_regions,
    classify_box_orientation,
    classify_fragment_orientation,
    classify_orientation,
    group_fragments_into_columns,
    reconstruct_columns,
    reconstruct_reading_order,
    region_distance,
    sort_column_top_down,
)


def fragment(text, x, y, width=10, height=12, confidence=0.9):
    return TextFragment(
        text=text,
        confidence=confidence,
        x1=x,
        y1=y,
        x2=x + width,
        y2=y + height,
    )


# ─── Orientation ─────────────────────────────────────────────────────────────
def test_box_orientation_horizontal():
    assert classify_box_orientation(200, 40) == HORIZONTAL


def test_box_orientation_vertical():
    # Cas reel du diagnostic : colonne de 31 x 247 px (ratio 7,95).
    assert classify_box_orientation(31, 247) == VERTICAL


def test_box_orientation_uncertain_when_square():
    assert classify_box_orientation(100, 110) == UNCERTAIN


def test_box_orientation_uncertain_on_degenerate_box():
    assert classify_box_orientation(0, 50) == UNCERTAIN
    assert classify_box_orientation(50, 0) == UNCERTAIN


def test_fragment_orientation_vertical_stack():
    fragments = [fragment("T", 10, 0), fragment("C", 10, 20), fragment("L", 10, 40)]
    assert classify_fragment_orientation(fragments) == VERTICAL


def test_fragment_orientation_horizontal_row():
    fragments = [fragment("BBCU", 0, 10), fragment("217241", 60, 10), fragment("8", 130, 10)]
    assert classify_fragment_orientation(fragments) == HORIZONTAL


def test_fragment_orientation_uncertain_without_geometry():
    fragments = [TextFragment(text="22G1", confidence=0.9, has_geometry=False)]
    assert classify_fragment_orientation(fragments) == UNCERTAIN
    assert classify_fragment_orientation([]) == UNCERTAIN


def test_fragment_geometry_overrides_box_ratio():
    """Une boite large contenant du texte empile reste verticale.

    C'est le point cle : le ratio de la bbox YOLO ne suffit pas a decider.
    """
    fragments = [fragment("4", 50, 0), fragment("2", 50, 30), fragment("G", 50, 60)]
    assert classify_orientation(300, 100, fragments) == VERTICAL


def test_orientation_falls_back_to_box_when_fragments_silent():
    assert classify_orientation(31, 247, []) == VERTICAL
    assert classify_orientation(240, 40, None) == HORIZONTAL


# ─── Colonnes et reconstruction ──────────────────────────────────────────────
def test_single_column_grouping():
    fragments = [fragment("T", 10, 0), fragment("C", 12, 20), fragment("L", 9, 40)]
    assert len(group_fragments_into_columns(fragments)) == 1


def test_two_neighbouring_columns_are_separated():
    """Cas reel : matricule vertical a gauche, code taille/type a droite."""
    matricule = [
        fragment(character, 10, index * 20)
        for index, character in enumerate("TCLU412941")
    ]
    iso_type = [
        fragment(character, 60, index * 20) for index, character in enumerate("42G1")
    ]
    columns = group_fragments_into_columns(matricule + iso_type)
    assert len(columns) == 2
    assert {len(column) for column in columns} == {10, 4}


def test_column_sorted_top_down():
    unordered = [fragment("L", 10, 40), fragment("T", 10, 0), fragment("C", 10, 20)]
    assert [f.text for f in sort_column_top_down(unordered)] == ["T", "C", "L"]


def test_reconstruct_columns_longest_first():
    matricule = [fragment(c, 10, i * 20) for i, c in enumerate("TCLU412941")]
    iso_type = [fragment(c, 60, i * 20) for i, c in enumerate("42G1")]
    columns = reconstruct_columns(matricule + iso_type)
    assert columns[0].text == "TCLU412941"
    assert columns[1].text == "42G1"


def test_reconstruct_column_confidence_is_the_weakest_fragment():
    fragments = [
        fragment("2", 10, 0, confidence=0.95),
        fragment("2", 10, 20, confidence=0.42),
        fragment("G", 10, 40, confidence=0.88),
    ]
    assert reconstruct_columns(fragments)[0].confidence == 0.42


def test_vertical_reconstruction_never_concatenates_blindly():
    """Les fragments sont ordonnes par geometrie, pas par ordre de retour OCR."""
    shuffled = [
        fragment("941", 10, 120),
        fragment("TCLU", 10, 0),
        fragment("412", 10, 60),
    ]
    assert reconstruct_reading_order(shuffled, VERTICAL)[0] == "TCLU412941"


def test_horizontal_reconstruction_sorts_left_to_right():
    shuffled = [fragment("8", 130, 10), fragment("BBCU", 0, 10), fragment("217241", 60, 10)]
    assert reconstruct_reading_order(shuffled, HORIZONTAL) == ["BBCU2172418"]


def test_reconstruction_returns_nothing_without_geometry():
    fragments = [TextFragment(text="22G1", confidence=0.9, has_geometry=False)]
    assert reconstruct_reading_order(fragments, VERTICAL) == []


def test_one_character_per_line_is_reassembled():
    fragments = [fragment(c, 10, i * 18) for i, c in enumerate("MRKU6234191")]
    assert reconstruct_reading_order(fragments, VERTICAL)[0] == "MRKU6234191"


def test_several_characters_per_line_are_reassembled():
    fragments = [fragment("MRKU", 10, 0), fragment("623419", 10, 25), fragment("1", 10, 50)]
    assert reconstruct_reading_order(fragments, VERTICAL)[0] == "MRKU6234191"


# ─── Association spatiale ────────────────────────────────────────────────────
def box(x1, y1, x2, y2):
    return {"x1": x1, "y1": y1, "x2": x2, "y2": y2}


def region(bbox, confidence=0.8):
    return {"bbox": bbox, "yolo_confidence": confidence}


def test_region_distance_is_symmetric():
    first, second = box(0, 0, 10, 10), box(30, 40, 40, 50)
    assert region_distance(first, second) == region_distance(second, first)


def test_nearest_iso_type_is_associated():
    reference = box(352, 51, 383, 297)
    near = region(box(415, 52, 431, 132), 0.7)
    far = region(box(2000, 1800, 2020, 1880), 0.99)
    assert associate_regions(reference, [far, near]) is near


def test_distant_region_is_rejected():
    """Le type d'un autre conteneur ne doit jamais etre associe."""
    reference = box(10, 10, 40, 200)
    far = region(box(3000, 2500, 3030, 2600))
    assert associate_regions(reference, [far]) is None


def test_association_without_candidates():
    assert associate_regions(box(0, 0, 10, 10), []) is None
    assert associate_regions(box(0, 0, 10, 10), None) is None


def test_confidence_breaks_the_tie_at_equal_distance():
    reference = box(0, 0, 100, 100)
    left = region(box(-60, 0, -20, 100), 0.5)
    right = region(box(120, 0, 160, 100), 0.9)
    assert associate_regions(reference, [left, right]) is right
