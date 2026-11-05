"""Upload validation: size limits and content sniffing (never trust the extension alone)."""

import io
import zipfile
from dataclasses import dataclass
from pathlib import PurePath

from app.resume_pipeline import errors
from app.resume_pipeline.errors import PipelineError
from app.resume_pipeline.types import FileKind

ALLOWED_EXTENSIONS: dict[str, set[FileKind]] = {
    ".pdf": {"pdf"},
    ".docx": {"docx"},
    ".doc": {"doc"},
    ".png": {"png"},
    ".jpg": {"jpeg"},
    ".jpeg": {"jpeg"},
}

MIME_TYPES: dict[FileKind, str] = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "doc": "application/msword",
    "png": "image/png",
    "jpeg": "image/jpeg",
}


@dataclass(frozen=True)
class ValidatedFile:
    kind: FileKind
    mime_type: str
    file_name: str


def sniff_kind(data: bytes) -> FileKind | None:
    if data.startswith(b"%PDF-"):
        return "pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if data.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        return "doc"
    if data.startswith(b"PK\x03\x04"):
        try:
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                if "word/document.xml" in archive.namelist():
                    return "docx"
        except zipfile.BadZipFile:
            return None
    return None


def safe_file_name(name: str | None) -> str:
    base = PurePath(name or "resume").name.strip().replace("\x00", "")
    return base[:255] or "resume"


def validate_upload(file_name: str | None, data: bytes, *, max_bytes: int) -> ValidatedFile:
    name = safe_file_name(file_name)
    extension = PurePath(name).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise PipelineError(errors.UNSUPPORTED_TYPE, "Upload a PDF, DOC, DOCX, PNG or JPG file.")
    if not data:
        raise PipelineError(errors.EMPTY_FILE, "The file is empty.")
    if len(data) > max_bytes:
        raise PipelineError(
            errors.TOO_LARGE, f"The file is larger than {max_bytes // (1024 * 1024)} MB."
        )
    kind = sniff_kind(data)
    if kind is None or kind not in ALLOWED_EXTENSIONS[extension]:
        raise PipelineError(
            errors.UNSUPPORTED_TYPE,
            "The file's contents don't match its extension, or the file is damaged.",
        )
    return ValidatedFile(kind=kind, mime_type=MIME_TYPES[kind], file_name=name)
