"""Text extraction for text-based PDFs (pdfplumber; MIT licensed).

Produces visual lines with font size and boldness, ordered for reading. Two-column
layouts (sidebar resumes) are detected and read column by column.
"""

import io
import logging
import re
from collections import defaultdict
from typing import Any

import pdfplumber
from pdfminer.pdfdocument import PDFEncryptionError, PDFPasswordIncorrect
from pdfminer.pdfparser import PDFSyntaxError
from pdfplumber.utils.exceptions import PdfminerException

from app.resume_pipeline import errors
from app.resume_pipeline.errors import PipelineError
from app.resume_pipeline.types import ExtractedDocument, TextLine

logger = logging.getLogger(__name__)

# A PDF page with fewer extractable characters than this is treated as scanned.
MIN_CHARS_PER_PAGE = 40

# pdfminer emits "(cid:N)" for glyphs without a Unicode mapping. In resumes these are
# almost always bullets or separators, so they are normalized to "•".
CID_RE = re.compile(r"\(cid:\d+\)")


def _is_bold(fontname: str) -> bool:
    lowered = fontname.lower()
    return any(marker in lowered for marker in ("bold", "black", "heavy", "semibold"))


def _group_lines(words: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Group words into lines by vertical position (tolerant to small baseline jitter)."""
    rows: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for word in words:
        rows[round(word["top"] / 3)].append(word)
    lines: list[dict[str, Any]] = []
    for key in sorted(rows):
        row = sorted(rows[key], key=lambda w: w["x0"])
        # Split a row where there is a large horizontal gap (separate columns/fields).
        segment: list[dict[str, Any]] = [row[0]]
        for word in row[1:]:
            gap = word["x0"] - segment[-1]["x1"]
            if gap > max(30.0, word["size"] * 3):
                lines.append(_make_line(segment))
                segment = [word]
            else:
                segment.append(word)
        lines.append(_make_line(segment))
    return lines


def _make_line(words: list[dict[str, Any]]) -> dict[str, Any]:
    total = sum(len(w["text"]) for w in words) or 1
    bold_chars = sum(len(w["text"]) for w in words if _is_bold(w.get("fontname", "")))
    return {
        "text": " ".join(w["text"] for w in words),
        "x0": min(w["x0"] for w in words),
        "x1": max(w["x1"] for w in words),
        "top": min(w["top"] for w in words),
        "size": max(w["size"] for w in words),
        "bold": bold_chars / total >= 0.6,
    }


def _order_columns(lines: list[dict[str, Any]], width: float) -> list[dict[str, Any]]:
    """Read sidebar/two-column layouts column by column instead of row by row."""
    split = width * 0.5
    left = [ln for ln in lines if ln["x1"] <= split + 5]
    right = [ln for ln in lines if ln["x0"] >= split - 5 and ln["x1"] > split + 5]
    if len(lines) < 8 or len(left) < len(lines) * 0.2 or len(right) < len(lines) * 0.2:
        return lines
    # Find where the columns start: the first row with content on both sides.
    left_tops = {round(ln["top"]) for ln in left}
    both = [ln["top"] for ln in right if any(abs(ln["top"] - t) < 4 for t in left_tops)]
    if not both:
        return lines
    column_start = min(both)
    header = [ln for ln in lines if ln["top"] < column_start - 2]
    body = [ln for ln in lines if ln["top"] >= column_start - 2]
    body_left = [ln for ln in body if ln["x1"] <= split + 5]
    body_right = [ln for ln in body if ln not in body_left]
    by_top = lambda ln: (ln["top"], ln["x0"])  # noqa: E731
    return (
        sorted(header, key=by_top) + sorted(body_left, key=by_top) + sorted(body_right, key=by_top)
    )


def extract_pdf(data: bytes) -> tuple[ExtractedDocument, list[int]]:
    """Return the extracted document and the 1-based numbers of pages lacking text."""
    try:
        pdf = pdfplumber.open(io.BytesIO(data))
    except (PdfminerException, PDFSyntaxError) as exc:
        cause = exc.args[0] if isinstance(exc, PdfminerException) and exc.args else exc
        if isinstance(cause, PDFPasswordIncorrect | PDFEncryptionError):
            raise PipelineError(
                errors.PASSWORD_PROTECTED,
                "This PDF is password-protected. Remove the password and upload it again.",
            ) from exc
        raise PipelineError(errors.CORRUPT, "This PDF appears to be damaged.") from exc
    except Exception as exc:
        raise PipelineError(errors.CORRUPT, "This PDF appears to be damaged.") from exc

    lines: list[TextLine] = []
    textless_pages: list[int] = []
    with pdf:
        try:
            pages = list(pdf.pages)
        except Exception as exc:
            raise PipelineError(errors.CORRUPT, "This PDF appears to be damaged.") from exc
        for number, page in enumerate(pages, start=1):
            try:
                words = page.extract_words(
                    keep_blank_chars=False, use_text_flow=False, extra_attrs=["size", "fontname"]
                )
            except Exception:
                logger.exception("Failed to read page %s", number)
                words = []
            if sum(len(w["text"]) for w in words) < MIN_CHARS_PER_PAGE:
                textless_pages.append(number)
                continue
            for raw in _order_columns(_group_lines(words), float(page.width)):
                text = " ".join(CID_RE.sub(" • ", raw["text"]).split())
                if text:
                    lines.append(
                        TextLine(
                            text=text, size=round(raw["size"], 1), bold=raw["bold"], page=number
                        )
                    )
        page_count = len(pages)

    return ExtractedDocument(lines=lines, page_count=page_count, method="pdf-text"), textless_pages
