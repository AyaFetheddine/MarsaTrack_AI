from typing import Any

from pydantic import BaseModel, Field


class BoundingBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float


class DetectionItem(BaseModel):
    bbox: BoundingBox
    yolo_confidence: float
    class_id: int | None = None
    class_name: str | None = None
    kind: str | None = None
    raw_ocr_text: str | None = None
    ocr_confidence: float | None = None
    candidate_iso: str | None = None
    is_valid_iso: bool = False
    candidate_iso_type: str | None = None
    is_valid_iso_type_format: bool = False


class IsoTypeDetails(BaseModel):
    length_code: str | None = None
    height_code: str | None = None
    type_group: str | None = None
    type_detail: str | None = None
    length_label: str | None = None
    height_label: str | None = None
    type_label: str | None = None


class DetectionResult(BaseModel):
    # --- Matricule ISO 6346 (container-number) ---
    detected_iso: str | None = None
    raw_ocr_text: str | None = None
    confidence: float = 0
    yolo_confidence: float | None = None
    ocr_confidence: float | None = None
    is_valid_iso: bool = False
    is_valid_format: bool = False
    is_valid_check_digit: bool = False
    owner_code: str | None = None
    category: str | None = None
    serial_number: str | None = None
    check_digit: str | None = None
    expected_check_digit: str | None = None
    ocr_variant: str | None = None
    bbox: BoundingBox | None = None

    # --- Code taille/type ISO 6346 (iso-type) ---
    iso_type: str | None = None
    raw_iso_type_ocr_text: str | None = None
    iso_type_confidence: float | None = None
    iso_type_yolo_confidence: float | None = None
    iso_type_ocr_confidence: float | None = None
    is_valid_iso_type_format: bool = False
    iso_type_details: IsoTypeDetails | None = None
    iso_type_ocr_variant: str | None = None
    iso_type_bbox: BoundingBox | None = None
    iso_type_detections: list[DetectionItem] = Field(default_factory=list)
    iso_type_warning: str | None = None

    # --- Metadonnees globales ---
    detection_mode: str
    model_version: str | None = None
    fallback_in_use: bool = False
    model_warning: str | None = None
    detections: list[DetectionItem] = Field(default_factory=list)
    message: str
    warning: str | None = None
    warnings: list[str] = Field(default_factory=list)


class DetectionResponse(BaseModel):
    status: str
    data: DetectionResult


class ErrorResponse(BaseModel):
    status: str
    message: str
    detection_mode: str | None = None
    details: dict[str, Any] | None = None
