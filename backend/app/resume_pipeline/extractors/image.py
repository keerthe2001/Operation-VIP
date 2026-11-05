"""Image resumes (PNG/JPG) and scanned PDF pages go through OCR."""

import io
import logging

import pypdfium2 as pdfium
from PIL import Image, UnidentifiedImageError

from app.resume_pipeline import errors
from app.resume_pipeline.errors import PipelineError
from app.resume_pipeline.ocr import OcrPage, OcrProvider
from app.resume_pipeline.types import ExtractedDocument

logger = logging.getLogger(__name__)

# Guard against decompression bombs (a tiny file that expands to a gigantic bitmap).
MAX_PIXELS = 50_000_000
Image.MAX_IMAGE_PIXELS = MAX_PIXELS


def _require(ocr: OcrProvider | None) -> OcrProvider:
    if ocr is None:
        raise PipelineError(
            errors.NO_TEXT,
            "This looks like a scanned or image resume, and text recognition isn't available "
            "right now. Upload a PDF with selectable text or a Word document.",
        )
    return ocr


def _summarize(pages: list[OcrPage], page_count: int, method: str) -> ExtractedDocument:
    lines = [line for page in pages for line in page.lines]
    confidences = [p.confidence for p in pages if p.confidence is not None]
    confidence = round(sum(confidences) / len(confidences), 1) if confidences else None
    document = ExtractedDocument(
        lines=lines, page_count=page_count, method=method, ocr_confidence=confidence
    )
    if confidence is not None and confidence < 70:
        document.warnings.append("Low OCR confidence: the scan may be blurry or low resolution.")
    return document


def extract_image(data: bytes, ocr: OcrProvider | None, *, dpi: int) -> ExtractedDocument:
    engine = _require(ocr)
    try:
        image = Image.open(io.BytesIO(data))
        image.verify()  # detects truncated/corrupt files
        image = Image.open(io.BytesIO(data))
        image.load()
    except Image.DecompressionBombError as exc:
        raise PipelineError(errors.TOO_LARGE, "This image is too large to process.") from exc
    except (UnidentifiedImageError, OSError, SyntaxError) as exc:
        raise PipelineError(errors.CORRUPT, "This image appears to be damaged.") from exc
    # Photos rarely carry DPI; assume a typical phone/scanner resolution.
    image_dpi = int(image.info.get("dpi", (dpi, dpi))[0] or dpi)
    page = engine.recognize(image, page=1, dpi=image_dpi)
    return _summarize([page], 1, f"ocr-{engine.name}")


def render_pdf_pages(data: bytes, pages: list[int], *, dpi: int) -> list[tuple[int, Image.Image]]:
    """Render the given 1-based PDF pages to images (pypdfium2; Apache/BSD licensed)."""
    try:
        pdf = pdfium.PdfDocument(data)
    except pdfium.PdfiumError as exc:
        raise PipelineError(errors.CORRUPT, "This PDF appears to be damaged.") from exc
    rendered: list[tuple[int, Image.Image]] = []
    try:
        for number in pages:
            page = pdf[number - 1]
            bitmap = page.render(scale=dpi / 72)
            rendered.append((number, bitmap.to_pil()))
            page.close()
    finally:
        pdf.close()
    return rendered


def ocr_pdf_pages(
    data: bytes, pages: list[int], ocr: OcrProvider | None, *, dpi: int
) -> tuple[list[OcrPage], str]:
    engine = _require(ocr)
    results = [
        engine.recognize(image, page=number, dpi=dpi)
        for number, image in render_pdf_pages(data, pages, dpi=dpi)
    ]
    return results, engine.name
