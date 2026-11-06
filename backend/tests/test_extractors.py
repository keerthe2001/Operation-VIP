import pytest

from app.resume_pipeline.errors import PipelineError
from app.resume_pipeline.extract import DocumentExtractor
from app.resume_pipeline.parsing.parser import RuleBasedParser
from app.resume_pipeline.types import TextLine
from app.resume_pipeline.validation import sniff_kind, validate_upload
from tests.fixtures.documents import blank_pdf, encrypt_pdf, make_docx, make_pdf
from tests.fixtures.sample_resumes import ENGINEER

MB = 1024 * 1024


def extract_document(kind, data):
    return DocumentExtractor(ocr=None).extract(kind, data)


def test_sniffing_and_validation():
    pdf, docx = make_pdf(ENGINEER), make_docx(ENGINEER)
    assert sniff_kind(pdf) == "pdf"
    assert sniff_kind(docx) == "docx"
    assert validate_upload("cv.PDF", pdf, max_bytes=MB).mime_type == "application/pdf"
    assert validate_upload("../../etc/cv.docx", docx, max_bytes=MB).file_name == "cv.docx"


@pytest.mark.parametrize(
    ("name", "data", "code"),
    [
        ("cv.exe", b"MZ...", "UNSUPPORTED_FILE_TYPE"),
        ("cv.pdf", b"", "EMPTY_FILE"),
        ("cv.pdf", b"PK\x03\x04not really a docx", "UNSUPPORTED_FILE_TYPE"),
        ("cv.docx", b"%PDF-1.7 a pdf pretending", "UNSUPPORTED_FILE_TYPE"),
        ("cv.pdf", b"%PDF-" + b"x" * (MB + 1), "FILE_TOO_LARGE"),
    ],
)
def test_validation_rejects(name, data, code):
    with pytest.raises(PipelineError) as exc:
        validate_upload(name, data, max_bytes=MB)
    assert exc.value.code == code


def test_pdf_extraction_keeps_styles_and_parses():
    document, doc_class = extract_document("pdf", make_pdf(ENGINEER))
    assert doc_class == "text_pdf"
    first = document.lines[0]
    assert first.text == "Priya Raman" and first.bold and first.size == 22.0
    data = RuleBasedParser().parse(document.lines)
    assert data.personal_information.email == "priya.raman@example.com"
    assert [e.company_name for e in data.experience][:2] == [
        "Acme Technologies Pvt Ltd",
        "Globex Solutions",
    ]


def test_two_column_pdf_is_read_column_by_column():
    main = [
        TextLine("Maya Chen", size=22.0, bold=True),
        TextLine("EXPERIENCE", size=13.0, bold=True),
        TextLine("Data Scientist, Northwind Analytics", bold=True),
        TextLine("Mar 2022 - Present"),
        TextLine("• Built churn models in Python and scikit-learn."),
        TextLine("• Shipped a forecasting service on AWS."),
        TextLine("EDUCATION", size=13.0, bold=True),
        TextLine("M.Sc in Statistics"),
        TextLine("University of Toronto, 2021"),
    ]
    sidebar = [
        TextLine("CONTACT", size=13.0, bold=True),
        TextLine("maya@example.org"),
        TextLine("Toronto, Canada"),
        TextLine("SKILLS", size=13.0, bold=True),
        TextLine("Python, SQL, Tableau"),
        TextLine("PyTorch, Statistics"),
    ]
    document, _ = extract_document("pdf", make_pdf(main, sidebar=sidebar))
    texts = [ln.text for ln in document.lines]
    # Sidebar content is not interleaved with the main column.
    assert texts.index("Python, SQL, Tableau") < texts.index("EXPERIENCE")
    data = RuleBasedParser().parse(document.lines)
    assert data.experience[0].designation == "Data Scientist"
    assert data.experience[0].company_name == "Northwind Analytics"
    assert data.education[0].institution == "University of Toronto"
    assert "Tableau" in data.skills.tools


def test_docx_extraction_handles_lists_and_styles():
    document, doc_class = extract_document("docx", make_docx(ENGINEER))
    assert doc_class == "docx"
    bullets = [ln for ln in document.lines if ln.list_item]
    assert bullets and bullets[0].text.startswith("Led migration")
    data = RuleBasedParser().parse(document.lines)
    assert data.personal_information.full_name == "Priya Raman"
    assert len(data.experience) == 3


def test_docx_tables_are_extracted():
    import io

    from docx import Document

    document = Document()
    document.add_paragraph("Lee Park")
    table = document.add_table(rows=1, cols=2)
    table.cell(0, 0).text = "lee@example.com"
    table.cell(0, 1).text = "Seoul, Korea"
    buffer = io.BytesIO()
    document.save(buffer)
    extracted, _ = extract_document("docx", buffer.getvalue())
    assert [ln.text for ln in extracted.lines] == ["Lee Park", "lee@example.com", "Seoul, Korea"]


def test_password_protected_pdf():
    with pytest.raises(PipelineError) as exc:
        extract_document("pdf", encrypt_pdf(make_pdf(ENGINEER)))
    assert exc.value.code == "PASSWORD_PROTECTED"


def test_corrupt_pdf():
    with pytest.raises(PipelineError) as exc:
        extract_document("pdf", b"%PDF-1.7\n this is not a real pdf")
    assert exc.value.code == "CORRUPT_FILE"


def test_pdf_without_text_reports_no_text():
    with pytest.raises(PipelineError) as exc:
        extract_document("pdf", blank_pdf())
    assert exc.value.code == "NO_TEXT_FOUND"


def test_corrupt_docx():
    with pytest.raises(PipelineError) as exc:
        extract_document("docx", b"PK\x03\x04garbage")
    assert exc.value.code == "CORRUPT_FILE"


def test_detached_bullet_glyphs_stay_with_their_text():
    import io

    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    pdf.setFont("Helvetica", 11)
    pdf.drawString(50, 780, "Responsibilities for the platform team are listed below in detail.")
    pdf.drawString(60, 760, "\u2022")
    pdf.drawString(120, 760, "Built a REST API")  # bullet indented far from its text
    pdf.save()
    document, _ = extract_document("pdf", buffer.getvalue())
    assert document.lines[-1].text == "• Built a REST API"


def test_short_last_page_is_text_not_a_scan():
    import io

    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    pdf.setFont("Helvetica", 11)
    pdf.drawString(
        50, 780, "Experience section with plenty of text on the first page of this resume."
    )
    pdf.showPage()
    pdf.drawString(50, 780, "Excel, Jira")  # overflow: only a few characters, no image
    pdf.save()
    document, doc_class = extract_document("pdf", buffer.getvalue())
    assert doc_class == "text_pdf"
    assert document.lines[-1].text == "Excel, Jira"
