"""Legacy .doc support: convert to .docx with headless LibreOffice, then reuse the DOCX path."""

import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

from app.resume_pipeline import errors
from app.resume_pipeline.errors import PipelineError
from app.resume_pipeline.extractors.docx import extract_docx
from app.resume_pipeline.types import ExtractedDocument

logger = logging.getLogger(__name__)

CONVERSION_TIMEOUT_SECONDS = 60


def convert_doc_to_docx(data: bytes, binary: str = "soffice") -> bytes:
    executable = shutil.which(binary)
    if executable is None:
        raise PipelineError(
            errors.CONVERSION_FAILED,
            "Old Word (.doc) files can't be processed right now. "
            "Save it as .docx or PDF and upload again.",
        )
    with tempfile.TemporaryDirectory(prefix="copilot-doc-") as workdir:
        work = Path(workdir)
        source = work / "resume.doc"
        source.write_bytes(data)
        # A private profile directory lets conversions run in parallel and isolated.
        profile = (work / "profile").as_uri()
        command = [
            executable,
            f"-env:UserInstallation={profile}",
            "--headless",
            "--norestore",
            "--convert-to",
            "docx:MS Word 2007 XML",
            "--outdir",
            str(work),
            str(source),
        ]
        try:
            subprocess.run(  # noqa: S603 - fixed argument list, no shell
                command, check=True, capture_output=True, timeout=CONVERSION_TIMEOUT_SECONDS
            )
        except subprocess.TimeoutExpired as exc:
            raise PipelineError(
                errors.CONVERSION_FAILED, "Converting this Word file took too long."
            ) from exc
        except subprocess.CalledProcessError as exc:
            logger.warning("LibreOffice conversion failed: %s", exc.stderr[-500:])
            raise PipelineError(
                errors.CORRUPT, "This Word document appears to be damaged."
            ) from exc
        output = work / "resume.docx"
        if not output.exists():
            raise PipelineError(errors.CORRUPT, "This Word document appears to be damaged.")
        return output.read_bytes()


def extract_doc(data: bytes, binary: str = "soffice") -> ExtractedDocument:
    document = extract_docx(convert_doc_to_docx(data, binary))
    document.method = "doc-libreoffice"
    return document
