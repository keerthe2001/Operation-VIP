# ruff: noqa: E501
"""upgrade starter answers

Saved answers that are still the unedited text of an old starter template (with
[bracketed prompts] to fill in by hand) are replaced with the new self-filling version.
Answers the user edited are left alone.

Revision ID: c41d7e9a2b10
Revises: 71aaf095c8e0
Create Date: 2026-11-06 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "c41d7e9a2b10"
down_revision: str | Sequence[str] | None = "71aaf095c8e0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# (question, old template, old variants, new template, new variants)
STARTERS = [
    (
        "Why do you want to work at this company?",
        "I'm excited about {company} because [what genuinely draws you to the company: product, "
        "mission, team]. As a {current_designation} with {years_experience} years of experience in "
        "{top_skills}, I'd like to contribute to [a specific area or challenge] as your {job_title}.",
        [
            "{company}'s [mission/product] matches what I care about, and the {job_title} role is a "
            "strong fit for my experience in {top_skills}."
        ],
        "I'm excited about {company|your company} because it {company_focus|is doing work I "
        "genuinely want to be part of}. As {background|someone eager to grow}, I've worked hands-on "
        "with {matching_skills|the skills this role asks for}, and I'd love to "
        "{job_responsibility|contribute to your team} as your {job_title|next team member}.",
        [
            "{company|Your company} {company_focus|does work that matches what I care about}, and "
            "{role|this role} is a strong fit for my experience with {matching_skills|the skills you're "
            "looking for}."
        ],
    ),
    (
        "Why are you interested in this role?",
        "The {job_title} role lets me build on my {years_experience} years as a "
        "{current_designation}, especially my work with {matching_skills}. I'm looking for [what you "
        "want next: scope, ownership, domain], which this position offers.",
        [],
        "I'm interested in {role|this role} because it's a natural next step for me. As "
        "{background|an early-career professional}, I've built my skills in {matching_skills|the "
        "areas this role focuses on}, and I'm keen to {job_responsibility|take on more ownership} in "
        "a role where I can keep learning and deliver results.",
        [],
    ),
    (
        "Tell us about yourself.",
        "I'm a {current_designation} with {years_experience} years of experience, currently at "
        "{current_company}. I work mostly with {top_skills}. Recently I [a project or result you're "
        "proud of]. I'm now looking for [what you want next].",
        [],
        "I'm {background|a motivated professional early in my career}, working mostly with "
        "{top_skills|a range of tools}. Recently, I {recent_work|completed projects that "
        "strengthened my practical skills}. I'm now looking for a role where I can "
        "{job_responsibility|grow and make a real contribution}.",
        [],
    ),
    (
        "What are your greatest strengths?",
        "[Strength 1], shown when I [a concrete example]. I'm also strong in {top_skills}, which "
        "I've used for {years_experience} years as a {current_designation}.",
        [],
        "My biggest strength is turning skills into results. I'm strongest in {top_skills|problem "
        "solving and learning quickly}, and for example I {top_achievement|consistently deliver work "
        "I'm proud of}. I'd bring the same approach to {company|your team}.",
        [],
    ),
    (
        "Describe a challenging project you worked on.",
        "At {current_company}, I [the situation and your role]. The challenge was [what made it "
        "hard]. I [the actions you took], and as a result [the outcome, ideally with numbers].",
        [],
        "One challenging project was {project_name|a recent project of mine}. I "
        "{project_highlight|took ownership of the core work from start to finish}. Along the way I "
        "{project_result|learned to break hard problems into smaller steps and test each one}.",
        [],
    ),
    (
        "What are your career goals?",
        "Over the next few years I want to [your goal], growing from {current_designation} toward "
        "[the role or skills you're aiming for]. The {job_title} role at {company} is a step toward "
        "that because [reason].",
        [],
        "Over the next few years I want to deepen my expertise in {matching_skills|my core skills} "
        "and take on more responsibility. Joining {company|your company} in {role|this role} is a "
        "step toward that, because I'd get to {job_responsibility|work on meaningful problems with a "
        "strong team}.",
        [],
    ),
    (
        "Why are you leaving your current job?",
        "I've learned a lot at {current_company}, and I'm now looking for [what you're seeking: new "
        "challenges, scope, domain] that the {job_title} role at {company} offers.",
        [],
        "I've learned a lot at {current_company|my current job}, and I'm now looking for a role "
        "where I can {job_responsibility|take on bigger challenges}. That's exactly what {role|this "
        "role} at {company|your company} offers.",
        [],
    ),
    (
        "Why should we hire you?",
        "I bring {years_experience} years as a {current_designation} with hands-on experience in "
        "{matching_skills}. For example, [a relevant achievement]. I'd bring the same [quality] to "
        "the {job_title} role at {company}.",
        [],
        "I bring hands-on experience in {matching_skills|the skills this role needs} as "
        "{background|a motivated early-career professional}. For example, I {top_achievement|have "
        "consistently delivered quality work on time}. I'd bring the same focus to {role|this role} "
        "at {company|your company}.",
        [],
    ),
    (
        "When can you start?",
        "My notice period is {notice_period}, so I could start [date or timeframe].",
        [],
        "I can start {start_availability|at a date that works for your team}.",
        [],
    ),
]

answers = sa.table(
    "saved_answers",
    sa.column("question_text", sa.Text),
    sa.column("answer_template", sa.Text),
    sa.column("variants", postgresql.JSONB),
)


def _swap(old_index: int, new_index: int) -> None:
    for starter in STARTERS:
        question, old_template, old_variants = (
            starter[0],
            starter[old_index],
            starter[old_index + 1],
        )
        new_template, new_variants = starter[new_index], starter[new_index + 1]
        op.execute(
            answers.update()
            .where(answers.c.question_text == question)
            .where(answers.c.answer_template == old_template)
            .values(answer_template=new_template)
        )
        # Variants are replaced only when they are exactly the old starter variants.
        op.execute(
            answers.update()
            .where(answers.c.question_text == question)
            .where(answers.c.answer_template == new_template)
            .where(answers.c.variants == sa.literal(old_variants, type_=postgresql.JSONB))
            .values(variants=sa.literal(new_variants, type_=postgresql.JSONB))
        )


def upgrade() -> None:
    _swap(1, 3)


def downgrade() -> None:
    _swap(3, 1)
