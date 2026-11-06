"""Field-level comparison of parser output against generator ground truth."""

from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass, field

from app.schemas.resume_data import ResumeData
from tests.corpus.generator import Truth


def norm(text: str | None) -> str:
    return re.sub(r"[^a-z0-9+#]+", " ", (text or "").lower()).strip()


def ym(value: tuple[int, int] | None) -> str | None:
    return None if value is None else f"{value[0]:04d}-{value[1]:02d}"


@dataclass
class Score:
    checks: dict[str, bool] = field(default_factory=dict)

    def add(self, name: str, ok: bool) -> None:
        self.checks[name] = ok

    @property
    def failures(self) -> list[str]:
        return [k for k, v in self.checks.items() if not v]


def score(truth: Truth, data: ResumeData) -> Score:
    s = Score()
    p = data.personal_information
    s.add("name", norm(p.full_name) == norm(truth.full_name))
    s.add("email", p.email == truth.email)
    if truth.phone_e164:
        s.add("phone", p.phone == truth.phone_e164)
    else:
        s.add("phone", bool(p.phone))
    s.add("location", norm(p.location) == norm(truth.location))
    if truth.linkedin:
        s.add("linkedin", (p.linkedin or "").endswith(truth.linkedin))
    if truth.github:
        s.add("github", (p.github or "").endswith(truth.github))

    jobs = data.experience
    s.add("experience.count", len(jobs) == len(truth.jobs))
    for i, job in enumerate(truth.jobs):
        got = jobs[i] if i < len(jobs) else None
        s.add(f"experience.title#{i}", got is not None and norm(got.designation) == norm(job.title))
        s.add(
            f"experience.company#{i}",
            got is not None and norm(got.company_name) == norm(job.company),
        )
        s.add(f"experience.start#{i}", got is not None and got.start_date == ym(job.start))
        if job.end is None:
            s.add(
                f"experience.end#{i}", got is not None and got.is_current and got.end_date is None
            )
        else:
            s.add(f"experience.end#{i}", got is not None and got.end_date == ym(job.end))
        expected_points = [norm(x) for x in job.points]
        got_points = [norm(x) for x in (got.responsibilities + got.achievements)] if got else []
        s.add(f"experience.points#{i}", got_points == expected_points)

    s.add("education.count", len(data.education) == len(truth.education))
    for i, (degree, spec, school, year) in enumerate(truth.education):
        got_e = data.education[i] if i < len(data.education) else None
        s.add(f"education.degree#{i}", got_e is not None and norm(got_e.degree) == norm(degree))
        s.add(
            f"education.institution#{i}",
            got_e is not None and norm(got_e.institution) == norm(school),
        )
        s.add(f"education.year#{i}", got_e is not None and got_e.graduation_year == year)
        if spec:
            s.add(
                f"education.specialization#{i}",
                got_e is not None and norm(got_e.specialization) == norm(spec),
            )

    found = {norm(x) for bucket in data.skills.model_dump().values() for x in bucket}
    s.add("skills", all(norm(x) in found for x in truth.skills))

    s.add("projects.count", len(data.projects) == len(truth.projects))
    for i, (name, points) in enumerate(truth.projects):
        got_p = data.projects[i] if i < len(data.projects) else None
        s.add(f"projects.name#{i}", got_p is not None and norm(got_p.project_name) == norm(name))
        s.add(
            f"projects.points#{i}",
            got_p is not None and [norm(x) for x in got_p.points] == [norm(x) for x in points],
        )

    s.add("certifications.count", len(data.certifications) == len(truth.certifications))
    for i, name in enumerate(truth.certifications):
        got_c = data.certifications[i] if i < len(data.certifications) else None
        s.add(
            f"certifications.name#{i}",
            got_c is not None
            and norm(name).startswith(norm(got_c.certification_name))
            and len(norm(got_c.certification_name)) >= 3,
        )
    if truth.summary:
        s.add("summary", norm(data.professional_summary.summary) == norm(truth.summary))
    return s


def field_family(name: str) -> str:
    return name.split("#")[0]


def aggregate(scores: list[Score]) -> dict[str, tuple[int, int]]:
    totals: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for sc in scores:
        for name, ok in sc.checks.items():
            fam = field_family(name)
            totals[fam][0] += ok
            totals[fam][1] += 1
    return {k: (v[0], v[1]) for k, v in sorted(totals.items())}
