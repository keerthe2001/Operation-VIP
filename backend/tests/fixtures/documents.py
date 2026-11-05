"""Build real DOCX/PDF files from TextLine specs so tests exercise the extractors."""

import io

from docx import Document
from docx.shared import Pt
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from app.resume_pipeline.types import TextLine


def make_docx(lines: list[TextLine]) -> bytes:
    document = Document()
    for line in lines:
        text = line.text
        if text.startswith("• "):
            paragraph = document.add_paragraph(text[2:], style="List Bullet")
            continue
        paragraph = document.add_paragraph()
        run = paragraph.add_run(text)
        run.bold = line.bold
        run.font.size = Pt(line.size)
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def make_pdf(lines: list[TextLine], *, sidebar: list[TextLine] | None = None) -> bytes:
    """Single-column PDF, or a two-column layout with `sidebar` on the left."""
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    y = height - 60
    main_x = 50
    if sidebar is not None:
        # Header (first line) spans the page; then sidebar left, main content right.
        first, *rest = lines
        pdf.setFont("Helvetica-Bold" if first.bold else "Helvetica", first.size)
        pdf.drawString(50, y, first.text)
        y -= first.size + 14
        top = y
        for line in sidebar:
            pdf.setFont("Helvetica-Bold" if line.bold else "Helvetica", line.size)
            pdf.drawString(40, y, line.text)
            y -= line.size + 6
        y = top
        main_x = width * 0.52
        lines = rest
    for line in lines:
        if y < 60:
            pdf.showPage()
            y = height - 60
        pdf.setFont("Helvetica-Bold" if line.bold else "Helvetica", line.size)
        pdf.drawString(main_x, y, line.text)
        y -= line.size + 6
    pdf.save()
    return buffer.getvalue()


def encrypt_pdf(data: bytes, password: str = "secret") -> bytes:
    reader = PdfReader(io.BytesIO(data))
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    writer.encrypt(password)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def blank_pdf() -> bytes:
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    pdf.rect(100, 100, 200, 200)
    pdf.save()
    return buffer.getvalue()
