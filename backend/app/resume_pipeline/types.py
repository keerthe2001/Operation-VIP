from dataclasses import dataclass, field
from typing import Literal

FileKind = Literal["pdf", "docx", "doc", "png", "jpeg"]


@dataclass(frozen=True)
class TextLine:
    """One visual line of the document with the style cues the parser relies on."""

    text: str
    size: float = 11.0
    bold: bool = False
    page: int = 1
    # True when the source explicitly marked this as a heading (e.g. DOCX "Heading 1").
    heading_style: bool = False
    # True when the source marked the line as a list item.
    list_item: bool = False


@dataclass
class ExtractedDocument:
    lines: list[TextLine]
    page_count: int
    method: str
    warnings: list[str] = field(default_factory=list)
    ocr_confidence: float | None = None

    @property
    def text(self) -> str:
        return "\n".join(line.text for line in self.lines)
