"""OCR behind a small interface so the engine can be swapped (e.g. PaddleOCR later)."""

import logging
import re
import shutil
from dataclasses import dataclass
from typing import Protocol

from PIL import Image, ImageOps

from app.resume_pipeline.types import TextLine

# Tesseract often reads a round bullet "•" as one of these characters.
MISREAD_BULLET_RE = re.compile(r"^(?:[¢©«»°®•·*@]{1,2}|[eoO0]|\(?e\)?)\s+(?=[A-Z0-9])")


def normalize_ocr_text(text: str) -> str:
    """Repair OCR artifacts that would change how the parser reads a line."""
    return MISREAD_BULLET_RE.sub("• ", text)


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class OcrPage:
    lines: list[TextLine]
    confidence: float | None  # mean word confidence, 0-100


class OcrProvider(Protocol):
    name: str

    def recognize(self, image: Image.Image, *, page: int, dpi: int) -> OcrPage: ...


class OcrUnavailableError(RuntimeError):
    pass


def prepare_image(image: Image.Image) -> Image.Image:
    """Normalize orientation and contrast; upscale small images for better accuracy."""
    image = ImageOps.exif_transpose(image) or image
    if image.mode not in ("L", "RGB"):
        image = image.convert("RGB")
    gray = ImageOps.grayscale(image)
    if gray.width < 1600:
        scale = 1600 / gray.width
        gray = gray.resize(
            (int(gray.width * scale), int(gray.height * scale)), Image.Resampling.LANCZOS
        )
    return ImageOps.autocontrast(gray)


class TesseractOcr:
    name = "tesseract"

    def __init__(self, languages: str = "eng") -> None:
        if shutil.which("tesseract") is None:
            raise OcrUnavailableError("The tesseract binary is not installed")
        self.languages = languages

    def recognize(self, image: Image.Image, *, page: int, dpi: int) -> OcrPage:
        import pytesseract

        prepared = prepare_image(image)
        scale = prepared.width / image.width if image.width else 1.0
        data = pytesseract.image_to_data(
            prepared,
            lang=self.languages,
            config="--psm 3",
            output_type=pytesseract.Output.DICT,
        )
        groups: dict[tuple[int, int, int], list[int]] = {}
        for i, word in enumerate(data["text"]):
            if word.strip() and float(data["conf"][i]) >= 0:
                key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
                groups.setdefault(key, []).append(i)

        lines: list[TextLine] = []
        confidences: list[float] = []
        ordered = sorted(
            groups.values(),
            key=lambda idx: (min(data["top"][i] for i in idx), min(data["left"][i] for i in idx)),
        )
        for indices in ordered:
            words = [data["text"][i] for i in indices]
            heights = sorted(data["height"][i] for i in indices)
            median_height = heights[len(heights) // 2]
            # Convert glyph height in pixels to an approximate font size in points.
            size_pt = median_height / scale * 72 / dpi * 1.35
            confidences.extend(float(data["conf"][i]) for i in indices)
            text = normalize_ocr_text(" ".join(words))
            lines.append(TextLine(text=text, size=round(size_pt, 1), page=page))
        mean = sum(confidences) / len(confidences) if confidences else None
        return OcrPage(lines=lines, confidence=mean)


def create_ocr(provider: str, languages: str) -> OcrProvider | None:
    if provider == "none":
        return None
    try:
        return TesseractOcr(languages)
    except OcrUnavailableError:
        logger.warning("OCR provider %s unavailable; scanned resumes will be rejected", provider)
        return None
