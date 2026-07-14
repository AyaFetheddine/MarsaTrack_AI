import re

LETTER_VALUES = {
    "A": 10,
    "B": 12,
    "C": 13,
    "D": 14,
    "E": 15,
    "F": 16,
    "G": 17,
    "H": 18,
    "I": 19,
    "J": 20,
    "K": 21,
    "L": 23,
    "M": 24,
    "N": 25,
    "O": 26,
    "P": 27,
    "Q": 28,
    "R": 29,
    "S": 30,
    "T": 31,
    "U": 32,
    "V": 34,
    "W": 35,
    "X": 36,
    "Y": 37,
    "Z": 38,
}

CONTAINER_CODE_FORMAT = re.compile(r"^[A-Z]{4}[0-9]{7}$")
CODE_WITHOUT_CHECK_DIGIT_FORMAT = re.compile(r"^[A-Z]{4}[0-9]{6}$")


def normalize_container_code(code: str | None) -> str:
    if not isinstance(code, str):
        return ""

    return re.sub(r"[\s-]", "", code).upper()


def parse_container_code(code: str | None) -> dict:
    normalized = normalize_container_code(code)

    if not CONTAINER_CODE_FORMAT.match(normalized):
        return {
            "normalized": normalized,
            "is_valid_format": False,
        }

    return {
        "normalized": normalized,
        "is_valid_format": True,
        "owner_code": normalized[0:3],
        "category": normalized[3:4],
        "serial_number": normalized[4:10],
        "check_digit": normalized[10:11],
    }


def _get_character_value(character: str) -> int | None:
    if character.isdigit():
        return int(character)

    return LETTER_VALUES.get(character)


def calculate_check_digit(code_without_check_digit: str | None) -> str | None:
    normalized = normalize_container_code(code_without_check_digit)

    if not CODE_WITHOUT_CHECK_DIGIT_FORMAT.match(normalized):
        return None

    total = 0
    for index, character in enumerate(normalized):
        value = _get_character_value(character)
        if value is None:
            return None
        total += value * (2**index)

    remainder = total % 11
    return "0" if remainder == 10 else str(remainder)


def validate_container_code(code: str | None) -> dict:
    parsed = parse_container_code(code)

    if not parsed["is_valid_format"]:
        return {
            "normalized": parsed["normalized"],
            "is_valid_format": False,
            "is_valid_check_digit": False,
            "is_valid": False,
            "message": "Format ISO 6346 invalide.",
        }

    expected_check_digit = calculate_check_digit(parsed["normalized"][0:10])
    is_valid_check_digit = parsed["check_digit"] == expected_check_digit

    return {
        **parsed,
        "is_valid_check_digit": is_valid_check_digit,
        "is_valid": is_valid_check_digit,
        "expected_check_digit": expected_check_digit,
        "message": (
            "Code ISO 6346 valide."
            if is_valid_check_digit
            else "Chiffre de controle ISO 6346 invalide."
        ),
    }
