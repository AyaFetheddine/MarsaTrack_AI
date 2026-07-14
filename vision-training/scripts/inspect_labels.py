#!/usr/bin/env python3
"""Create visual samples with YOLO labels drawn on images."""

from __future__ import annotations

import argparse
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
CLASS_NAME = "container_code"


def load_annotations(label_path: Path) -> list[tuple[float, float, float, float]]:
    if not label_path.exists() or not label_path.read_text(encoding="utf-8").strip():
        return []

    annotations = []
    for raw_line in label_path.read_text(encoding="utf-8").splitlines():
        parts = raw_line.strip().split()
        if len(parts) != 5 or parts[0] != "0":
            continue
        x_center, y_center, width, height = (float(value) for value in parts[1:])
        annotations.append((x_center, y_center, width, height))
    return annotations


def draw_boxes(image_path: Path, label_path: Path, output_path: Path) -> None:
    with Image.open(image_path).convert("RGB") as image:
        draw = ImageDraw.Draw(image)
        image_width, image_height = image.size

        for x_center, y_center, width, height in load_annotations(label_path):
            box_width = width * image_width
            box_height = height * image_height
            x1 = x_center * image_width - box_width / 2
            y1 = y_center * image_height - box_height / 2
            x2 = x_center * image_width + box_width / 2
            y2 = y_center * image_height + box_height / 2

            draw.rectangle((x1, y1, x2, y2), outline=(0, 153, 204), width=4)
            label = CLASS_NAME
            text_bbox = draw.textbbox((x1, y1), label, font=ImageFont.load_default())
            text_width = text_bbox[2] - text_bbox[0]
            text_height = text_bbox[3] - text_bbox[1]
            draw.rectangle((x1, max(0, y1 - text_height - 8), x1 + text_width + 10, y1), fill=(0, 56, 130))
            draw.text((x1 + 5, max(0, y1 - text_height - 5)), label, fill=(255, 255, 255))

        output_path.parent.mkdir(parents=True, exist_ok=True)
        image.save(output_path)


def main() -> int:
    parser = argparse.ArgumentParser(description="Genere des apercus annotees du dataset YOLO.")
    parser.add_argument("--dataset", required=True, help="Chemin du dossier dataset.")
    parser.add_argument("--split", default="train", choices=("train", "val", "test"))
    parser.add_argument("--count", type=int, default=12)
    parser.add_argument("--output", required=True, help="Dossier de sortie dans results/.")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    dataset = Path(args.dataset)
    image_dir = dataset / "images" / args.split
    label_dir = dataset / "labels" / args.split
    output_dir = Path(args.output)

    if not image_dir.exists() or not label_dir.exists():
        print("Dossiers images/labels introuvables pour le split demande.")
        return 1

    images = sorted(image for image in image_dir.iterdir() if image.is_file() and image.suffix.lower() in IMAGE_EXTENSIONS)
    if not images:
        print("Aucune image a inspecter.")
        return 1

    random.seed(args.seed)
    sample = random.sample(images, k=min(args.count, len(images)))

    for image_path in sample:
        output_path = output_dir / f"{image_path.stem}_inspect.jpg"
        draw_boxes(image_path, label_dir / f"{image_path.stem}.txt", output_path)
        print(f"Apercu genere : {output_path}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
