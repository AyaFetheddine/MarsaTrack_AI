import pytest

from app.utils.iso_size_type import (
    normalize_iso_size_type,
    parse_iso_size_type,
    validate_iso_size_type_format,
)


@pytest.mark.parametrize("value", ["22G1", "22G0", "42G1", "45G1", "45R1", "22R1"])
def test_valid_known_codes(value):
    assert validate_iso_size_type_format(value) is True
    parsed = parse_iso_size_type(value)
    assert parsed["is_valid_format"] is True
    assert parsed["value"] == value
    assert parsed["length_code"] == value[0]
    assert parsed["height_code"] == value[1]
    assert parsed["type_group"] == value[2]
    assert parsed["type_detail"] == value[3]


def test_parse_details_labels_known():
    parsed = parse_iso_size_type("22G1")
    assert parsed["length_label"] == "20 pieds"
    assert parsed["type_group"] == "G"
    assert parsed["type_label"] is not None
    assert parsed["warning"] is None


def test_empty_value_is_invalid():
    parsed = parse_iso_size_type("")
    assert parsed["is_valid_format"] is False
    assert parsed["type_group"] is None
    assert parsed["warning"] is not None


def test_wrong_length_is_invalid():
    assert validate_iso_size_type_format("22G") is False
    assert validate_iso_size_type_format("22G12") is False


def test_invalid_characters():
    # 3e position doit etre une lettre (groupe de type).
    assert validate_iso_size_type_format("2251") is False
    assert validate_iso_size_type_format("22@1") is False


def test_normalize_spaces_and_newlines():
    assert normalize_iso_size_type("22 G1") == "22G1"
    assert normalize_iso_size_type("22\nG1") == "22G1"
    assert normalize_iso_size_type(" 2-2-G-1 ") == "22G1"
    assert validate_iso_size_type_format("22 G1") is True
    assert validate_iso_size_type_format("22\nG1") is True


def test_structurally_valid_but_unknown_detail_warns():
    # Groupe de type non reference dans le mapping -> valide mais warning metier.
    parsed = parse_iso_size_type("22X1")
    assert parsed["is_valid_format"] is True
    assert parsed["type_label"] is None
    assert parsed["warning"] is not None


def test_none_value():
    assert normalize_iso_size_type(None) == ""
    assert validate_iso_size_type_format(None) is False
