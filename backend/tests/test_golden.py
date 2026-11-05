"""Golden-file regression tests for the resume parser.

Each fixture is rendered to a real PDF and DOCX, run through extraction + parsing, and
compared with a reviewed JSON snapshot in tests/golden/. After an intentional parser
change, review the diff and regenerate with:  UPDATE_GOLDEN=1 uv run pytest tests/test_golden.py
"""

import json
import os
from datetime import date
from pathlib import Path

import pytest

from app.resume_pipeline.extract import DocumentExtractor
from app.resume_pipeline.parsing.parser import RuleBasedParser
from tests.fixtures import sample_resumes
from tests.fixtures.documents import make_docx, make_pdf

GOLDEN_DIR = Path(__file__).parent / "golden"
FIXTURES = ["ENGINEER", "MINIMAL", "FRESHER", "DESIGNER"]
TODAY = date(2026, 11, 1)


def parse(kind: str, data: bytes) -> dict:
    document, _ = DocumentExtractor(ocr=None).extract(kind, data)  # type: ignore[arg-type]
    result = RuleBasedParser(default_phone_region="US", today=TODAY).parse(document.lines)
    return result.model_dump(mode="json")


@pytest.mark.parametrize("name", FIXTURES)
def test_pdf_matches_golden(name):
    actual = parse("pdf", make_pdf(getattr(sample_resumes, name)))
    path = GOLDEN_DIR / f"{name.lower()}.json"
    if os.environ.get("UPDATE_GOLDEN") or not path.exists():
        path.write_text(json.dumps(actual, indent=2, ensure_ascii=False, sort_keys=True) + "\n")
    assert actual == json.loads(path.read_text())


@pytest.mark.parametrize("name", FIXTURES)
def test_docx_matches_pdf(name):
    """The same resume must parse identically from PDF and DOCX (ignoring confidences)."""
    lines = getattr(sample_resumes, name)

    def strip(data: dict) -> dict:
        data.pop("field_meta")
        for section in ("experience", "education", "projects", "certifications"):
            for item in data[section]:
                item.pop("confidence")
        return data

    assert strip(parse("docx", make_docx(lines))) == strip(parse("pdf", make_pdf(lines)))
