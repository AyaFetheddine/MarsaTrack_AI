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
    raw_ocr_text: str | None = None
    ocr_confidence: float | None = None
    candidate_iso: str | None = None
    is_valid_iso: bool = False


class DetectionResult(BaseModel):
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
    detection_mode: str
    ocr_variant: str | None = None
    bbox: BoundingBox | None = None
    detections: list[DetectionItem] = Field(default_factory=list)
    message: str
    warning: str | None = None


class DetectionResponse(BaseModel):
    status: str
    data: DetectionResult


class ErrorResponse(BaseModel):
    status: str
    message: str
    detection_mode: str | None = None
    details: dict[str, Any] | None = None
