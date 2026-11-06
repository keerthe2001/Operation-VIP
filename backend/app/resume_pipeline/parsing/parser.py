"""Rule-based resume parser.

Turns extracted lines (text + font size + boldness) into `ResumeData`. It relies on:

* layout cues: the largest text near the top is usually the name; short, bold or
  upper-case lines that match a heading lexicon start sections;
* patterns: e-mail, phone, URL and date-range expressions;
* dictionaries: job-title words, degree names, institutions, skills, certification issuers.

Each extracted value gets a confidence score reflecting how reliable its rule is.
Nothing is invented: if a rule does not fire, the field stays null.
"""

from __future__ import annotations

import itertools
import re
import statistics
from dataclasses import dataclass, field
from datetime import date

import phonenumbers

from app.resume_pipeline.parsing import lexicons
from app.resume_pipeline.parsing.dates import YEAR_RE, find_date_range, normalize_date, total_years
from app.resume_pipeline.types import TextLine
from app.schemas.resume_data import (
    CertificationItem,
    EducationItem,
    ExperienceItem,
    FieldMeta,
    PersonalInformation,
    ProfessionalSummary,
    ProjectItem,
    ResumeData,
    Skills,
)

PARSER_VERSION = "rules-1.1"

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
URL_RE = re.compile(
    r"(?:https?://)?(?:www\.)?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:com|in|io|dev|me|org|net|co|ai|app|tech|xyz|page|site|us|uk|ca|de|design|studio|art|online|store|works|info|blog|space|website|link|ly|gg|so|to|fyi|codes|digital|eu|au|sg)(?![A-Za-z0-9-])"
    r"(?:/[^\s,|;)]*)?",
    re.IGNORECASE,
)
# Bullet glyphs, including Symbol/Wingdings bullets that Word-exported PDFs encode in the
# Unicode private-use area (U+F0B7, U+F0A7, U+F076, ...), and "o" second-level bullets.
_BULLET_GLYPHS = "•●▪■□◦‣∙·➢➤►▸»✓✔❖◆◇⮚➔→⇒★☆✦✧❯›\uf000-\uf0ff\ue000-\uef00"
BULLET_RE = re.compile(
    rf"^\s*(?:[{_BULLET_GLYPHS}]\s*|[\-–—*]\s+|o\s+(?=[A-Z])|\(?\d{{1,2}}[.)]\s+|\(?[a-z][.)]\s+(?=[A-Z]))"
)
MONTH_NAMES = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?"

US_STATE_RE = re.compile(
    r",\s*(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b"
)

# A line this long that doesn't end a sentence has most likely wrapped onto the next line.
WRAP_LENGTH = 55
CONNECTORS = {
    "and",
    "or",
    "to",
    "with",
    "for",
    "of",
    "in",
    "by",
    "using",
    "via",
    "including",
    "while",
}
LABEL_LINE_RE = re.compile(r"^[A-Za-z][A-Za-z /&]{1,24}:\s")
ACHIEVEMENT_LABEL_RE = re.compile(
    r"^(?:key\s+)?(?:achievements?|accomplishments?|highlights|impact|results|awards?)\s*[:\-–]?\s*(?P<rest>.*)$",
    re.IGNORECASE,
)
METRIC_RE = re.compile(
    r"\d+(?:\.\d+)?\s*(?:%|x\b|k\b|m\b|\+)|\$\s?\d|₹\s?\d|\b(?:increased|reduced|improved|"
    r"grew|saved|cut|boosted|decreased|accelerated|won|awarded|ranked)\b",
    re.IGNORECASE,
)
EXPLICIT_YEARS_RE = re.compile(
    r"(\d{1,2}(?:\.\d)?)\s*\+?\s*(?:years|yrs)(?:\s+of)?(?:\s+\w+){0,3}\s+experience", re.IGNORECASE
)
GRADE_RE = re.compile(
    r"(?:(?:c?gpa|cpi|sgpa|grade)\s*[:\-]?\s*(\d{1,2}(?:\.\d{1,2})?)(?:\s*/\s*(\d{1,2}(?:\.\d{1,2})?))?)"
    r"|(\d{2}(?:\.\d{1,2})?)\s*%",
    re.IGNORECASE,
)
EMPLOYMENT_TYPES = (
    ("internship", "Internship"),
    ("intern", "Internship"),
    ("part-time", "Part-time"),
    ("part time", "Part-time"),
    ("full-time", "Full-time"),
    ("full time", "Full-time"),
    ("contract", "Contract"),
    ("freelance", "Freelance"),
    ("self-employed", "Self-employed"),
)
LOCATION_RE = re.compile(
    r"\b(?:remote|hybrid|on-?site)\b|^[A-Z][A-Za-z .'-]{1,30},\s*[A-Z][A-Za-z .'-]{1,30}$"
)
_PLACE = r"[A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+){0,2}"
PLACE_RE = re.compile(rf"{_PLACE},\s*{_PLACE}|[Rr]emote|[Hh]ybrid")
TRAILING_PLACE_RE = re.compile(rf"^(.+?),\s*({_PLACE},\s*{_PLACE})$")
SPLIT_RE = re.compile(r"\s+(?:\||•|·|–|—|-|@|at)\s+|\s*\|\s*|,\s+(?=[A-Z])")
TECH_LABEL_RE = re.compile(
    r"^(?:tech(?:nologies|nology| stack)?|tools(?: used)?|stack|built with)\s*:", re.I
)
SKILL_SPLIT_RE = re.compile(r"\s*(?:,|;|\||•|·|/(?!\s?[A-Za-z]{1,2}\b))\s*")


def _clean(text: str) -> str:
    text = re.sub(r"\(\s*\)|\[\s*\]", "", BULLET_RE.sub("", text))
    cleaned = " ".join(text.split()).strip(" ,;:|-–—")
    # Unbalanced brackets left behind after removing a date: "Engineer (" → "Engineer".
    if cleaned.count("(") > cleaned.count(")"):
        cleaned = cleaned.rstrip(" (")
    if cleaned.count(")") > cleaned.count("("):
        cleaned = cleaned.lstrip(") ")
    return cleaned


def _norm_heading(text: str) -> str:
    cleaned = re.sub(r"[^a-z ]+", " ", text.lower().replace("&", " and "))
    return " ".join(cleaned.split())


CONTACT_HEADINGS = {
    "contact",
    "contact information",
    "contact details",
    "contact info",
    "personal details",
    "personal information",
    "personal info",
    "get in touch",
    "reach me",
}

# Lexicon entries normalized the same way as the text they are compared with.
NORMALIZED_HEADINGS = {
    kind: {_norm_heading(name) for name in names}
    for kind, names in lexicons.SECTION_HEADINGS.items()
}


def _is_bullet(line: TextLine) -> bool:
    return line.list_item or bool(BULLET_RE.match(line.text))


@dataclass
class _EducationDraft:
    degree: str | None = None
    institution: str | None = None
    specialization: str | None = None
    texts: list[str] = field(default_factory=list)


@dataclass
class Section:
    kind: str
    title: str
    lines: list[TextLine] = field(default_factory=list)


class RuleBasedParser:
    version = PARSER_VERSION

    def __init__(self, *, default_phone_region: str = "US", today: date | None = None) -> None:
        self.region = default_phone_region.upper()
        self.today = today or date.today()
        self.meta: dict[str, FieldMeta] = {}
        self._skill_patterns = [
            (name, category, re.compile(rf"(?<![\w.+#]){re.escape(name)}(?![\w+#]|\.\w)", re.I))
            for name, category in sorted(lexicons.SKILLS.items(), key=lambda kv: -len(kv[0]))
        ]

    # ------------------------------------------------------------------ public API

    def parse(self, lines: list[TextLine]) -> ResumeData:
        self.meta = {}
        lines = [ln for ln in lines if ln.text.strip()]
        body_size = statistics.median([ln.size for ln in lines]) if lines else 11.0
        lines = self._rejoin_wrapped(lines, body_size)
        header, sections = self._split_sections(lines, body_size)
        full_text = "\n".join(ln.text for ln in lines)

        # A "Contact" / "Personal details" section (common in sidebars) counts as header.
        contact = [
            ln
            for sec in sections
            if _norm_heading(sec.title) in CONTACT_HEADINGS
            for ln in sec.lines
        ]
        personal = self._personal(header, full_text, body_size, contact)
        experience = self._experience(self._lines_of(sections, "experience"))
        education = self._education(self._lines_of(sections, "education"))
        skills = self._skills(self._lines_of(sections, "skills"), full_text)
        projects = self._projects(self._lines_of(sections, "projects"))
        certifications = self._certifications(self._lines_of(sections, "certifications"))
        summary = self._summary(self._lines_of(sections, "summary"), experience, header)

        return ResumeData(
            personal_information=personal,
            professional_summary=summary,
            experience=experience,
            education=education,
            skills=skills,
            projects=projects,
            certifications=certifications,
            field_meta=self.meta,
        )

    # ------------------------------------------------------------------ sections

    def _rejoin_wrapped(self, lines: list[TextLine], body_size: float) -> list[TextLine]:
        """Undo line wrapping that splits a date range or a section heading in two."""
        out: list[TextLine] = []
        for line in lines:
            previous = out[-1] if out else None
            if previous is not None:
                text = line.text.strip()
                # "(10/2023 –" + "Current)"  /  "Jan 2020 to" + "Mar 2022"
                month_break = re.search(
                    rf"\(?\b(?:{MONTH_NAMES})\.?\s*$", previous.text, re.I
                ) and re.match(r"^'?\d{2,4}\b", text)
                # "(2021-10" + "– 2022-12)": the separator starts the next line.
                dash_break = (
                    not find_date_range(previous.text)
                    and re.search(
                        r"(?:\d{4}(?:[-/.]\d{1,2})?|\d{1,2}[-/.]\d{4}|'\d{2})\s*$", previous.text
                    )
                    and re.match(
                        rf"^(?:[-–—]|to\b)\s*\(?(?:present|current|now|today|\d{{1,2}}[-/.]\d{{4}}\b|\d{{4}}\b|(?:{MONTH_NAMES})\.?\s*'?\d)",
                        text,
                        re.I,
                    )
                )
                if (
                    month_break
                    or dash_break
                    or (
                        re.search(
                            r"(?:\d|present|current|now)\s*(?:[-–—]|to)\s*$", previous.text, re.I
                        )
                        and (
                            re.match(
                                r"^\(?(?:present|current|now|today|\d{1,2}[/.-]\d{4}|\d{4}|[a-z]{3,9}\.?\s*'?\d{2,4})",
                                text,
                                re.I,
                            )
                        )
                    )
                ):
                    out[-1] = TextLine(
                        text=f"{previous.text.rstrip()} {text}",
                        size=previous.size,
                        bold=previous.bold,
                        page=previous.page,
                        heading_style=previous.heading_style,
                        list_item=previous.list_item,
                    )
                    continue
                # "TECHNICAL" + "SKILLS" in a narrow sidebar
                joined = f"{previous.text.strip()} {text}"
                if (
                    previous.size == line.size
                    and previous.bold == line.bold
                    and (previous.bold or line.size >= body_size + 1)
                    and len(joined.split()) <= 4
                    and self._heading_kind(previous, body_size) is None
                    and self._heading_kind(line, body_size) is None
                    and self._heading_kind(
                        TextLine(joined, line.size, line.bold, line.page, line.heading_style),
                        body_size,
                    )
                ):
                    out[-1] = TextLine(joined, line.size, line.bold, line.page, line.heading_style)
                    continue
            out.append(line)
        return out

    def _heading_kind(self, line: TextLine, body_size: float) -> str | None:
        text = line.text.strip()
        words = text.split()
        if not words or len(words) > 6 or len(text) > 50 or _is_bullet(line):
            return None
        normalized = _norm_heading(text)
        styled = (
            line.heading_style
            or line.bold
            or line.size >= body_size + 1
            or (text.isupper() and len(text) > 3)
        )
        plain_ok = len(words) <= 3 and not re.search(r"[.,;]", text)
        for kind, names in NORMALIZED_HEADINGS.items():
            # An exact lexicon match is enough when styled; plain matches must be short
            # and contain no sentence punctuation to avoid catching body text.
            if normalized in names and (styled or plain_ok):
                return kind
        # Styled short lines with a section keyword ("ACADEMIC DETAILS", "Key Projects").
        strongly_styled = line.heading_style or text.isupper() or line.size >= body_size + 1.5
        if strongly_styled and len(words) <= 4 and not re.search(r"[.,;:@|\d]", text):
            for keyword, kind in lexicons.HEADING_KEYWORDS:
                if keyword in normalized:
                    return kind
        return None

    def _split_sections(
        self, lines: list[TextLine], body_size: float
    ) -> tuple[list[TextLine], list[Section]]:
        header: list[TextLine] = []
        sections: list[Section] = []
        for line in lines:
            kind = self._heading_kind(line, body_size)
            if kind:
                sections.append(Section(kind=kind, title=line.text))
            elif sections:
                sections[-1].lines.append(line)
            else:
                header.append(line)
        return header, sections

    @staticmethod
    def _lines_of(sections: list[Section], kind: str) -> list[TextLine]:
        return [ln for s in sections if s.kind == kind for ln in s.lines]

    def _set_meta(self, path: str, confidence: float, source: str | None) -> None:
        self.meta[path] = FieldMeta(
            confidence=round(confidence, 2), source=(source or "")[:300] or None
        )

    # ------------------------------------------------------------------ personal

    def _personal(
        self, header: list[TextLine], text: str, body_size: float, contact: list[TextLine]
    ) -> PersonalInformation:
        info = PersonalInformation()
        prefix = "personal_information"

        email = EMAIL_RE.search(text)
        if email:
            info.email = email.group(0).lower().rstrip(".")
            self._set_meta(f"{prefix}.email", 0.97, email.group(0))

        phone = self._phone(text, [*header, *contact])
        if phone:
            info.phone, raw = phone
            self._set_meta(f"{prefix}.phone", 0.9, raw)

        header_text = "\n".join(ln.text for ln in header)
        for match in URL_RE.finditer(text):
            url = match.group(0).rstrip("./")
            if match.start() > 0 and text[match.start() - 1] == "@":
                continue  # domain part of an e-mail address
            lowered = url.lower()
            normalized = url if lowered.startswith("http") else f"https://{url}"
            if "linkedin.com/" in lowered:
                if not info.linkedin:
                    info.linkedin = normalized
                    self._set_meta(f"{prefix}.linkedin", 0.95, url)
            elif "github.com/" in lowered:
                if not info.github:
                    info.github = normalized
                    self._set_meta(f"{prefix}.github", 0.95, url)
            elif not info.portfolio and url in header_text and "linkedin" not in lowered:
                # Only links in the contact header count as a personal site; links in the
                # body are usually employers or projects.
                info.portfolio = normalized
                self._set_meta(f"{prefix}.portfolio", 0.7, url)

        name_line = self._name(header, body_size)
        if name_line:
            name, confidence = name_line
            info.full_name = name
            self._set_meta(f"{prefix}.full_name", confidence, name)
            parts = name.split()
            if len(parts) >= 2:
                info.first_name, info.last_name = parts[0], " ".join(parts[1:])
                self._set_meta(f"{prefix}.first_name", confidence - 0.05, name)
                self._set_meta(f"{prefix}.last_name", confidence - 0.1, name)

        location = self._location(header) or self._location(contact)
        if location:
            info.location = location
            self._set_meta(f"{prefix}.location", 0.6, location)
        return info

    def _phone(self, text: str, header: list[TextLine] | None = None) -> tuple[str, str] | None:
        # The country comes from the person's own contact details, not e.g. a university name.
        contact_text = " ".join(ln.text for ln in header or [])
        lowered = contact_text.lower()
        hinted = ["US"] if US_STATE_RE.search(contact_text) else []
        hinted += [
            region
            for word, region in lexicons.COUNTRY_HINTS.items()
            if re.search(rf"\b{re.escape(word)}\b", lowered)
        ]
        # International numbers first, then the location's country, then common regions.
        regions: list[str] = ["ZZ", *hinted, self.region, *lexicons.COMMON_REGIONS]
        # Contact details live in the header; elsewhere, skip lines with dates so a range
        # like "11/2023 - 11/2024" is never read as a phone number.
        candidates = [ln.text for ln in header or []]
        candidates += [
            line
            for line in text.splitlines()
            if not find_date_range(line) and not YEAR_RE.search(line) and line not in candidates
        ]
        for chunk in candidates:
            for region in dict.fromkeys(regions):
                for match in phonenumbers.PhoneNumberMatcher(chunk, region, leniency=1):
                    if YEAR_RE.fullmatch(match.raw_string.strip()):
                        continue
                    if phonenumbers.is_valid_number(match.number):
                        formatted = phonenumbers.format_number(
                            match.number, phonenumbers.PhoneNumberFormat.E164
                        )
                        return formatted, match.raw_string
        return None

    def _name(self, header: list[TextLine], body_size: float) -> tuple[str, float] | None:
        candidates = header[:6]

        def looks_like_name(text: str) -> bool:
            cleaned = text.strip()
            words = cleaned.split()
            if not 1 < len(words) <= 4 or len(cleaned) > 50:
                return False
            if re.search(r"[\d@/:|]", cleaned) or _norm_heading(cleaned) in {
                n for names in NORMALIZED_HEADINGS.values() for n in names
            }:
                return False
            if any(w.lower().strip(",.") in lexicons.TITLE_KEYWORDS for w in words):
                return False
            return all(re.fullmatch(r"[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ.'-]*,?", w) for w in words)

        named = [ln for ln in candidates if looks_like_name(ln.text)]
        if not named:
            return None
        biggest = max(named, key=lambda ln: ln.size)
        name = " ".join(w.capitalize() if w.isupper() else w for w in biggest.text.split())
        name = name.rstrip(",")
        confidence = (
            0.9 if biggest.size > body_size + 2 else (0.75 if biggest is named[0] else 0.55)
        )
        return name, confidence

    def _location(self, header: list[TextLine]) -> str | None:
        # A narrow sidebar can wrap "London, United" / "Kingdom": try rejoined pairs first.
        for first, second in itertools.pairwise(header):
            joined = f"{first.text.strip()} {second.text.strip()}"
            if (
                re.fullmatch(r"[A-Z][A-Za-z .'-]+(?: [A-Z][A-Za-z.'-]+){0,2}", second.text.strip())
                and len(second.text.split()) <= 2
                and re.fullmatch(
                    r"[A-Z][A-Za-z .'-]{1,30},\s*[A-Z][A-Za-z .'-]{1,30}(?:,\s*[A-Z][A-Za-z .'-]{1,30})?",
                    joined,
                )
                and not EMAIL_RE.search(joined)
            ):
                return joined
        for line in header:
            for part in re.split(r"\s*[|•·]\s*|\s{3,}", line.text):
                part = part.strip()
                if EMAIL_RE.search(part) or URL_RE.fullmatch(part) or re.search(r"\d{3}", part):
                    continue
                if re.fullmatch(
                    r"[A-Z][A-Za-z .'-]{1,30},\s*[A-Z][A-Za-z .'-]{1,30}(?:,\s*[A-Z][A-Za-z .'-]{1,30})?",
                    part,
                ):
                    return part
        return None

    # ------------------------------------------------------------------ experience

    def _is_title(self, text: str) -> bool:
        lowered = text.lower()
        return any(re.search(rf"\b{re.escape(k)}\b", lowered) for k in lexicons.TITLE_KEYWORDS)

    def _is_company(self, text: str) -> bool:
        return self._company_score(text) > 0

    @staticmethod
    def _company_score(text: str) -> int:
        lowered = text.lower()

        def hit(word: str) -> bool:
            return re.search(rf"(?<!\w){re.escape(word)}(?!\w)", lowered) is not None

        strong = sum(2 for h in lexicons.COMPANY_STRONG_HINTS if hit(h))
        weak = sum(
            1 for h in lexicons.COMPANY_HINTS if h not in lexicons.COMPANY_STRONG_HINTS and hit(h)
        )
        return strong + weak

    def _title_score(self, text: str) -> int:
        lowered = text.lower()
        return sum(2 for k in lexicons.TITLE_KEYWORDS if re.search(rf"\b{re.escape(k)}\b", lowered))

    def _looks_like_header_detail(self, text: str) -> bool:
        """A line under a job's dates that still belongs to its header (title, company, place)."""
        cleaned = _clean(text)
        return bool(
            self._title_score(cleaned)
            or self._company_score(cleaned)
            or PLACE_RE.search(cleaned)
            or any(re.search(rf"\b{key}\b", cleaned.lower()) for key, _ in EMPLOYMENT_TYPES)
        )

    @staticmethod
    def _can_be_header(line: TextLine) -> bool:
        text = line.text.strip()
        return (
            not _is_bullet(line)
            and len(text) <= 90
            and not text[:1].islower()
            and not (text.endswith(".") and not text.endswith(("Inc.", "Ltd.", "Co.", "Corp.")))
        )

    def _experience(self, lines: list[TextLine]) -> list[ExperienceItem]:
        if not lines:
            return []
        anchors = [
            i for i, ln in enumerate(lines) if not _is_bullet(ln) and find_date_range(ln.text)
        ]
        if not anchors:
            return []

        # Each entry's header: up to 2 short non-bullet lines before the date line
        # (not consumed by the previous entry) and up to 2 before the first bullet after it.
        entries: list[tuple[list[TextLine], list[TextLine], TextLine]] = []
        consumed_until = -1
        for n, anchor in enumerate(anchors):
            start = anchor
            while (
                start - 1 > consumed_until
                and anchor - (start - 1) <= 2
                and self._can_be_header(lines[start - 1])
                and not find_date_range(lines[start - 1].text)
            ):
                start -= 1
            next_anchor = anchors[n + 1] if n + 1 < len(anchors) else len(lines)
            # Lines belonging to the next entry's header must not become bullets of this one.
            next_start = next_anchor
            while (
                next_start - 1 > anchor
                and next_anchor - (next_start - 1) <= 2
                and self._can_be_header(lines[next_start - 1])
            ):
                next_start -= 1
            if next_anchor == len(lines):
                next_start = len(lines)
            head = lines[start : anchor + 1]
            after = anchor + 1
            while (
                after < next_start
                and len(head) < 4
                and self._can_be_header(lines[after])
                and len(lines[after].text) <= 70
                and len(lines[after].text.split()) <= 8
                and self._looks_like_header_detail(lines[after].text)
                and not (after + 1 < next_start and lines[after + 1].text.strip()[:1].islower())
            ):
                head.append(lines[after])
                after += 1
            body = lines[after:next_start]
            entries.append((head, body, lines[anchor]))
            consumed_until = next_start - 1

        items: list[ExperienceItem] = []
        for head, body, date_line in entries:
            items.append(self._experience_item(head, body, date_line))
        return items

    def _experience_item(
        self, head: list[TextLine], body: list[TextLine], date_line: TextLine
    ) -> ExperienceItem:
        date_range = find_date_range(date_line.text)
        if date_range is None:  # anchors always contain a range; keep mypy and -O safe
            return ExperienceItem()
        fragments: list[str] = []
        fragment_lines: list[int] = []
        location: str | None = None
        for line_index, line in enumerate(head):
            text = line.text
            if line is date_line:
                text = text[: date_range.span[0]] + "   " + text[date_range.span[1] :]
            for piece in re.split(r"\s*[|•·]\s*|\s{2,}", text):
                piece = _clean(piece)
                if not piece:
                    continue
                if (
                    PLACE_RE.fullmatch(piece)
                    and not self._is_company(piece)
                    and not self._is_title(piece)
                ):
                    location = location or piece
                    continue
                trailing = TRAILING_PLACE_RE.match(piece)
                if trailing and not self._is_title(trailing.group(2)):
                    location = location or trailing.group(2)
                    piece = trailing.group(1)
                for part in SPLIT_RE.split(piece):
                    part = _clean(part)
                    if part and not re.fullmatch(r"[\W\d]*", part):
                        fragments.append(part)
                        fragment_lines.append(line_index)

        # A narrow column can wrap "Engineer — Acme" / "Technologies Pvt Ltd": rejoin a
        # dangling capitalized word with the company-like fragment that follows it.
        merged: list[str] = []
        for position, fragment in enumerate(fragments):
            if (
                merged
                and position > 0
                and fragment_lines[position] != fragment_lines[position - 1]
                and len(merged[-1].split()) == 1
                and merged[-1][:1].isupper()
                and self._title_score(merged[-1]) == 0
                and self._company_score(merged[-1]) == 0
                and (self._company_score(fragment) > 0 or self._title_score(fragment) > 0)
                and not PLACE_RE.fullmatch(fragment)
            ):
                merged[-1] = f"{merged[-1]} {fragment}"
            else:
                merged.append(fragment)
        fragments = merged

        employment_type = None
        remaining: list[str] = []
        for fragment in fragments:
            lowered = fragment.lower()
            matched_type = next(
                (label for key, label in EMPLOYMENT_TYPES if key == lowered.strip("() ")), None
            )
            if matched_type:
                employment_type = matched_type
                continue
            if (
                LOCATION_RE.search(fragment)
                and not self._is_company(fragment)
                and not self._is_title(fragment)
            ):
                location = location or fragment
                continue
            remaining.append(fragment)

        designation = None
        title_ranked = sorted(
            (f for f in remaining if self._title_score(f) > 0),
            key=lambda f: self._title_score(f) - self._company_score(f),
            reverse=True,
        )
        if title_ranked and self._title_score(title_ranked[0]) > self._company_score(
            title_ranked[0]
        ):
            designation = title_ranked[0]
        others = [f for f in remaining if f != designation]
        company = max(others, key=self._company_score) if others else None
        if company is not None and self._company_score(company) == 0:
            # No company cue: take the first unassigned fragment.
            company = others[0]
        if designation is None and company is not None:
            designation = next((f for f in others if f != company), None)

        if employment_type is None:
            header_text = " ".join(ln.text.lower() for ln in head)
            employment_type = next(
                (label for key, label in EMPLOYMENT_TYPES if re.search(rf"\b{key}\b", header_text)),
                None,
            )

        responsibilities, achievements = self._bullets(body)
        technologies = self._find_skills(" ".join(ln.text for ln in [*head, *body]))

        confidence = 0.5
        if designation and self._title_score(designation) > self._company_score(designation):
            confidence += 0.2
        if company and self._company_score(company) > 0:
            confidence += 0.15
        if date_range.start:
            confidence += 0.1
        return ExperienceItem(
            company_name=company,
            designation=designation,
            employment_type=employment_type,
            location=location,
            start_date=date_range.start,
            end_date=date_range.end,
            is_current=date_range.is_current,
            responsibilities=responsibilities,
            achievements=achievements,
            technologies=technologies,
            confidence=round(min(confidence, 0.95), 2),
        )

    @staticmethod
    def _continues(previous_line: str, line: TextLine) -> bool:
        """Is this non-bullet line the wrapped rest of the previous line?"""
        text = line.text.strip()
        first = text.split(" ", 1)[0].lower()
        if text[:1].islower() or text[:1] in ",;)&" or first in CONNECTORS:
            return True
        # Otherwise only a long, unfinished previous line can have wrapped.
        previous = previous_line.strip()
        unfinished = not re.search(r"[.!?:]$|[.!?][\")\]]$", previous)
        return unfinished and len(previous) >= WRAP_LENGTH

    def _points(self, body: list[TextLine]) -> list[str]:
        """Bullet points (or one-sentence lines) with wrapped lines joined back together."""
        items: list[str] = []
        previous_raw = ""
        for line in body:
            text = _clean(line.text)
            if not text:
                continue
            if _is_bullet(line) or not items or not self._continues(previous_raw, line):
                items.append(text)
            else:
                items[-1] = f"{items[-1]} {text}"
            previous_raw = line.text
        return items

    def _bullets(self, body: list[TextLine]) -> tuple[list[str], list[str]]:
        """Responsibilities, plus achievements when the resume labels them explicitly."""
        responsibilities: list[TextLine] = []
        achievements: list[TextLine] = []
        target = responsibilities
        for line in body:
            text = line.text.strip()
            label = ACHIEVEMENT_LABEL_RE.match(BULLET_RE.sub("", text))
            if label:
                rest = label.group("rest").strip()
                if rest:  # "Achievement: Cut costs by 20%"
                    achievements.append(TextLine(text=rest, list_item=True))
                else:  # a sub-heading; following points are achievements
                    target = achievements
                continue
            target.append(line)
        return self._points(responsibilities), self._points(achievements)

    # ------------------------------------------------------------------ education

    def _education(self, lines: list[TextLine]) -> list[EducationItem]:
        degree_re = re.compile(r"\b(?:" + "|".join(lexicons.DEGREE_PATTERNS) + r")", re.IGNORECASE)
        entries: list[_EducationDraft] = []
        current: _EducationDraft | None = None

        def is_institution(text: str) -> bool:
            lowered = text.lower()
            return any(re.search(rf"\b{h}", lowered) for h in lexicons.INSTITUTION_HINTS)

        for line in lines:
            text = _clean(line.text)
            if not text:
                continue
            has_degree = bool(degree_re.search(text))
            has_inst = is_institution(text)
            starts_new = current is None or bool(
                (has_degree and current.degree)
                or (has_inst and current.institution and not has_degree)
            )
            if (has_degree or has_inst) and starts_new:
                current = _EducationDraft()
                entries.append(current)
            if current is None:
                continue
            current.texts.append(text)
            parts = [p for p in (_clean(GRADE_RE.sub("", p)) for p in SPLIT_RE.split(text)) if p]
            for index, part in enumerate(parts):
                if degree_re.search(part) and not current.degree:
                    current.degree = part
                    following = parts[index + 1] if index + 1 < len(parts) else None
                    following = self._strip_dates(following) if following else None
                    if (
                        following
                        and not is_institution(following)
                        and not degree_re.search(following)
                        and not re.search(r"\bin\b", part)
                    ):
                        current.specialization = following
                elif is_institution(part) and not current.institution:
                    current.institution = part

        items: list[EducationItem] = []
        for entry in entries:
            joined = " ".join(entry.texts)
            degree = entry.degree
            institution = entry.institution
            preset_specialization = entry.specialization
            if degree:
                degree = self._strip_dates(degree)
            if institution:
                institution = self._strip_dates(institution)
            specialization = preset_specialization
            if degree:
                # "Bachelor of Science in Physics": "of ..." belongs to the degree name,
                # "in ..." is the specialization.
                spec = re.search(r"\bin\s+([A-Z][A-Za-z &/,.-]{2,80})", degree)
                leading = degree_re.match(degree)
                trailing = degree[leading.end() :].strip(" .,-") if leading else ""
                if spec and not degree_re.fullmatch(spec.group(1).strip()):
                    specialization = spec.group(1).strip(" ,.-")
                    degree = degree[: spec.start()].strip(" ,-") or degree
                elif (
                    leading
                    and trailing[:1].isupper()
                    and "(" not in trailing
                    and not degree_re.search(trailing)
                    and not specialization
                ):
                    # "B.E. Computer Science and Engineering"
                    specialization = trailing
                    end = leading.end() + (
                        1 if degree[leading.end() : leading.end() + 1] == "." else 0
                    )
                    degree = degree[:end].strip()
                elif "(" in degree:
                    inner = re.search(r"\(([^)]+)\)", degree)
                    if inner and not GRADE_RE.search(inner.group(1)):
                        specialization = inner.group(1).strip()
                        degree = degree[: inner.start()].strip()
                if degree:
                    degree = (
                        re.sub(r"\s*[,-]\s*$", "", GRADE_RE.sub("", degree)).strip(" ,|-") or None
                    )
            years = [int(y) for y in YEAR_RE.findall(joined)]
            date_range = find_date_range(joined)
            grade_match = GRADE_RE.search(joined)
            grade = None
            if grade_match:
                if grade_match.group(1):
                    grade = grade_match.group(1) + (
                        f"/{grade_match.group(2)}" if grade_match.group(2) else ""
                    )
                elif grade_match.group(3):
                    grade = f"{grade_match.group(3)}%"
            confidence = 0.45 + (0.25 if degree else 0) + (0.2 if institution else 0)
            items.append(
                EducationItem(
                    degree=degree,
                    institution=institution,
                    specialization=specialization,
                    start_year=int(date_range.start[:4])
                    if date_range and date_range.start
                    else None,
                    graduation_year=(
                        int(date_range.end[:4])
                        if date_range and date_range.end
                        else (
                            max(years)
                            if years and not (date_range and date_range.is_current)
                            else None
                        )
                    ),
                    grade=grade,
                    confidence=round(min(confidence, 0.9), 2),
                )
            )
        return items

    @staticmethod
    def _strip_dates(text: str) -> str:
        date_range = find_date_range(text)
        if date_range:
            text = text[: date_range.span[0]] + text[date_range.span[1] :]
        text = re.sub(r"\b(?:19|20)\d{2}\b", "", text)
        return " ".join(text.split()).strip(" ,|-–()")

    # ------------------------------------------------------------------ skills

    def _find_skills(self, text: str) -> list[str]:
        found: list[str] = []
        seen: set[str] = set()
        for name, _category, pattern in self._skill_patterns:
            if name in {"C", "R", "Go", "S3", "Apache", "Work"}:
                # Too ambiguous to detect inside free text.
                continue
            if pattern.search(text) and name.lower() not in seen:
                # Skip "GitHub" when "GitHub Actions" was already found (longest first).
                if any(re.search(rf"\b{re.escape(name.lower())}\b", f.lower()) for f in found):
                    continue
                found.append(name)
                seen.add(name.lower())
        return found

    def _categorize(self, skill: str) -> str:
        lowered = skill.lower()
        for name, category in lexicons.SKILLS.items():
            if name.lower() == lowered:
                return category
        return "other"

    def _skills(self, lines: list[TextLine], full_text: str) -> Skills:
        buckets: dict[str, list[str]] = {k: [] for k in Skills.model_fields}
        seen: set[str] = set()

        def add(skill: str) -> None:
            skill = skill.strip(" .-–—()")
            if not skill or len(skill) > 40 or skill.lower() in seen or len(skill.split()) > 5:
                return
            seen.add(skill.lower())
            buckets[self._categorize(skill)].append(skill)

        if lines:
            # Narrow columns can wrap a multi-word skill: "Java, Spring" / "Boot, Docker".
            # Rejoin across the line break only when the halves form a known skill.
            known = {name.lower() for name in lexicons.SKILLS}
            groups: list[str] = []
            for line in lines:
                text = _clean(line.text)
                if not text:
                    continue
                label_split = re.match(r"^([A-Za-z &/]{2,40}):\s*(.+)$", text)
                content = label_split.group(2) if label_split else text
                previous = groups[-1] if groups else ""
                tail = re.split(r"[,;|•·]", previous)[-1].strip()
                head = re.split(r"[,;|•·]", content)[0].strip()
                if (
                    previous
                    and not label_split
                    and not re.search(r"[,;|•·]\s*$", previous)
                    and f"{tail} {head}".lower() in known
                ):
                    groups[-1] = f"{previous} {content}"
                else:
                    groups.append(content)
            for content in groups:
                for token in SKILL_SPLIT_RE.split(content):
                    add(token)
            self._set_meta("skills", 0.8, "skills section")
        else:
            for skill in self._find_skills(full_text):
                add(skill)
            if seen:
                self._set_meta("skills", 0.5, "detected in resume text")
        return Skills(**buckets)

    # ------------------------------------------------------------------ projects

    def _is_project_title(
        self, line: TextLine, previous: TextLine | None, bold_titles: bool
    ) -> bool:
        text = line.text.strip()
        if (
            _is_bullet(line)
            or len(text) > 100
            or TECH_LABEL_RE.match(text)
            or LABEL_LINE_RE.match(text)
        ):
            return False
        if bold_titles:
            # When the resume bolds project names, only bold lines start projects.
            return line.bold
        if previous is None:
            return True
        if find_date_range(text) or " | " in text or URL_RE.search(text):
            return True
        words = text.split()
        title_like = (
            len(words) <= 8
            and text[:1].isupper()
            and not re.search(r"[.;,]$", text)
            and not text.endswith(":")
        )
        # A short title-like line right after a finished point starts a new project.
        prev = previous.text.strip()
        return title_like and (
            not _is_bullet(line) and (bool(re.search(r"[.!?]$", prev)) or _is_bullet(previous))
        )

    def _projects(self, lines: list[TextLine]) -> list[ProjectItem]:
        lines = [ln for ln in lines if ln.text.strip()]
        non_bullets = [ln for ln in lines if not _is_bullet(ln)]
        # Bold only counts as the title style when it is used selectively.
        bold_titles = any(ln.bold for ln in non_bullets) and not all(ln.bold for ln in non_bullets)
        groups: list[tuple[TextLine, list[TextLine]]] = []
        previous: TextLine | None = None
        for line in lines:
            if self._is_project_title(line, previous, bold_titles) or not groups:
                groups.append((line, []))
            else:
                groups[-1][1].append(line)
            previous = line

        items: list[ProjectItem] = []
        for title_line, body in groups:
            title_text = BULLET_RE.sub("", title_line.text)
            url_match = URL_RE.search(title_text) or next(
                (m for ln in body if (m := URL_RE.search(ln.text))), None
            )
            date_range = find_date_range(title_text)
            if date_range:
                title_text = title_text[: date_range.span[0]] + title_text[date_range.span[1] :]
            parts = [p for p in (_clean(p) for p in SPLIT_RE.split(title_text)) if p]
            parts = [p for p in parts if not URL_RE.fullmatch(p)]
            name = parts[0] if parts else None
            role = None
            for part in parts[1:]:
                if self._title_score(part) > 0 and len(part.split()) <= 5:
                    role = part
            points_source: list[TextLine] = []
            for ln in body:
                cleaned = _clean(ln.text)
                role_match = re.match(r"^(?:my\s+)?role\s*:\s*(.{2,60})$", cleaned, re.I)
                if role_match:
                    role = role or role_match.group(1).strip(" .")
                elif not TECH_LABEL_RE.match(cleaned):
                    points_source.append(ln)
            points = self._points(points_source)
            items.append(
                ProjectItem(
                    project_name=name,
                    role=role,
                    points=points,
                    url=(
                        url_match.group(0)
                        if url_match and url_match.group(0).startswith("http")
                        else (f"https://{url_match.group(0)}" if url_match else None)
                    ),
                    confidence=0.75 if (title_line.bold or bold_titles) else 0.55,
                )
            )
        return [p for p in items if p.project_name]

    # ------------------------------------------------------------------ certifications

    def _certifications(self, lines: list[TextLine]) -> list[CertificationItem]:
        items: list[CertificationItem] = []
        for line in lines:
            text = _clean(line.text)
            # Short entries are allowed when they are acronyms (PMP, CPA, CKA).
            if not text or (len(text) < 4 and not (len(text) >= 2 and text.isupper())):
                continue
            if items and not _is_bullet(line) and not line.bold and text[:1].islower():
                continue  # wrapped continuation
            url_match = URL_RE.search(text)
            url = None
            if url_match and "/" in url_match.group(0):
                url = url_match.group(0)
                url = url if url.startswith("http") else f"https://{url}"
                text = (text[: url_match.start()] + text[url_match.end() :]).strip(" ,|-–")
            issued = None
            single = re.search(
                r"(?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*,?\s*)?(?:19|20)\d{2}",
                text,
                re.I,
            )
            if single:
                issued = normalize_date(single.group(0))
                text = (text[: single.start()] + text[single.end() :]).strip()
            text = re.sub(r"\(\s*\)", "", text).strip(" ,|-–()")
            splitter = r"\s*\|\s*" if "|" in text else r"\s+[–—-]\s+(?=[A-Z])|\s*,\s+|\s+by\s+"
            parts = [p for p in (_clean(p) for p in re.split(splitter, text)) if p]
            # A part that *is* an issuer ("CNCF", "Amazon Web Services") names the issuer and
            # the rest is the certification. Otherwise the whole line is the name and the
            # issuer is inferred from words inside it ("Oracle Certified Associate ...").
            issuer_index = next(
                (i for i, part in enumerate(parts) if len(parts) > 1 and self._is_issuer(part)),
                None,
            )
            if issuer_index is not None:
                issuer: str | None = parts[issuer_index]
                rest = [p for i, p in enumerate(parts) if i != issuer_index]
                name = ", ".join(rest) if "|" not in text else " – ".join(rest)
            else:
                name = _clean(text)
                key = next(
                    (
                        k
                        for k in lexicons.CERT_ISSUERS
                        if re.search(rf"\b{re.escape(k)}\b", text.lower())
                    ),
                    None,
                )
                issuer = lexicons.CERT_ISSUERS[key] if key else None
            items.append(
                CertificationItem(
                    certification_name=name,
                    issuing_organization=issuer,
                    issue_date=issued,
                    credential_url=url,
                    confidence=0.75 if issuer else 0.6,
                )
            )
        return items

    @staticmethod
    def _is_issuer(part: str) -> bool:
        lowered = part.lower().strip()
        canonical = {v.lower() for v in lexicons.CERT_ISSUERS.values()}
        if lowered in lexicons.CERT_ISSUERS or lowered in canonical:
            return True
        words = lowered.split()
        return (
            len(words) <= 3
            and "certif" not in lowered
            and any(re.search(rf"\b{re.escape(k)}\b", lowered) for k in lexicons.CERT_ISSUERS)
        )

    # ------------------------------------------------------------------ summary

    def _summary(
        self, lines: list[TextLine], experience: list[ExperienceItem], header: list[TextLine]
    ) -> ProfessionalSummary:
        summary = ProfessionalSummary()
        prefix = "professional_summary"
        text = " ".join(_clean(ln.text) for ln in lines).strip()
        if text:
            summary.summary = text[:5000]
            self._set_meta(f"{prefix}.summary", 0.85, text[:120])

        current = next((e for e in experience if e.is_current), None)
        latest = current or (experience[0] if experience else None)
        if latest and latest.designation:
            summary.current_designation = latest.designation
            self._set_meta(
                f"{prefix}.current_designation", 0.7 if current else 0.5, latest.designation
            )
        else:
            # A title-like line directly under the name (e.g. "Senior Backend Engineer").
            for line in header[1:4]:
                cleaned = _clean(line.text)
                if self._is_title(cleaned) and len(cleaned) <= 60 and not EMAIL_RE.search(cleaned):
                    summary.current_designation = cleaned
                    self._set_meta(f"{prefix}.current_designation", 0.55, cleaned)
                    break

        explicit = EXPLICIT_YEARS_RE.search(text) if text else None
        if explicit:
            summary.total_experience_years = float(explicit.group(1))
            self._set_meta(f"{prefix}.total_experience_years", 0.8, explicit.group(0))
        else:
            years = total_years(
                [
                    (e.start_date, e.end_date, e.is_current)
                    for e in experience
                    if e.employment_type != "Internship"
                ],
                self.today,
            )
            if years is not None:
                summary.total_experience_years = years
                self._set_meta(
                    f"{prefix}.total_experience_years", 0.65, "calculated from experience dates"
                )

        if experience:
            summary.employment_status = "employed" if current else "not_employed"
            self._set_meta(f"{prefix}.employment_status", 0.6 if current else 0.4, None)
        return summary
