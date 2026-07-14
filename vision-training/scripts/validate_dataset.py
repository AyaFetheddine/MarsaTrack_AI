#!/usr/bin/env python3
"""Validate a YOLO dataset for the MarsaTrack AI container_code task."""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
SPLITS = ("train", "val", "test")


def iter_files(path: Path, extensions: Iterable[str]) -> list[Path]:
    allowed = {ext.lower() for ext in extensions}
    return sorted(file for file in path.iterdir() if file.is_file() and file.suffix.lower() in allowed)


def validate_label_file(label_path: Path) -> tuple[list[str], int]:
    errors: list[str] = []
    box_count = 0

    content = label_path.read_text(encoding="utf-8").strip()
    if not content:
        return errors, box_count

    for line_number, raw_line in enumerate(content.splitlines(), start=1):
        line = raw_line.strip()
        if not line:
            continue

        parts = line.split()
        if len(parts) != 5:
            errors.append(f"{label_path}:{line_number} doit contenir exactement 5 valeurs.")
            continue

        class_id = parts[0]
        if class_id != "0":
            errors.append(f"{label_path}:{line_number} class_id doit etre 0, recu {class_id}.")

        try:
            x_center, y_center, width, height = (float(value) for value in parts[1:])
        except ValueError:
            errors.append(f"{label_path}:{line_number} coordonnees non numeriques.")
            continue

        values = {
            "x_center": x_center,
            "y_center": y_center,
            "width": width,
            "height": height,
        }

        for name, value in values.items():
            if value < 0 or value > 1:
                errors.append(f"{label_path}:{line_number} {name} doit etre entre 0 et 1.")

        if width <= 0:
            errors.append(f"{label_path}:{line_number} width doit etre strictement positif.")
        if height <= 0:
            errors.append(f"{label_path}:{line_number} height doit etre strictement positif.")

        box_count += 1

    return errors, box_count


def validate_dataset(dataset: Path) -> int:
    errors: list[str] = []
    split_stats: dict[str, dict[str, int]] = {}

    for root in ("images", "labels"):
        root_path = dataset / root
        if not root_path.exists():
            errors.append(f"Dossier manquant : {root_path}")
            continue
        for split in SPLITS:
            split_path = root_path / split
            if not split_path.exists():
                errors.append(f"Dossier manquant : {split_path}")

    if errors:
        print("Erreurs de structure :")
        for error in errors:
            print(f"- {error}")
        return 1

    total_images = 0
    total_boxes = 0

    for split in SPLITS:
        image_dir = dataset / "images" / split
        label_dir = dataset / "labels" / split

        image_files = iter_files(image_dir, IMAGE_EXTENSIONS)
        label_files = sorted(label_dir.glob("*.txt"))

        image_stems = {image.stem for image in image_files}
        label_stems = {label.stem for label in label_files}

        split_boxes = 0

        for image in image_dir.iterdir():
            if image.is_file() and image.suffix.lower() not in IMAGE_EXTENSIONS:
                errors.append(f"Extension image non acceptee : {image}")

        for stem in sorted(image_stems - label_stems):
            errors.append(f"Image sans label : {image_dir / (stem + '.*')}")

        for stem in sorted(label_stems - image_stems):
            errors.append(f"Label orphelin : {label_dir / (stem + '.txt')}")

        for label_file in label_files:
            label_errors, box_count = validate_label_file(label_file)
            errors.extend(label_errors)
            split_boxes += box_count

        split_stats[split] = {
            "images": len(image_files),
            "labels": len(label_files),
            "boxes": split_boxes,
        }
        total_images += len(image_files)
        total_boxes += split_boxes

    print("Rapport dataset YOLO - MarsaTrack AI")
    print("=" * 44)
    print(f"Dataset : {dataset.resolve()}")
    print(f"Images totales : {total_images}")
    print(f"Bounding boxes totales : {total_boxes}")
    print()

    for split in SPLITS:
        stats = split_stats[split]
        percent = (stats["images"] / total_images * 100) if total_images else 0
        print(
            f"{split:5} | images: {stats['images']:4} | labels: {stats['labels']:4} | "
            f"boxes: {stats['boxes']:4} | {percent:5.1f}%"
        )

    if errors:
        print()
        print("Erreurs bloquantes :")
        for error in errors:
            print(f"- {error}")
        return 1

    print()
    print("Dataset valide.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Valide un dataset YOLO container_code.")
    parser.add_argument("--dataset", required=True, help="Chemin du dossier dataset.")
    args = parser.parse_args()
    return validate_dataset(Path(args.dataset))


if __name__ == "__main__":
    raise SystemExit(main())
