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


FONT_DIR = "/usr/share/fonts/truetype/dejavu"


def make_image(lines: list[TextLine], *, scale: float = 3.0, fmt: str = "PNG") -> bytes:
    """Render lines onto a white page, like a phone photo or scan of a printed resume."""
    from PIL import Image, ImageDraw, ImageFont

    width = int(595 * scale)
    height = int((sum(line.size + 6 for line in lines) + 120) * scale)
    image = Image.new("L", (width, height), 255)
    draw = ImageDraw.Draw(image)
    y = 50 * scale
    for line in lines:
        font_file = "DejaVuSans-Bold.ttf" if line.bold else "DejaVuSans.ttf"
        font = ImageFont.truetype(f"{FONT_DIR}/{font_file}", int(line.size * scale))
        draw.text((50 * scale, y), line.text, fill=0, font=font)
        y += (line.size + 6) * scale
    out = io.BytesIO()
    image.save(out, format=fmt, dpi=(int(72 * scale), int(72 * scale)))
    return out.getvalue()


def make_scanned_pdf(lines: list[TextLine]) -> bytes:
    """A PDF whose page is just an image of the text (no selectable text)."""
    from reportlab.lib.utils import ImageReader

    png = make_image(lines)
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4
    reader = ImageReader(io.BytesIO(png))
    iw, ih = reader.getSize()
    draw_h = min(height - 40, width * ih / iw)
    pdf.drawImage(reader, 20, height - 20 - draw_h, width=width - 40, height=draw_h)
    pdf.save()
    return buffer.getvalue()
