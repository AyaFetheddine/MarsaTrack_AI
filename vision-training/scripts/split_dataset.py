#!/usr/bin/env python3
"""Split a YOLO source dataset into train/val/test folders."""

from __future__ import annotations

import argparse
import hashlib
import random
import shutil
from pathlib import Path


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
SPLITS = ("train", "val", "test")


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def prepare_output(output: Path) -> None:
    for root in ("images", "labels"):
        for split in SPLITS:
            target = output / root / split
            if target.exists() and any(target.iterdir()):
                raise RuntimeError(f"Le dossier existe deja et n'est pas vide : {target}")
            target.mkdir(parents=True, exist_ok=True)


def copy_pair(image: Path, label: Path, output: Path, split: str) -> None:
    shutil.copy2(image, output / "images" / split / image.name)
    shutil.copy2(label, output / "labels" / split / label.name)


def main() -> int:
    parser = argparse.ArgumentParser(description="Separe un dataset YOLO en train/val/test.")
    parser.add_argument("--images", required=True, help="Dossier source des images.")
    parser.add_argument("--labels", required=True, help="Dossier source des labels.")
    parser.add_argument("--output", required=True, help="Dossier dataset cible.")
    parser.add_argument("--train", type=float, default=0.70)
    parser.add_argument("--val", type=float, default=0.20)
    parser.add_argument("--test", type=float, default=0.10)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    ratios_sum = round(args.train + args.val + args.test, 6)
    if ratios_sum != 1:
        print("Les ratios train/val/test doivent totaliser 1.0.")
        return 1

    image_dir = Path(args.images)
    label_dir = Path(args.labels)
    output = Path(args.output)

    if not image_dir.exists() or not label_dir.exists():
        print("Dossier images ou labels source introuvable.")
        return 1

    images = sorted(image for image in image_dir.iterdir() if image.is_file() and image.suffix.lower() in IMAGE_EXTENSIONS)
    if not images:
        print("Aucune image source trouvee.")
        return 1

    seen_hashes: dict[str, Path] = {}
    pairs: list[tuple[Path, Path]] = []
    skipped_duplicates = 0

    for image in images:
        label = label_dir / f"{image.stem}.txt"
        if not label.exists():
            print(f"Label manquant pour {image.name}.")
            return 1

        digest = file_hash(image)
        if digest in seen_hashes:
            skipped_duplicates += 1
            print(f"Doublon evident ignore : {image.name} identique a {seen_hashes[digest].name}")
            continue

        seen_hashes[digest] = image
        pairs.append((image, label))

    prepare_output(output)

    random.seed(args.seed)
    random.shuffle(pairs)

    total = len(pairs)
    train_end = int(total * args.train)
    val_end = train_end + int(total * args.val)

    split_pairs = {
        "train": pairs[:train_end],
        "val": pairs[train_end:val_end],
        "test": pairs[val_end:],
    }

    for split, items in split_pairs.items():
        for image, label in items:
            copy_pair(image, label, output, split)

    print("Split termine.")
    print(f"Images source valides : {total}")
    print(f"Doublons ignores : {skipped_duplicates}")
    for split in SPLITS:
        print(f"{split}: {len(split_pairs[split])} image(s)")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except RuntimeError as error:
        print(error)
        raise SystemExit(1)
