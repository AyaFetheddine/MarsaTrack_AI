"""Validation structuree du code taille/type ISO 6346 (4 caracteres).

Ce module ne pretend PAS implementer la table officielle complete ISO 6346.
Premier lot : validation stricte de la structure, interpretation des codes
connus via des mappings extensibles, et warning metier clair lorsqu'un code
est structurellement valide mais dont le libelle detaille n'est pas connu.

Structure d'un code taille/type (ex: 22G1) :
  - position 0 : code de longueur           (length_code)  -> "2"
  - position 1 : code de hauteur/largeur     (height_code)  -> "2"
  - position 2 : groupe de type (une lettre) (type_group)   -> "G"
  - position 3 : detail de type              (type_detail)  -> "1"
"""

import re

# Format structurel : 4 caracteres alphanumeriques, le 3e (groupe de type)
# etant obligatoirement une lettre. Volontairement permissif sur les autres
# positions pour rester extensible sans table officielle exhaustive.
ISO_SIZE_TYPE_FORMAT = re.compile(r"^[0-9A-Z]{2}[A-Z][0-9A-Z]$")

# --- Mappings extensibles (a completer au fil du projet) ---------------------
# 1re position : code de longueur.
LENGTH_CODES = {
    "1": "10 pieds",
    "2": "20 pieds",
    "3": "30 pieds",
    "4": "40 pieds",
    "L": "45 pieds",
    "M": "48 pieds",
    "N": "49 pieds",
}

# 2e position : code de hauteur (et largeur). Les valeurs "5" et "6" designent
# des conteneurs "High Cube" (2896 mm). Table volontairement centree sur les
# codes courants ; les codes de largeur etendue (C, D, E, F, ...) restent a
# completer si besoin.
HEIGHT_WIDTH_CODES = {
    "0": '8\'0" (2438 mm)',
    "2": '8\'6" (2591 mm)',
    "4": '9\'0" (2743 mm)',
    "5": '9\'6" (2896 mm) — High Cube',
    "6": 'supérieur à 9\'6" (2896 mm) — High Cube',
    "8": '4\'3" (1295 mm)',
    "9": 'inférieur à 4\'0" (1219 mm)',
}

# 3e position : groupe de type. Une lettre normée ISO 6346.
TYPE_GROUP_CODES = {
    "G": "Conteneur général (dry)",
    "V": "Conteneur ventilé",
    "R": "Conteneur frigorifique (reefer)",
    "H": "Conteneur isotherme / frigorifique (équipement amovible)",
    "U": "Open top (toit ouvert)",
    "P": "Plateau / flat rack",
    "T": "Citerne (tank)",
    "B": "Vrac (bulk)",
    "S": "Cargaison spécifique (bétail, véhicules, ...)",
    "A": "Usage général (air / surface)",
    "K": "Citerne / usage spécifique",
}

# Groupes de type a temperature controlee : necessitent une alimentation
# electrique (branchement reefer) une fois places.
POWERED_TYPE_GROUPS = {"R", "H"}


def normalize_iso_size_type(value: str | None) -> str:
    """Nettoie une lecture OCR : majuscules, sans espaces/tirets/parasites."""
    if not isinstance(value, str):
        return ""
    return re.sub(r"[^A-Z0-9]", "", value.upper())


def validate_iso_size_type_format(value: str | None) -> bool:
    """True si la structure taille/type est valide (4 car., 3e = lettre)."""
    return bool(ISO_SIZE_TYPE_FORMAT.match(normalize_iso_size_type(value)))


def parse_iso_size_type(value: str | None) -> dict:
    """Retourne une structure claire et extensible pour un code taille/type."""
    normalized = normalize_iso_size_type(value)

    if not ISO_SIZE_TYPE_FORMAT.match(normalized):
        return {
            "value": normalized,
            "is_valid_format": False,
            "length_code": None,
            "height_code": None,
            "type_group": None,
            "type_detail": None,
            "length_label": None,
            "height_label": None,
            "type_label": None,
            "warning": "Format taille/type invalide : 4 caracteres attendus (ex: 22G1).",
        }

    length_code, height_code, type_group, type_detail = (
        normalized[0],
        normalized[1],
        normalized[2],
        normalized[3],
    )
    length_label = LENGTH_CODES.get(length_code)
    height_label = HEIGHT_WIDTH_CODES.get(height_code)
    type_label = TYPE_GROUP_CODES.get(type_group)

    unknown = [
        label
        for value_present, label in (
            (length_label, "longueur"),
            (height_label, "hauteur/largeur"),
            (type_label, "groupe de type"),
        )
        if value_present is None
    ]
    warning = (
        None
        if not unknown
        else (
            "Code taille/type structurellement valide, mais libelle detaille "
            f"inconnu pour : {', '.join(unknown)}."
        )
    )

    return {
        "value": normalized,
        "is_valid_format": True,
        "length_code": length_code,
        "height_code": height_code,
        "type_group": type_group,
        "type_detail": type_detail,
        "length_label": length_label,
        "height_label": height_label,
        "type_label": type_label,
        # Conteneur a temperature controlee : a brancher une fois place.
        "requires_power": type_group in POWERED_TYPE_GROUPS,
        "warning": warning,
    }
