"""Synthetic resume corpus with ground truth, for parser regression testing.

Every resume is generated from a random but realistic person (fictional) and rendered
with a random combination of layout choices. The ground truth is exactly what a careful
reader would extract from the rendered document.
"""

from __future__ import annotations

import io
import random
from dataclasses import dataclass, field
from datetime import date

from docx import Document
from docx.shared import Pt, RGBColor
from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4, LETTER
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

FONT_DIR = "/usr/share/fonts/truetype/dejavu"
pdfmetrics.registerFont(TTFont("DejaVu", f"{FONT_DIR}/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DejaVu-Bold", f"{FONT_DIR}/DejaVuSans-Bold.ttf"))

FIRST = [
    "Priya",
    "Arjun",
    "Elena",
    "James",
    "Fatima",
    "Chen",
    "Olivia",
    "Rahul",
    "Sofia",
    "Kwame",
    "Ananya",
    "Lucas",
    "Hana",
    "Mateo",
    "Aisha",
    "Daniel",
    "Meera",
    "Yuki",
    "Noah",
    "Ines",
    "Vikram",
    "Grace",
    "Omar",
    "Lena",
    "Karthik",
    "Amara",
    "Ethan",
    "Zara",
    "Ravi",
    "Chloe",
]
LAST = [
    "Raman",
    "Kumar",
    "Garcia",
    "Smith",
    "Khan",
    "Wei",
    "Brown",
    "Sharma",
    "Rossi",
    "Mensah",
    "Iyer",
    "Silva",
    "Tanaka",
    "Lopez",
    "Bello",
    "Novak",
    "Nair",
    "Sato",
    "Miller",
    "Costa",
    "Reddy",
    "Wilson",
    "Haddad",
    "Fischer",
    "Subramanian",
    "Okafor",
    "Clark",
    "Ahmed",
    "Pillai",
    "Martin",
]
PLACES = [  # (location text, phone renderings, E.164)
    (
        "Bengaluru, India",
        ["+91 98450 123{n}", "+91-98450-123{n}", "98450 123{n}"],
        "+9198450123{n}",
    ),
    ("Chennai, Tamil Nadu", ["+91 94440 331{n}", "94440331{n}"], "+9194440331{n}"),
    ("Pune, India", ["+91 70200 451{n}"], "+9170200451{n}"),
    ("Austin, TX", ["(512) 555-01{n}", "+1 512-555-01{n}", "512.555.01{n}"], "+1512555 01{n}"),
    ("New York, NY", ["(212) 555-01{n}", "+1 (212) 555-01{n}"], "+1212555 01{n}"),
    ("London, United Kingdom", ["+44 20 7123 45{n}", "+44 7911 1234{n}"], None),
    ("Toronto, Canada", ["+1 416-555-01{n}"], "+1416555 01{n}"),
    ("Berlin, Germany", ["+49 30 901820{n}"], "+4930901820{n}"),
    ("Singapore, Singapore", ["+65 6123 45{n}"], "+65612345{n}"),
]
TITLES = [
    "Software Engineer",
    "Senior Software Engineer",
    "Data Analyst",
    "Product Manager",
    "Backend Developer",
    "Frontend Developer",
    "DevOps Engineer",
    "Data Scientist",
    "QA Engineer",
    "UX Designer",
    "Marketing Manager",
    "Business Analyst",
    "Project Manager",
    "Full Stack Developer",
    "Machine Learning Engineer",
    "Accountant",
    "Sales Executive",
    "HR Coordinator",
    "Customer Success Manager",
    "Operations Lead",
]
COMPANIES = [
    "Acme Technologies Pvt Ltd",
    "Globex Corporation",
    "Initech Labs",
    "Northwind Traders",
    "Contoso Ltd",
    "Fabrikam Inc",
    "Wayne Enterprises",
    "Stark Industries",
    "Umbrella Systems",
    "Hooli",
    "Tata Consultancy Services",
    "Infosys Limited",
    "Zoho Corporation",
    "Freshworks Inc",
    "Soylent Corp",
    "Vandelay Industries",
    "Pied Piper",
    "Cyberdyne Systems",
    "Massive Dynamic",
    "Blue Sun Group",
]
RESPONSIBILITIES = [
    "Designed and built REST APIs used by internal teams",
    "Led a team of five engineers across two time zones",
    "Migrated legacy services to Kubernetes",
    "Improved test coverage from 40% to 85%",
    "Owned the release process and on-call rotation",
    "Built dashboards for weekly business reviews",
    "Partnered with design to ship a new onboarding flow",
    "Reduced cloud costs by 30% through right-sizing",
    "Wrote technical documentation for client integrations",
    "Mentored interns and new hires",
    "Automated reporting with Python scripts",
    "Managed vendor relationships and contracts",
    "Ran A/B tests to improve conversion",
    "Handled escalations for enterprise customers",
    "Maintained CI/CD pipelines with GitHub Actions",
    "Prepared monthly financial statements",
]
LONG_RESPONSIBILITY = (
    "Coordinated with product, design and engineering stakeholders to plan quarterly "
    "roadmaps and track delivery against milestones"
)
DEGREES = [
    ("B.Tech", "Computer Science"),
    ("B.E.", "Electronics and Communication"),
    ("Bachelor of Science", "Physics"),
    ("Master of Science", "Data Science"),
    ("MBA", None),
    ("M.Tech", "Software Engineering"),
    ("BCA", None),
    ("Bachelor of Arts", "Economics"),
    ("Master of Business Administration", None),
    ("B.Com", None),
]
SCHOOLS = [
    "Anna University",
    "University of Toronto",
    "Indian Institute of Technology Madras",
    "Stanford University",
    "Delhi University",
    "Technical University of Munich",
    "National University of Singapore",
    "University of Manchester",
    "PSG College of Technology",
    "Boston University",
]
SKILL_POOL = {
    "programming_languages": [
        "Python",
        "Java",
        "JavaScript",
        "TypeScript",
        "Go",
        "C++",
        "SQL",
        "Kotlin",
    ],
    "frameworks": ["React", "Django", "FastAPI", "Spring Boot", "Node.js", "Angular", "Flask"],
    "databases": ["PostgreSQL", "MySQL", "MongoDB", "Redis"],
    "cloud": ["AWS", "Docker", "Kubernetes", "Terraform", "GCP"],
    "tools": ["Git", "Jira", "Figma", "Tableau", "Excel"],
}
PROJECTS = [
    (
        "Inventory Tracker",
        [
            "Built a REST API with Flask and PostgreSQL",
            "Added barcode scanning for warehouse staff",
        ],
    ),
    ("Chat Application", ["Real-time messaging using WebSockets", "Deployed on AWS with Docker"]),
    ("Budget Planner", ["Mobile app to track monthly spending", "Synced data across devices"]),
    ("Resume Parser", ["Extracts structured data from PDF resumes", "Achieved 92% field accuracy"]),
    (
        "Smart Attendance System",
        ["Face recognition attendance using OpenCV", "Used by 300 students daily"],
    ),
]
CERTS = [
    ("AWS Certified Solutions Architect – Associate", "Amazon Web Services"),
    ("Certified Kubernetes Administrator", "CNCF"),
    ("Google Data Analytics Certificate", "Google"),
    ("PMP", "PMI"),
    ("Oracle Certified Professional, Java SE 11", "Oracle"),
]

HEADINGS = {
    "summary": ["Summary", "Professional Summary", "Profile", "About Me", "Career Objective"],
    "experience": [
        "Experience",
        "Work Experience",
        "Professional Experience",
        "Employment History",
    ],
    "education": ["Education", "Academic Background", "Education Details"],
    "skills": ["Skills", "Technical Skills", "Core Competencies", "Key Skills"],
    "projects": ["Projects", "Personal Projects", "Academic Projects", "Key Projects"],
    "certifications": ["Certifications", "Licenses & Certifications", "Certificates"],
}
MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
FULL_MONTHS = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]


@dataclass
class Job:
    title: str
    company: str
    start: tuple[int, int]
    end: tuple[int, int] | None
    points: list[str]


@dataclass
class Truth:
    full_name: str
    email: str
    phone_text: str
    phone_e164: str | None
    location: str
    linkedin: str | None
    github: str | None
    jobs: list[Job]
    education: list[tuple[str, str | None, str, int]]
    skills: list[str]
    projects: list[tuple[str, list[str]]]
    certifications: list[str]
    summary: str | None


@dataclass
class Style:
    fmt: str  # pdf | docx | docx-table | lo-pdf | doc | png
    font: str = "Helvetica"
    heading_case: str = "upper"  # upper | title
    heading_bold: bool = True
    heading_bigger: bool = True
    bullet: str = "• "
    date_format: int = 0
    date_place: str = "inline"  # inline | own-line | paren
    order: str = "title-first"  # title-first | company-first
    separator: str = " | "
    contact_one_line: bool = True
    two_column: bool = False
    page: tuple[float, float] = A4
    color_headings: bool = False
    section_order: list[str] = field(default_factory=list)
    headings: dict[str, str] = field(default_factory=dict)


@dataclass
class Sample:
    seed: int
    truth: Truth
    style: Style
    data: bytes
    kind: str


def make_truth(rng: random.Random) -> Truth:
    first, last = rng.choice(FIRST), rng.choice(LAST)
    n = f"{rng.randint(10, 99)}"
    location, phones, e164 = rng.choice(PLACES)
    phone_text = rng.choice(phones).format(n=n)
    # Numbers without a hand-computed E.164 form are checked for presence only.
    e164 = e164.replace(" ", "").format(n=n) if e164 else None
    handle = f"{first}{last}".lower()
    jobs: list[Job] = []
    year, month = 2026, rng.randint(1, 9)
    current = rng.random() < 0.7
    for index in range(rng.choice([1, 2, 2, 3, 3, 4])):
        length = rng.randint(10, 40)
        end = None if (index == 0 and current) else (year, month)
        total = year * 12 + month - 1 - length
        start = (total // 12, total % 12 + 1)
        points = rng.sample(RESPONSIBILITIES, rng.randint(2, 4))
        if rng.random() < 0.3:
            points[0] = LONG_RESPONSIBILITY  # wraps in narrow layouts
        jobs.append(Job(rng.choice(TITLES), rng.choice(COMPANIES), start, end, points))
        gap = total - rng.randint(0, 3)
        year, month = gap // 12, gap % 12 + 1
    edu = []
    for _ in range(rng.choice([1, 1, 2])):
        degree, spec = rng.choice(DEGREES)
        edu.append((degree, spec, rng.choice(SCHOOLS), rng.randint(2008, 2022)))
    skills = [s for pool in SKILL_POOL.values() for s in rng.sample(pool, rng.randint(1, 3))]
    return Truth(
        full_name=f"{first} {last}",
        email=rng.choice(
            [
                f"{first}.{last}@example.com",
                f"{handle}{n}@mail.com",
                f"{first[0]}{last}@example.org",
            ]
        ).lower(),
        phone_text=phone_text,
        phone_e164=e164,
        location=location,
        linkedin=f"linkedin.com/in/{handle}" if rng.random() < 0.7 else None,
        github=f"github.com/{handle}" if rng.random() < 0.4 else None,
        jobs=jobs,
        education=edu,
        skills=skills,
        projects=rng.sample(PROJECTS, rng.choice([0, 1, 2, 3])),
        certifications=[c for c, _ in rng.sample(CERTS, rng.choice([0, 0, 1, 2]))],
        summary=rng.choice(
            [
                None,
                "Results-driven professional who enjoys solving real problems with a small, focused team.",
            ]
        ),
    )


def make_style(rng: random.Random, fmt: str) -> Style:
    style = Style(
        fmt=fmt,
        font=rng.choice(["Helvetica", "Times-Roman", "Courier", "DejaVu"]),
        heading_case=rng.choice(["upper", "title"]),
        heading_bold=rng.random() < 0.85,
        heading_bigger=rng.random() < 0.6,
        bullet=rng.choice(["• ", "- ", "* ", "▪ ", "– ", "", " "]),
        date_format=rng.randint(0, 5),
        date_place=rng.choice(["inline", "inline", "own-line", "paren"]),
        order=rng.choice(["title-first", "company-first", "title-first"]),
        separator=rng.choice([" | ", " — ", ", ", " at "]),
        contact_one_line=rng.random() < 0.6,
        two_column=fmt == "pdf" and rng.random() < 0.15,
        page=rng.choice([A4, LETTER]),
        color_headings=rng.random() < 0.25,
    )
    if style.bullet == "▪ " and style.font != "DejaVu":
        style.bullet = "• "  # base-14 fonts can't draw ▪
    if style.bullet == " " and fmt not in ("pdf",):
        style.bullet = "• "
    order = ["summary", "experience", "education", "skills", "projects", "certifications"]
    middle = order[1:]
    rng.shuffle(middle)
    style.section_order = ["summary", *middle] if rng.random() < 0.5 else ["summary", *order[1:]]
    style.headings = {k: rng.choice(v) for k, v in HEADINGS.items()}
    return style


def fmt_date(value: tuple[int, int] | None, style: Style) -> str:
    if value is None:
        return ["Present", "Present", "Current", "Present", "Now", "Present"][style.date_format]
    y, m = value
    return [
        f"{MONTHS[m - 1]} {y}",
        f"{FULL_MONTHS[m - 1]} {y}",
        f"{m:02d}/{y}",
        f"{MONTHS[m - 1]}. {y}" if MONTHS[m - 1] != "May" else f"May {y}",
        f"{y}-{m:02d}",
        f"{MONTHS[m - 1]} '{str(y)[2:]}",
    ][style.date_format]


# ------------------------------------------------------------------ document model


@dataclass
class Line:
    text: str
    kind: str = "body"  # name | heading | body | bullet | subtle
    right: str | None = None  # right-aligned text on the same line (dates)
    bold: bool = False


def build_lines(t: Truth, s: Style) -> tuple[list[Line], list[Line]]:
    """Returns (main column, sidebar). The sidebar is empty unless two_column."""
    main: list[Line] = [Line(t.full_name, "name")]
    contact = [t.location, t.email, t.phone_text]
    links = [x for x in (t.linkedin, t.github) if x]
    side: list[Line] = []
    if s.two_column:
        side += [Line(heading(s, "Contact"), "heading"), *[Line(c) for c in contact + links]]
    elif s.contact_one_line:
        main.append(Line(" | ".join(contact)))
        if links:
            main.append(Line(" | ".join(links)))
    else:
        main += [Line(c) for c in contact + links]

    def section(key: str) -> list[Line]:
        out: list[Line] = []
        if key == "summary" and t.summary:
            out += [Line(heading(s, s.headings["summary"]), "heading"), Line(t.summary)]
        elif key == "experience" and t.jobs:
            out.append(Line(heading(s, s.headings["experience"]), "heading"))
            for job in t.jobs:
                dates = f"{fmt_date(job.start, s)} – {fmt_date(job.end, s)}"
                first, second = (
                    (job.title, job.company)
                    if s.order == "title-first"
                    else (job.company, job.title)
                )
                if s.date_place == "inline":
                    out.append(Line(f"{first}{s.separator}{second}", bold=True, right=dates))
                elif s.date_place == "paren":
                    out.append(Line(f"{first}{s.separator}{second} ({dates})", bold=True))
                else:
                    out += [Line(f"{first}{s.separator}{second}", bold=True), Line(dates, "subtle")]
                out += [Line(p + ("." if s.bullet == "" else ""), "bullet") for p in job.points]
        elif key == "education" and t.education:
            out.append(Line(heading(s, s.headings["education"]), "heading"))
            for degree, spec, school, year in t.education:
                text = f"{degree} in {spec}" if spec else degree
                out += [Line(text, bold=True), Line(f"{school}{s.separator}{year}")]
        elif key == "skills" and t.skills:
            target = side if s.two_column else out
            target.append(Line(heading(s, s.headings["skills"]), "heading"))
            chunks = [t.skills[i : i + 5] for i in range(0, len(t.skills), 5)]
            target += [Line(", ".join(c)) for c in chunks]
        elif key == "projects" and t.projects:
            out.append(Line(heading(s, s.headings["projects"]), "heading"))
            for name, points in t.projects:
                out.append(Line(name, bold=True))
                out += [Line(p + ("." if s.bullet == "" else ""), "bullet") for p in points]
        elif key == "certifications" and t.certifications:
            out.append(Line(heading(s, s.headings["certifications"]), "heading"))
            out += [Line(c, "bullet") for c in t.certifications]
        return out

    for key in s.section_order:
        main += section(key)
    return main, side


def heading(s: Style, text: str) -> str:
    return text.upper() if s.heading_case == "upper" else text


# ------------------------------------------------------------------ renderers


def _fonts(s: Style) -> tuple[str, str]:
    return {
        "Helvetica": ("Helvetica", "Helvetica-Bold"),
        "Times-Roman": ("Times-Roman", "Times-Bold"),
        "Courier": ("Courier", "Courier-Bold"),
        "DejaVu": ("DejaVu", "DejaVu-Bold"),
    }[s.font]


def render_pdf(main: list[Line], side: list[Line], s: Style) -> bytes:
    regular, bold = _fonts(s)
    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=s.page)
    width, height = s.page
    margin = 50
    col_x, col_w = (margin, width - 2 * margin)
    if s.two_column:
        col_x, col_w = width * 0.36, width * 0.64 - margin

    def draw(lines: list[Line], x: float, w: float, y: float) -> float:
        for line in lines:
            size = {"name": 20, "heading": 13 if s.heading_bigger else 10.5}.get(line.kind, 10.5)
            font = (
                bold
                if (line.kind == "name" or line.bold or (line.kind == "heading" and s.heading_bold))
                else regular
            )
            if y < 60:
                pdf.showPage()
                y = height - 60
            if line.kind == "heading" and s.color_headings:
                pdf.setFillColor(HexColor("#1f4e79"))
            else:
                pdf.setFillColor(HexColor("#000000"))
            text = line.text
            indent = 0.0
            if line.kind == "bullet":
                indent = 12
                if s.bullet:
                    pdf.setFont(regular, size)
                    # Base fonts can't draw Word's Symbol bullet (U+F0B7); Word-exported
                    # PDFs with that glyph are covered by the LibreOffice formats.
                    glyph = s.bullet.strip()
                    pdf.drawString(x + 2, y, "•" if glyph == "\uf0b7" else glyph)
            # Shrink text whose longest word can't fit the column (e.g. emails in a sidebar).
            longest = max(
                (pdfmetrics.stringWidth(word, font, size) for word in text.split()), default=0
            )
            if longest > w - indent:
                size = size * (w - indent) / longest * 0.95
            pdf.setFont(font, size)
            # Wrap long lines like a word processor would.
            words, current = text.split(), ""
            max_w = w - indent - (100 if line.right else 0)
            rows: list[str] = []
            for word in words:
                trial = f"{current} {word}".strip()
                if pdfmetrics.stringWidth(trial, font, size) > max_w and current:
                    rows.append(current)
                    current = word
                else:
                    current = trial
            rows.append(current)
            for i, row in enumerate(rows):
                if y < 50:  # never draw below the bottom margin
                    pdf.showPage()
                    pdf.setFont(font, size)
                    y = height - 60
                pdf.drawString(
                    x + indent + (8 if line.kind == "bullet" and s.bullet else 0), y, row
                )
                if i == 0 and line.right:
                    pdf.setFont(regular, size)
                    pdf.drawRightString(x + w, y, line.right)
                    pdf.setFont(font, size)
                y -= size + 5
            if line.kind == "heading":
                y -= 2
        return y

    if s.two_column:
        name, *rest = main
        y = draw([name], margin, width - 2 * margin, height - 60)
        draw(side, margin, width * 0.3 - margin, y)
        draw(rest, col_x, col_w, y)
    else:
        draw(main, col_x, col_w, height - 60)
    pdf.save()
    return buffer.getvalue()


def render_docx(main: list[Line], s: Style, table_jobs: bool = False) -> bytes:
    document = Document()
    for line in main:
        if line.kind == "name":
            run = document.add_paragraph().add_run(line.text)
            run.bold, run.font.size = True, Pt(20)
        elif line.kind == "heading":
            if s.heading_bold and s.heading_bigger:
                document.add_heading(line.text, level=1)
            else:
                run = document.add_paragraph().add_run(line.text)
                run.bold = s.heading_bold
                run.font.size = Pt(13 if s.heading_bigger else 11)
                if s.color_headings:
                    run.font.color.rgb = RGBColor(0x1F, 0x4E, 0x79)
        elif line.kind == "bullet":
            if s.bullet in ("• ", "") or not s.bullet:
                document.add_paragraph(line.text, style="List Bullet" if s.bullet else None)
            else:
                document.add_paragraph(f"{s.bullet}{line.text}")
        elif line.right and table_jobs:
            table = document.add_table(rows=1, cols=2)
            table.cell(0, 0).paragraphs[0].add_run(line.text).bold = True
            table.cell(0, 1).text = line.right
        else:
            paragraph = document.add_paragraph()
            run = paragraph.add_run(line.text)
            run.bold = line.bold
            if line.right:
                paragraph.add_run(f"\t{line.right}")
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


def render_png(main: list[Line], s: Style) -> bytes:
    from PIL import Image, ImageDraw, ImageFont

    scale = 3
    page_w = int(595 * scale)
    margin = 40 * scale
    rows: list[tuple[str, ImageFont.FreeTypeFont, int]] = []
    for line in main:
        size = {"name": 20, "heading": 13}.get(line.kind, 10.5)
        bold = line.kind in ("name", "heading") or line.bold
        font = ImageFont.truetype(
            f"{FONT_DIR}/DejaVuSans{'-Bold' if bold else ''}.ttf", int(size * scale)
        )
        text = (("• " if s.bullet else "") + line.text) if line.kind == "bullet" else line.text
        if line.right:
            text = f"{text}   {line.right}"
        # Wrap to the page width like a printed document.
        current = ""
        for word in text.split():
            trial = f"{current} {word}".strip()
            if font.getlength(trial) > page_w - 2 * margin and current:
                rows.append((current, font, int((size + 7) * scale)))
                current = word
            else:
                current = trial
        rows.append((current, font, int((size + 7) * scale)))
    image = Image.new("L", (page_w, sum(h for *_, h in rows) + 2 * margin), 255)
    draw = ImageDraw.Draw(image)
    y = margin
    for text, font, height in rows:
        draw.text((margin, y), text, fill=0, font=font)
        y += height
    out = io.BytesIO()
    image.save(out, format="PNG", dpi=(216, 216))
    return out.getvalue()


def convert_with_libreoffice(docx: bytes, target: str, workdir) -> bytes:
    import subprocess

    src = workdir / "r.docx"
    src.write_bytes(docx)
    fmt = "pdf" if target == "pdf" else "doc:MS Word 97"
    subprocess.run(
        [
            "soffice",
            f"-env:UserInstallation={(workdir / 'lo').as_uri()}",
            "--headless",
            "--convert-to",
            fmt,
            "--outdir",
            str(workdir),
            str(src),
        ],
        check=True,
        capture_output=True,
        timeout=120,
    )
    return (workdir / f"r.{target}").read_bytes()


FORMAT_WEIGHTS = [
    ("pdf", 45),
    ("docx", 25),
    ("docx-table", 10),
    ("lo-pdf", 10),
    ("doc", 5),
    ("png", 5),
]


def generate(seed: int, fmt: str | None = None, workdir=None) -> Sample:
    rng = random.Random(seed)
    if fmt is None:
        fmt = rng.choices([f for f, _ in FORMAT_WEIGHTS], weights=[w for _, w in FORMAT_WEIGHTS])[0]
    truth = make_truth(rng)
    style = make_style(rng, fmt)
    main, side = build_lines(truth, style)
    if fmt == "pdf":
        return Sample(seed, truth, style, render_pdf(main, side, style), "pdf")
    if fmt == "png":
        return Sample(seed, truth, style, render_png(main, style), "png")
    docx = render_docx(main, style, table_jobs=fmt == "docx-table")
    if fmt in ("docx", "docx-table"):
        return Sample(seed, truth, style, docx, "docx")
    assert workdir is not None, "LibreOffice formats need a work directory"
    target = "pdf" if fmt == "lo-pdf" else "doc"
    return Sample(seed, truth, style, convert_with_libreoffice(docx, target, workdir), target)


TODAY = date(2026, 11, 1)
