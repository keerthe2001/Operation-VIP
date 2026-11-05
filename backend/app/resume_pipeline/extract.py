"""Document classification + text extraction (pipeline steps 2 and 3)."""

from dataclasses import dataclass

from app.db.models import DocumentClass
from app.resume_pipeline.extractors.doc import extract_doc
from app.resume_pipeline.extractors.docx import extract_docx
from app.resume_pipeline.extractors.image import extract_image, ocr_pdf_pages
from app.resume_pipeline.extractors.pdf import extract_pdf
from app.resume_pipeline.ocr import OcrProvider
from app.resume_pipeline.types import ExtractedDocument, FileKind


@dataclass
class DocumentExtractor:
    ocr: OcrProvider | None
    ocr_dpi: int = 300
    ocr_max_pages: int = 6
    libreoffice_binary: str = "soffice"

    def extract(self, kind: FileKind, data: bytes) -> tuple[ExtractedDocument, DocumentClass]:
        """Blocking (CPU-bound); call through `asyncio.to_thread`."""
        if kind == "pdf":
            return self._pdf(data)
        if kind == "docx":
            return extract_docx(data), DocumentClass.DOCX
        if kind == "doc":
            return extract_doc(data, self.libreoffice_binary), DocumentClass.DOC
        return extract_image(data, self.ocr, dpi=self.ocr_dpi), DocumentClass.IMAGE

    def _pdf(self, data: bytes) -> tuple[ExtractedDocument, DocumentClass]:
        document, textless = extract_pdf(data)
        if not textless:
            return document, DocumentClass.TEXT_PDF

        to_ocr = textless[: self.ocr_max_pages]
        pages, engine = ocr_pdf_pages(data, to_ocr, self.ocr, dpi=self.ocr_dpi)
        # Merge OCR'd pages back in page order with the text pages.
        lines = sorted(
            [*document.lines, *(line for page in pages for line in page.lines)],
            key=lambda line: line.page,
        )
        confidences = [p.confidence for p in pages if p.confidence is not None]
        scanned = len(textless) == document.page_count
        merged = ExtractedDocument(
            lines=lines,
            page_count=document.page_count,
            method=f"ocr-{engine}" if scanned else f"pdf-text+ocr-{engine}",
            warnings=list(document.warnings),
            ocr_confidence=round(sum(confidences) / len(confidences), 1) if confidences else None,
        )
        if len(textless) > len(to_ocr):
            merged.warnings.append(f"Only the first {self.ocr_max_pages} scanned pages were read.")
        if merged.ocr_confidence is not None and merged.ocr_confidence < 70:
            merged.warnings.append("Low OCR confidence: the scan may be blurry or low resolution.")
        return merged, DocumentClass.SCANNED_PDF if scanned else DocumentClass.TEXT_PDF
