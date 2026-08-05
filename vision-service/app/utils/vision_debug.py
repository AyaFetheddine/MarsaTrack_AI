"""Mode diagnostic local des crops Vision, desactive par defaut.

Active uniquement via `VISION_DEBUG_SAVE_CROPS=true`, il ecrit dans un dossier
local ignore par Git :

  <VISION_DEBUG_OUTPUT_DIR>/<request_id>/
      00_original.png          image annotee des boites YOLO
      01_<zone>_<variante>.png chaque crop et chaque variante essayee
      trace.json               boites, orientations, marges, lectures OCR,
                               candidats, corrections, raison de selection

Regles de securite respectees :
  - l'identifiant de requete est un UUID aleatoire, sans nom de fichier
    d'origine, sans horodatage exploitable et sans donnee utilisateur ;
  - aucun chemin absolu Windows n'est ecrit dans la trace ni renvoye par
    l'API : seuls des chemins relatifs au service apparaissent ;
  - aucune route HTTP n'expose ce dossier.
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from app.config import settings


def new_request_id() -> str:
    """Identifiant court, aleatoire et non sensible."""
    return uuid.uuid4().hex[:12]


def _sanitize(name: str) -> str:
    keep = [character if character.isalnum() or character in "-_" else "_" for character in name]
    return "".join(keep)[:60] or "item"


class DebugRecorder:
    """Enregistre les etapes du pipeline quand le mode debug est actif.

    Quand il est inactif (cas par defaut), toutes les methodes sont des
    non-operations : aucun cout, aucune ecriture disque.
    """

    def __init__(self, enabled: bool | None = None, output_dir: Path | None = None):
        configured = getattr(settings, "debug_save_crops", False)
        self.enabled = configured if enabled is None else enabled
        self.request_id = new_request_id()
        self.steps: list[dict] = []
        self._index = 0
        self._directory: Path | None = None

        if self.enabled:
            root = output_dir or getattr(settings, "debug_output_dir", Path("debug"))
            self._directory = Path(root) / self.request_id

    @property
    def directory(self) -> Path | None:
        return self._directory

    def _ensure_directory(self) -> Path | None:
        if not self.enabled or self._directory is None:
            return None
        try:
            self._directory.mkdir(parents=True, exist_ok=True)
        except OSError:
            self.enabled = False
            return None
        return self._directory

    def save_image(self, name: str, image: Any) -> str | None:
        """Ecrit une image de diagnostic. Retourne son nom de fichier relatif."""
        directory = self._ensure_directory()
        if directory is None or image is None:
            return None
        filename = f"{self._index:02d}_{_sanitize(name)}.png"
        self._index += 1
        try:
            image.save(directory / filename)
        except (OSError, ValueError, AttributeError):
            return None
        return filename

    def log(self, step: str, **data: Any) -> None:
        """Ajoute une etape a la trace (boites, marges, OCR, decisions)."""
        if not self.enabled:
            return
        self.steps.append({"step": step, **data})

    def flush(self) -> str | None:
        """Ecrit la trace JSON. Retourne un chemin relatif au service."""
        directory = self._ensure_directory()
        if directory is None:
            return None
        payload = {"request_id": self.request_id, "steps": self.steps}
        try:
            (directory / "trace.json").write_text(
                json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
            )
        except OSError:
            return None
        resolver = getattr(settings, "public_path_of", None)
        if callable(resolver):
            return resolver(directory)
        return directory.name
