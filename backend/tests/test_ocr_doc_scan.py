"""Phase 1b: OCR (images, scanned PDFs), legacy .doc conversion, malware scanning."""

import asyncio
import io
import shutil
import socket
import struct
import subprocess
import time
from pathlib import Path

import pytest
from httpx import AsyncClient
from PIL import Image

from app.resume_pipeline.errors import PipelineError
from app.resume_pipeline.extract import DocumentExtractor
from app.resume_pipeline.extractors.doc import convert_doc_to_docx
from app.resume_pipeline.ocr import TesseractOcr
from app.resume_pipeline.parsing.parser import RuleBasedParser
from app.resume_pipeline.scanning import ClamdScanner, ScannerUnavailableError, ScanResult
from tests.conftest import auth_headers
from tests.fixtures.documents import make_docx, make_image, make_pdf, make_scanned_pdf
from tests.fixtures.sample_resumes import ENGINEER

needs_tesseract = pytest.mark.skipif(
    shutil.which("tesseract") is None, reason="tesseract not installed"
)
needs_soffice = pytest.mark.skipif(
    shutil.which("soffice") is None, reason="LibreOffice not installed"
)
needs_clamd = pytest.mark.skipif(shutil.which("clamd") is None, reason="clamd not installed")

TEST_SIGNATURE = b"COPILOT-TEST-MALWARE-SIGNATURE-7f3a9c"


@pytest.fixture(scope="module")
def ocr_extractor():
    return DocumentExtractor(ocr=TesseractOcr(), ocr_dpi=300)


# ---------------------------------------------------------------- OCR


@needs_tesseract
@pytest.mark.parametrize("fmt", ["PNG", "JPEG"])
def test_image_resume_is_read_with_ocr(ocr_extractor, fmt):
    document, doc_class = ocr_extractor.extract(
        fmt.lower() if fmt == "PNG" else "jpeg", make_image(ENGINEER, fmt=fmt)
    )
    assert doc_class == "image"
    assert document.method == "ocr-tesseract"
    assert document.ocr_confidence and document.ocr_confidence > 80
    data = RuleBasedParser().parse(document.lines)
    assert data.personal_information.full_name == "Priya Raman"
    assert data.personal_information.email == "priya.raman@example.com"
    assert data.personal_information.phone == "+919876543210"
    assert [e.company_name for e in data.experience] == [
        "Acme Technologies Pvt Ltd",
        "Globex Solutions",
        "Initech Labs",
    ]


@needs_tesseract
def test_scanned_pdf_is_classified_and_ocrd(ocr_extractor):
    document, doc_class = ocr_extractor.extract("pdf", make_scanned_pdf(ENGINEER))
    assert doc_class == "scanned_pdf"
    data = RuleBasedParser().parse(document.lines)
    assert data.education[0].institution == "Anna University"


def test_scanned_pdf_without_ocr_explains_the_problem():
    with pytest.raises(PipelineError) as exc:
        DocumentExtractor(ocr=None).extract("pdf", make_scanned_pdf(ENGINEER[:3]))
    assert exc.value.code == "NO_TEXT_FOUND"
    assert "scanned" in exc.value.message


def test_corrupt_and_oversized_images():
    extractor = DocumentExtractor(ocr=object())  # type: ignore[arg-type]  # never reached
    with pytest.raises(PipelineError) as exc:
        extractor.extract("png", b"\x89PNG\r\n\x1a\n" + b"\x00" * 64)
    assert exc.value.code == "CORRUPT_FILE"

    bomb = io.BytesIO()
    Image.new("1", (11_000, 11_000)).save(bomb, format="PNG")  # 121 megapixels, tiny file
    assert len(bomb.getvalue()) < 2 * 1024 * 1024
    with pytest.raises(PipelineError) as exc:
        extractor.extract("png", bomb.getvalue())
    assert exc.value.code == "FILE_TOO_LARGE"


# ---------------------------------------------------------------- DOC


def _make_doc(tmp_path: Path) -> bytes:
    source = tmp_path / "resume.docx"
    source.write_bytes(make_docx(ENGINEER))
    subprocess.run(
        [
            "soffice",
            f"-env:UserInstallation={(tmp_path / 'p').as_uri()}",
            "--headless",
            "--convert-to",
            "doc:MS Word 97",
            "--outdir",
            str(tmp_path),
            str(source),
        ],
        check=True,
        capture_output=True,
        timeout=120,
    )
    return (tmp_path / "resume.doc").read_bytes()


@needs_soffice
def test_legacy_doc_is_converted_and_parsed(tmp_path):
    data = _make_doc(tmp_path)
    assert data.startswith(b"\xd0\xcf\x11\xe0")
    document, doc_class = DocumentExtractor(ocr=None).extract("doc", data)
    assert doc_class == "doc"
    assert document.method == "doc-libreoffice"
    parsed = RuleBasedParser().parse(document.lines)
    assert parsed.personal_information.email == "priya.raman@example.com"
    assert len(parsed.experience) == 3


def test_doc_conversion_without_libreoffice():
    with pytest.raises(PipelineError) as exc:
        convert_doc_to_docx(b"\xd0\xcf\x11\xe0", binary="definitely-not-installed")
    assert exc.value.code == "CONVERSION_FAILED"


def test_ole_files_that_are_not_word_documents_are_rejected():
    from app.resume_pipeline.validation import sniff_kind, validate_upload

    fake = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"junk" * 100  # e.g. an .xls or .msi
    assert sniff_kind(fake) is None
    with pytest.raises(PipelineError) as exc:
        validate_upload("cv.doc", fake, max_bytes=1024 * 1024)
    assert exc.value.code == "UNSUPPORTED_FILE_TYPE"


# ---------------------------------------------------------------- malware scanning


async def _fake_clamd(reply: bytes):
    """Minimal clamd INSTREAM server that answers with a fixed reply."""
    received: list[bytes] = []

    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        command = await reader.readuntil(b"\0")
        assert command == b"zINSTREAM\0"
        body = b""
        while True:
            size = struct.unpack("!L", await reader.readexactly(4))[0]
            if size == 0:
                break
            body += await reader.readexactly(size)
        received.append(body)
        writer.write(reply + b"\0")
        await writer.drain()
        writer.close()

    server = await asyncio.start_server(handle, "127.0.0.1", 0)
    return server, server.sockets[0].getsockname()[1], received


async def test_clamd_protocol_clean_and_infected():
    server, port, received = await _fake_clamd(b"stream: OK")
    async with server:
        result = await ClamdScanner(host="127.0.0.1", port=port).scan(b"x" * 200_000)
    assert result == ScanResult(clean=True)
    assert received == [b"x" * 200_000]  # streamed in several chunks, reassembled intact

    server, port, _ = await _fake_clamd(b"stream: Win.Test.EICAR_HDB-1 FOUND")
    async with server:
        result = await ClamdScanner(host="127.0.0.1", port=port).scan(b"evil")
    assert result == ScanResult(clean=False, signature="Win.Test.EICAR_HDB-1")


async def test_clamd_unreachable():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    with pytest.raises(ScannerUnavailableError):
        await ClamdScanner(host="127.0.0.1", port=port, timeout=2).scan(b"data")


@pytest.fixture(scope="module")
def real_clamd(tmp_path_factory):
    """Start a real clamd with a private signature database containing a test signature."""
    workdir = tmp_path_factory.mktemp("clamd")
    (workdir / "db").mkdir()
    (workdir / "db" / "copilot-test.ndb").write_text(
        f"Copilot.Test.Signature:0:*:{TEST_SIGNATURE.hex()}\n"
    )
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
    config = workdir / "clamd.conf"
    config.write_text(
        f"DatabaseDirectory {workdir / 'db'}\nTCPSocket {port}\nTCPAddr 127.0.0.1\n"
        "Foreground yes\nLogFile /dev/null\n"
    )
    process = subprocess.Popen(
        ["clamd", "--config-file", str(config)], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE
    )
    for _ in range(100):
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.2):
                break
        except OSError:
            if process.poll() is not None:
                pytest.skip(f"clamd failed to start: {process.stderr.read().decode()[-300:]}")
            time.sleep(0.2)
    yield port
    process.terminate()
    process.wait(timeout=10)


@needs_clamd
async def test_real_clamd_detects_signature(real_clamd):
    scanner = ClamdScanner(host="127.0.0.1", port=real_clamd)
    assert (await scanner.scan(make_pdf(ENGINEER))).clean
    infected = await scanner.scan(b"%PDF-1.7\n" + TEST_SIGNATURE + b"\n%%EOF")
    assert not infected.clean
    assert "Copilot.Test.Signature" in infected.signature


class _StubScanner:
    def __init__(self, result: ScanResult | None = None, error: Exception | None = None):
        self.result, self.error = result, error

    async def scan(self, data: bytes) -> ScanResult:
        if self.error:
            raise self.error
        return self.result  # type: ignore[return-value]


async def _upload(client, headers, name, data, mime="application/pdf"):
    response = await client.post(
        "/api/v1/resumes/upload", headers=headers, files={"file": (name, data, mime)}
    )
    assert response.status_code == 202, response.text
    return (
        await client.get(f"/api/v1/resumes/{response.json()['id']}/status", headers=headers)
    ).json()


async def test_pipeline_deletes_infected_files(client: AsyncClient, app):
    processor = app.state.resume_processor
    original = processor.scanner
    processor.scanner = _StubScanner(ScanResult(clean=False, signature="Eicar-Test"))
    try:
        headers = await auth_headers(client)
        status = await _upload(client, headers, "cv.pdf", make_pdf(ENGINEER))
    finally:
        processor.scanner = original
    assert (status["status"], status["error_code"]) == ("failed", "MALWARE_DETECTED")
    file = await client.get(f"/api/v1/resumes/{status['id']}/file", headers=headers)
    assert file.status_code == 503  # the stored object is gone


async def test_pipeline_fails_closed_when_scanner_is_down(client: AsyncClient, app):
    processor = app.state.resume_processor
    original = processor.scanner
    processor.scanner = _StubScanner(error=ScannerUnavailableError("connection refused"))
    try:
        headers = await auth_headers(client)
        status = await _upload(client, headers, "cv.pdf", make_pdf(ENGINEER))
    finally:
        processor.scanner = original
    assert (status["status"], status["error_code"]) == ("failed", "SCAN_UNAVAILABLE")


@needs_tesseract
async def test_image_upload_end_to_end_with_reduced_confidence(client: AsyncClient):
    headers = await auth_headers(client)
    status = await _upload(client, headers, "photo.png", make_image(ENGINEER), "image/png")
    assert status["status"] == "ready", status
    detail = (await client.get(f"/api/v1/resumes/{status['id']}", headers=headers)).json()
    assert detail["doc_class"] == "image"
    assert detail["extraction_meta"]["ocr_confidence"] > 80
    meta = detail["extracted_data"]["field_meta"]["personal_information.email"]
    assert meta["confidence"] < 0.97  # OCR'd values are less certain than selectable text
    profile = (await client.get("/api/v1/profile", headers=headers)).json()
    assert profile["personal_information"]["full_name"] == "Priya Raman"
