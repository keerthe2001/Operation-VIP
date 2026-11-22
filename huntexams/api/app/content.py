"""Curriculum documents: validation, public views (answers removed), grading and seeding.

Content lives in YAML under ``content/`` and is copied into the database on first start.
After that the admin edits it; the YAML stays the reviewed, version-controlled source.
"""

import math
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    AdPlacement,
    CareerPath,
    Guide,
    Lab,
    Level,
    Project,
    PublishStatus,
    Topic,
)

ENGINES = {"flow", "tokens", "bars", "space", "slicer", "graph", "meter", "code"}
QUESTION_TYPES = {"predict", "mcq", "multi", "order", "fill", "debug", "tune"}
AD_PLACEMENTS = ["homepage_banner", "roadmap_inline", "article_inline", "dashboard_banner"]

XP_RULES = {
    "scene_watched": 5,
    "check_first_try": 10,
    "check_retry": 5,
    "topic_practised": 20,
    "code_exercise_passed": 30,
    "lab_completed": 40,
    "diagnostic_passed": 50,
    "mission_submitted": 50,
    "mission_passed": 150,
}


class _Open(BaseModel):
    model_config = ConfigDict(extra="allow")


class SceneStep(_Open):
    at: int = Field(ge=0)
    caption: str = Field(min_length=1)
    tone: Literal["ask", "good", "bad"] | None = None
    when: str | None = None  # "switch" or "!switch"


class SceneSwitch(_Open):
    id: str
    label: str
    label_on: str
    label_off: str
    track: int = 0


class Scene(_Open):
    engine: str
    title: str
    track: list[str] = Field(min_length=2, max_length=8)
    steps: list[SceneStep] = Field(min_length=2)
    switches: list[SceneSwitch] = []

    @model_validator(mode="after")
    def _check(self) -> "Scene":
        if self.engine not in ENGINES:
            raise ValueError(f"unknown scene engine '{self.engine}'")
        ids = {s.id for s in self.switches}
        for step in self.steps:
            if step.at >= len(self.track):
                raise ValueError(f"step 'at' {step.at} is outside the track")
            if step.when and step.when.lstrip("!") not in ids:
                raise ValueError(f"step refers to unknown switch '{step.when}'")
        return self


class Question(_Open):
    id: str = Field(pattern=r"^[a-z0-9-]{2,64}$")
    type: str
    prompt: str
    explain: str = ""
    hint: str = ""

    @model_validator(mode="after")
    def _check(self) -> "Question":
        extra = self.model_extra or {}
        t = self.type
        if t not in QUESTION_TYPES:
            raise ValueError(f"unknown question type '{t}'")
        if t in {"predict", "mcq", "multi"}:
            opts, ans = extra.get("options"), extra.get("answer")
            if not isinstance(opts, list) or len(opts) < 2:
                raise ValueError(f"{self.id}: needs at least two options")
            want = ans if isinstance(ans, list) else [ans]
            if not want or any(not isinstance(a, int) or a >= len(opts) for a in want):
                raise ValueError(f"{self.id}: answer must index the options")
        if t == "order" and (not isinstance(extra.get("items"), list) or len(extra["items"]) < 3):
            raise ValueError(f"{self.id}: order needs at least three items (in the right order)")
        if t == "fill":
            code, opts = extra.get("code", ""), extra.get("options")
            if "____" not in code or not isinstance(opts, list) or extra.get("answer") not in opts:
                raise ValueError(f"{self.id}: fill needs code with ____ and an answer in options")
        if t == "debug":
            code, ans = extra.get("code", ""), extra.get("answer")
            if not isinstance(ans, int) or ans < 1 or ans > len(code.splitlines()):
                raise ValueError(f"{self.id}: debug answer must be a 1-based line number")
        if t == "tune":
            for key in ("logits", "labels", "target", "min", "max"):
                if key not in extra:
                    raise ValueError(f"{self.id}: tune needs '{key}'")
        return self


class CodeBlock(_Open):
    file: str = "main.py"
    source: str
    notes: dict[int, list[str]] = {}


class Exercise(_Open):
    prompt: str
    starter: str
    tests: str  # Python asserts run after the learner's code, in their browser sandbox
    solution: str


class Point(_Open):
    title: str
    text: str
    eng: str | None = None
    step: int | None = None


class TopicBody(_Open):
    objectives: list[str] = Field(min_length=1)
    intro: str
    intro_eng: str | None = None
    scenes: list[Scene] = Field(min_length=1)
    points: list[Point] = Field(min_length=2)
    words: list[list[str]] = []
    code: CodeBlock | None = None
    exercise: Exercise | None = None
    checks: list[Question] = Field(min_length=1)
    lab: str | None = None


class LabCheck(_Open):
    expr: str | None = None  # Python expression evaluated in the learner's namespace
    stdout: str | None = None  # text the output must contain
    fail: str = "Not quite yet. Read the instruction again, or press Show me."


class LabStep(_Open):
    id: str = Field(pattern=r"^[a-z0-9-]{1,64}$")
    say: str
    kind: Literal["code", "read"] = "code"
    starter: str | None = None  # replaces the editor content at this step
    append: str | None = None  # added to the learner's code from the previous step
    show: str | None = None  # the line(s) "Show me" types in for the learner
    replace: bool = False  # "Show me" replaces the whole program instead of appending
    check: LabCheck | None = None
    hint: str = ""
    explain: str = ""  # shown after the step passes
    notes: dict[int, str] = {}


class LabBody(_Open):
    intro: str
    minutes: int = 15
    steps: list[LabStep] = Field(min_length=1)


class ProjectBody(_Open):
    problem: str
    requirements: list[str] = Field(min_length=1)
    milestones: list[str] = Field(min_length=1)
    rubric: list[dict[str, Any]] = Field(min_length=1)
    pass_mark: int = 70
    starter: str | None = None
    submit: str = ""


class GuideBody(_Open):
    sections: list[dict[str, Any]] = Field(min_length=1)


VALIDATORS: dict[str, type[BaseModel]] = {
    "topic": TopicBody,
    "lab": LabBody,
    "project": ProjectBody,
    "guide": GuideBody,
}


def validate_body(kind: str, body: dict[str, Any]) -> dict[str, Any]:
    """Validate a content document and return it unchanged (raises ValueError with a message)."""
    try:
        VALIDATORS[kind].model_validate(body)
    except ValidationError as exc:
        first = exc.errors()[0]
        where = ".".join(str(p) for p in first["loc"])
        raise ValueError(f"{where}: {first['msg']}" if where else first["msg"]) from exc
    return body


# ---------------------------------------------------------------- public views and grading

_ANSWER_KEYS = {"answer", "explain"}


def public_question(q: dict[str, Any]) -> dict[str, Any]:
    out = {k: v for k, v in q.items() if k not in _ANSWER_KEYS}
    if q["type"] == "order":
        items = list(q["items"])
        # Deterministic shuffle that never shows the correct order first.
        rotated = items[1:] + items[:1]
        out["items"] = rotated[::-1] if rotated == items else rotated
        if out["items"] == items:
            out["items"] = items[::-1]
    return out


def public_topic_body(body: dict[str, Any]) -> dict[str, Any]:
    out = dict(body)
    out["checks"] = [public_question(q) for q in body.get("checks", [])]
    code = body.get("code")
    if code:
        out["code"] = {k: v for k, v in code.items() if k != "solution"}
    return out


def public_lab_body(body: dict[str, Any]) -> dict[str, Any]:
    # Lab steps keep their checks: they run in the learner's own browser sandbox and the
    # "show me" solution is part of the teaching, not a secret.
    return body


def softmax(logits: list[float], temperature: float) -> list[float]:
    t = max(float(temperature), 1e-6)
    scaled = [x / t for x in logits]
    m = max(scaled)
    exps = [math.exp(x - m) for x in scaled]
    total = sum(exps)
    return [e / total for e in exps]


def grade(q: dict[str, Any], answer: Any) -> bool:
    t = q["type"]
    try:
        if t in {"predict", "mcq"}:
            return int(answer) == int(q["answer"])
        if t == "multi":
            return sorted(int(a) for a in answer) == sorted(int(a) for a in q["answer"])
        if t == "order":
            return [str(a) for a in answer] == [str(a) for a in q["items"]]
        if t == "fill":
            return str(answer) == str(q["answer"])
        if t == "debug":
            return int(answer) == int(q["answer"])
        if t == "tune":
            value = float(answer)
            lo, hi = q.get("range", [0.1, 2.0])
            if not lo <= value <= hi:
                return False
            p = softmax(q["logits"], value)[int(q["target"])]
            return float(q["min"]) <= p <= float(q["max"])
    except (TypeError, ValueError, KeyError):
        return False
    return False


# ---------------------------------------------------------------- seeding


def _load(path: Path) -> Any:
    with path.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def _load_many(paths: list[Path]) -> list[Any]:
    """A YAML file may hold one document or a list of them."""
    out: list[Any] = []
    for p in paths:
        data = _load(p)
        out.extend(data if isinstance(data, list) else [data])
    return out


def load_content_tree(root: Path) -> dict[str, Any]:
    tree = _load(root / "path.yaml")
    tree["levels"] = [_load(p) for p in sorted((root / "levels").glob("*.yaml"))]
    tree["labs"] = _load_many(sorted((root / "labs").glob("*.yaml")))
    tree["guides"] = _load_many(sorted((root / "guides").glob("*.yaml")))
    return tree


def check_content_tree(tree: dict[str, Any]) -> list[str]:
    """Return every problem found; an empty list means the content is valid."""
    problems: list[str] = []
    topic_slugs: set[str] = set()
    lab_slugs = {lab["slug"] for lab in tree["labs"]}
    for level in tree["levels"]:
        for t in level.get("topics", []):
            slug = t.get("slug", "?")
            if slug in topic_slugs:
                problems.append(f"duplicate topic slug {slug}")
            topic_slugs.add(slug)
            try:
                validate_body("topic", t["body"])
            except (ValueError, KeyError) as exc:
                problems.append(f"topic {slug}: {exc}")
                continue
            if t["body"].get("lab") and t["body"]["lab"] not in lab_slugs:
                problems.append(f"topic {slug}: unknown lab {t['body']['lab']}")
            ids = [q["id"] for q in t["body"]["checks"]]
            if len(ids) != len(set(ids)):
                problems.append(f"topic {slug}: duplicate question ids")
        if level.get("project"):
            try:
                validate_body("project", level["project"]["body"])
            except (ValueError, KeyError) as exc:
                problems.append(f"project for level {level.get('number')}: {exc}")
    for lab in tree["labs"]:
        try:
            validate_body("lab", lab["body"])
        except (ValueError, KeyError) as exc:
            problems.append(f"lab {lab.get('slug')}: {exc}")
        if lab.get("topic") and lab["topic"] not in topic_slugs:
            problems.append(f"lab {lab['slug']}: unknown topic {lab['topic']}")
    for guide in tree["guides"]:
        try:
            validate_body("guide", guide["body"])
        except (ValueError, KeyError) as exc:
            problems.append(f"guide {guide.get('slug')}: {exc}")
    return problems


async def sync_content(session: AsyncSession, root: Path, *, overwrite: bool) -> str:
    """Load YAML content. With ``overwrite`` existing rows are updated from the files."""
    tree = load_content_tree(root)
    problems = check_content_tree(tree)
    if problems:
        raise ValueError("Content has problems:\n  " + "\n  ".join(problems))

    path = await session.scalar(select(CareerPath).where(CareerPath.slug == tree["slug"]))
    if path and not overwrite:
        return "skipped: content already present"
    if not path:
        path = CareerPath(slug=tree["slug"])
        session.add(path)
    path.title, path.summary = tree["title"], tree.get("summary", "")
    await session.flush()

    topics_by_slug: dict[str, Topic] = {}
    for lv in tree["levels"]:
        level = await session.scalar(
            select(Level).where(Level.path_id == path.id, Level.number == lv["number"])
        )
        if not level:
            level = Level(path_id=path.id, number=lv["number"])
            session.add(level)
        level.slug, level.title = lv["slug"], lv["title"]
        level.summary, level.hours = lv.get("summary", ""), lv.get("hours", 10)
        level.optional = bool(lv.get("optional", False))
        await session.flush()
        for n, t in enumerate(lv.get("topics", []), start=1):
            topic = await session.scalar(select(Topic).where(Topic.slug == t["slug"]))
            if not topic:
                topic = Topic(slug=t["slug"], level_id=level.id, number=n)
                session.add(topic)
            topic.level_id, topic.number = level.id, n
            topic.title, topic.summary = t["title"], t.get("summary", "")
            topic.minutes, topic.body = t.get("minutes", 8), t["body"]
            topic.status = PublishStatus.PUBLISHED
            topics_by_slug[t["slug"]] = topic
        await session.flush()
        if lv.get("project"):
            pr = lv["project"]
            project = await session.scalar(select(Project).where(Project.level_id == level.id))
            if not project:
                project = Project(level_id=level.id, slug=pr["slug"])
                session.add(project)
            project.slug, project.title, project.body = pr["slug"], pr["title"], pr["body"]
            project.status = PublishStatus.PUBLISHED

    for lb in tree["labs"]:
        lab = await session.scalar(select(Lab).where(Lab.slug == lb["slug"]))
        if not lab:
            lab = Lab(slug=lb["slug"])
            session.add(lab)
        lab.title, lab.body = lb["title"], lb["body"]
        lab.topic_id = topics_by_slug[lb["topic"]].id if lb.get("topic") else None
        lab.status = PublishStatus.PUBLISHED

    for gd in tree["guides"]:
        guide = await session.scalar(select(Guide).where(Guide.slug == gd["slug"]))
        if not guide:
            guide = Guide(slug=gd["slug"])
            session.add(guide)
        guide.title, guide.summary = gd["title"], gd.get("summary", "")
        guide.category, guide.minutes = gd.get("category", "Career guide"), gd.get("minutes", 5)
        guide.body, guide.status = gd["body"], PublishStatus.PUBLISHED

    for name in AD_PLACEMENTS:
        if not await session.get(AdPlacement, name):
            session.add(AdPlacement(placement=name, enabled=False))

    await session.commit()
    return f"loaded {len(tree['levels'])} levels, {len(topics_by_slug)} topics"
