from pydantic import BaseModel


class DetectionResult(BaseModel):
    detected_iso: str
    confidence: float
    is_valid_iso: bool
    is_valid_format: bool
    is_valid_check_digit: bool
    owner_code: str | None = None
    category: str | None = None
    serial_number: str | None = None
    check_digit: str | None = None
    expected_check_digit: str | None = None
    detection_mode: str
    message: str


class DetectionResponse(BaseModel):
    status: str
    data: DetectionResult


class ErrorResponse(BaseModel):
    status: str
    message: str
