"""Date and date-range recognition. Output keeps the precision found in the source."""

import re
from dataclasses import dataclass
from datetime import date

MONTHS = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}

_MONTH = r"(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?"
_YEAR = r"(?:19[5-9]\d|20\d{2})"
_SINGLE = (
    rf"(?:{_MONTH}\s*,?\s*'?{_YEAR}|{_MONTH}\s*'\d{{2}}|(?:0?[1-9]|1[0-2])\s*[/.-]\s*{_YEAR}"
    rf"|{_YEAR}\s*[/.-]\s*(?:0[1-9]|1[0-2])|{_YEAR})"
)
_PRESENT = r"(?:present|current(?:ly)?|now|today|till date|to date|ongoing|date)"
_SEP = r"\s*(?:-|–|—|−|~|to|until|till|through|–|—)\s*"

RANGE_RE = re.compile(rf"(?P<start>{_SINGLE}){_SEP}(?P<end>{_SINGLE}|{_PRESENT})", re.IGNORECASE)
SINGLE_RE = re.compile(_SINGLE, re.IGNORECASE)
YEAR_RE = re.compile(rf"\b{_YEAR}\b")


@dataclass(frozen=True)
class DateRange:
    start: str | None
    end: str | None
    is_current: bool
    span: tuple[int, int]


def normalize_date(raw: str) -> str | None:
    """Convert a single date mention to 'YYYY' or 'YYYY-MM'."""
    text = raw.strip().lower().replace(",", " ").replace(".", " ")
    month_match = re.match(r"([a-z]+)\s*'?\s*(\d{2,4})", text)
    if month_match and month_match.group(1)[:3] in MONTHS:
        month = MONTHS.get(month_match.group(1), MONTHS.get(month_match.group(1)[:3]))
        year_text = month_match.group(2)
        year = int(year_text) if len(year_text) == 4 else 2000 + int(year_text)
        return f"{year:04d}-{month:02d}" if month else f"{year:04d}"
    numeric = re.match(r"(\d{1,2})\s*[/ -]\s*(\d{4})$", text)
    if numeric:
        return f"{int(numeric.group(2)):04d}-{int(numeric.group(1)):02d}"
    iso = re.match(r"(\d{4})\s*[/ -]\s*(\d{1,2})$", text)
    if iso:
        return f"{int(iso.group(1)):04d}-{int(iso.group(2)):02d}"
    year_match = YEAR_RE.search(text)
    return year_match.group(0) if year_match else None


def find_date_range(text: str) -> DateRange | None:
    match = RANGE_RE.search(text)
    if not match:
        return None
    end_raw = match.group("end")
    is_current = bool(re.fullmatch(_PRESENT, end_raw.strip(), re.IGNORECASE))
    return DateRange(
        start=normalize_date(match.group("start")),
        end=None if is_current else normalize_date(end_raw),
        is_current=is_current,
        span=match.span(),
    )


def to_month_index(value: str | None, *, default_month: int) -> int | None:
    if not value:
        return None
    year = int(value[:4])
    month = int(value[5:7]) if len(value) >= 7 else default_month
    return year * 12 + (month - 1)


def total_years(ranges: list[tuple[str | None, str | None, bool]], today: date) -> float | None:
    """Sum of merged (non-overlapping) intervals, in years with one decimal."""
    intervals: list[tuple[int, int]] = []
    now = today.year * 12 + today.month - 1
    for start, end, current in ranges:
        s = to_month_index(start, default_month=1)
        # The running month of a current job is not complete yet, so it isn't counted.
        e = now - 1 if current else to_month_index(end, default_month=12)
        if s is None or e is None or e < s:
            continue
        intervals.append((s, e + 1))
    if not intervals:
        return None
    intervals.sort()
    merged = [intervals[0]]
    for s, e in intervals[1:]:
        if s <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))
    months = sum(e - s for s, e in merged)
    return round(months / 12, 1)
