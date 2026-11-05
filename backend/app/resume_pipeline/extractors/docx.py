"""Text extraction for DOCX: paragraphs and tables in document order."""

import io
import zipfile

from docx import Document
from docx.document import Document as DocumentObject
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

from app.resume_pipeline import errors
from app.resume_pipeline.errors import PipelineError
from app.resume_pipeline.types import ExtractedDocument, TextLine

DEFAULT_SIZE = 11.0


def _paragraph_line(paragraph: Paragraph, default_size: float) -> TextLine | None:
    text = " ".join(paragraph.text.split())
    if not text:
        return None
    style_name = (paragraph.style.name if paragraph.style is not None else "") or ""
    runs = [r for r in paragraph.runs if r.text.strip()]
    sizes = [r.font.size.pt for r in runs if r.font.size is not None]
    style_size = None
    if paragraph.style is not None and paragraph.style.font.size is not None:
        style_size = paragraph.style.font.size.pt
    size = max(sizes) if sizes else (style_size or default_size)
    style_bold = bool(paragraph.style is not None and paragraph.style.font.bold)
    bold_chars = sum(len(r.text) for r in runs if r.bold or (r.bold is None and style_bold))
    bold = bool(runs) and bold_chars / max(1, sum(len(r.text) for r in runs)) >= 0.6
    is_heading = style_name.startswith(("Heading", "Title"))
    p_pr = paragraph._p.pPr
    is_list = style_name.startswith("List") or (
        p_pr is not None and p_pr.find(qn("w:numPr")) is not None
    )
    return TextLine(
        text=text, size=size, bold=bold or is_heading, heading_style=is_heading, list_item=is_list
    )


def _iter_blocks(document: DocumentObject) -> list[Paragraph | Table]:
    blocks: list[Paragraph | Table] = []
    for child in document.element.body.iterchildren():
        if child.tag == qn("w:p"):
            blocks.append(Paragraph(child, document))
        elif child.tag == qn("w:tbl"):
            blocks.append(Table(child, document))
    return blocks


def extract_docx(data: bytes) -> ExtractedDocument:
    try:
        document = Document(io.BytesIO(data))
    except (zipfile.BadZipFile, KeyError, ValueError) as exc:
        raise PipelineError(errors.CORRUPT, "This Word document appears to be damaged.") from exc

    lines: list[TextLine] = []

    def add(paragraph: Paragraph) -> None:
        line = _paragraph_line(paragraph, DEFAULT_SIZE)
        if line is not None:
            lines.append(line)

    for block in _iter_blocks(document):
        if isinstance(block, Paragraph):
            add(block)
            continue
        for row in block.rows:
            seen: set[int] = set()
            for cell in row.cells:
                if id(cell._tc) in seen:  # merged cells repeat
                    continue
                seen.add(id(cell._tc))
                for paragraph in cell.paragraphs:
                    add(paragraph)

    return ExtractedDocument(lines=lines, page_count=1, method="docx")
