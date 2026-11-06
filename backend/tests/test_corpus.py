"""Parser regression on the synthetic resume corpus (fixed seeds, known ground truth).

Fails if any field family drops below its accuracy floor. Explore further with:
    uv run python -m scripts.evaluate_parser --count 300 --start <seed>
"""

import shutil
from pathlib import Path

import pytest

from app.resume_pipeline.extract import DocumentExtractor
from app.resume_pipeline.ocr import create_ocr
from app.resume_pipeline.parsing.parser import RuleBasedParser
from tests.corpus.generator import TODAY, generate
from tests.corpus.scoring import aggregate, score

# Every field family must stay at or above this accuracy on the fixed corpus.
FIELD_FLOOR = 0.98
# Share of resumes where every single field is right.
FULLY_CORRECT_FLOOR = 0.95


def run(seeds: list[int], formats: list[str], workdir: Path, ocr: bool = False):
    extractor = DocumentExtractor(ocr=create_ocr("tesseract", "eng") if ocr else None)
    scores = []
    for index, seed in enumerate(seeds):
        sample = generate(seed, formats[index % len(formats)], workdir)
        document, _ = extractor.extract(sample.kind, sample.data)  # type: ignore[arg-type]
        data = RuleBasedParser(default_phone_region="US", today=TODAY).parse(document.lines)
        scores.append((seed, sample.style.fmt, score(sample.truth, data)))
    return scores


def report(scores) -> tuple[dict[str, float], float, list[str]]:
    agg = aggregate([s for _, _, s in scores])
    accuracy = {fam: ok / n for fam, (ok, n) in agg.items()}
    fully = sum(1 for *_, s in scores if not s.failures) / len(scores)
    failing = [f"seed {seed} ({fmt}): {s.failures}" for seed, fmt, s in scores if s.failures]
    return accuracy, fully, failing


def test_corpus_pdf_and_docx(tmp_path):
    scores = run(list(range(1, 151)), ["pdf", "docx", "docx-table"], tmp_path)
    accuracy, fully, failing = report(scores)
    low = {fam: round(acc, 3) for fam, acc in accuracy.items() if acc < FIELD_FLOOR}
    assert not low, f"Fields below {FIELD_FLOOR:.0%}: {low}\n" + "\n".join(failing[:15])
    assert fully >= FULLY_CORRECT_FLOOR, f"Only {fully:.1%} fully correct\n" + "\n".join(
        failing[:15]
    )


@pytest.mark.skipif(shutil.which("soffice") is None, reason="LibreOffice not installed")
def test_corpus_word_exports(tmp_path):
    scores = run(list(range(20000, 20012)), ["lo-pdf", "doc"], tmp_path)
    accuracy, fully, failing = report(scores)
    assert min(accuracy.values()) >= FIELD_FLOOR, "\n".join(failing)
    assert fully >= FULLY_CORRECT_FLOOR, "\n".join(failing)


@pytest.mark.skipif(shutil.which("tesseract") is None, reason="tesseract not installed")
def test_corpus_ocr_images(tmp_path):
    # OCR misreads individual letters ("Iyer" → "lyer"), so the bar is structural:
    # sections, entries, dates and point counts must be right.
    scores = run(list(range(20000, 20008)), ["png"], tmp_path, ocr=True)
    accuracy, _, failing = report(scores)
    structural = [
        "experience.count",
        "experience.start",
        "experience.end",
        "education.count",
        "projects.count",
        "phone",
    ]
    low = {fam: accuracy[fam] for fam in structural if fam in accuracy and accuracy[fam] < 0.95}
    assert not low, f"{low}\n" + "\n".join(failing)
