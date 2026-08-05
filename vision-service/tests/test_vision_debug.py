"""Tests du mode diagnostic local des crops."""

from PIL import Image

from app.utils import vision_debug
from app.utils.vision_debug import DebugRecorder, new_request_id


def test_request_id_is_short_and_not_sensitive():
    first, second = new_request_id(), new_request_id()
    assert first != second
    assert len(first) == 12
    assert first.isalnum()


def test_disabled_by_default_writes_nothing(tmp_path):
    recorder = DebugRecorder(enabled=False, output_dir=tmp_path)
    recorder.log("yolo", detections=[])
    assert recorder.save_image("crop", Image.new("RGB", (10, 10))) is None
    assert recorder.flush() is None
    assert recorder.steps == []
    assert list(tmp_path.iterdir()) == []


def test_enabled_recorder_writes_images_and_trace(tmp_path):
    recorder = DebugRecorder(enabled=True, output_dir=tmp_path)
    name = recorder.save_image("matricule_vertical", Image.new("RGB", (12, 40)))
    recorder.log("matricule_region", orientation="vertical", corrections=1)
    recorder.flush()

    directory = tmp_path / recorder.request_id
    assert name is not None and (directory / name).exists()
    trace = (directory / "trace.json").read_text(encoding="utf-8")
    assert "matricule_region" in trace
    assert "vertical" in trace


def test_flush_returns_a_relative_path_only(tmp_path, monkeypatch):
    """Aucun chemin absolu Windows ne doit sortir du service."""
    monkeypatch.setattr(
        vision_debug.settings.__class__,
        "public_path_of",
        lambda _self, path: f"debug/{path.name}",
        raising=False,
    )
    recorder = DebugRecorder(enabled=True, output_dir=tmp_path)
    recorder.log("step", value=1)
    returned = recorder.flush()
    assert returned is not None
    assert ":" not in returned
    assert "\\" not in returned


def test_image_names_are_sanitized(tmp_path):
    recorder = DebugRecorder(enabled=True, output_dir=tmp_path)
    name = recorder.save_image("../../evasion/crop nom", Image.new("RGB", (5, 5)))
    assert name is not None
    assert ".." not in name
    assert "/" not in name and "\\" not in name


def test_recorder_follows_settings_when_not_forced(monkeypatch, tmp_path):
    monkeypatch.setattr(vision_debug.settings.__class__, "debug_save_crops", False, raising=False)
    assert DebugRecorder(output_dir=tmp_path).enabled is False
