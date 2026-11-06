"""Starter answers. They only use profile placeholders and [bracketed prompts] that the
user must replace with their own words, so nothing is claimed on their behalf."""

from app.schemas.answers import AnswerTemplate

PLACEHOLDERS = {
    "company": "Company you're applying to",
    "job_title": "Title of the job you're applying for",
    "first_name": "Your first name",
    "full_name": "Your full name",
    "current_designation": "Your current title",
    "current_company": "Your current or latest employer",
    "years_experience": "Your total years of experience",
    "top_skills": "Your first few skills",
    "matching_skills": "Your skills that the job description mentions (else your top skills)",
    "highest_degree": "Your most recent degree",
    "notice_period": "Your notice period",
}

STARTER_TEMPLATES: list[AnswerTemplate] = [
    AnswerTemplate(
        category="why_company",
        question_text="Why do you want to work at this company?",
        answer_template=(
            "I'm excited about {company} because [what genuinely draws you to the company: "
            "product, mission, team]. As a {current_designation} with {years_experience} years "
            "of experience in {top_skills}, I'd like to contribute to [a specific area or "
            "challenge] as your {job_title}."
        ),
        variants=[
            "{company}'s [mission/product] matches what I care about, and the {job_title} role "
            "is a strong fit for my experience in {top_skills}."
        ],
    ),
    AnswerTemplate(
        category="why_role",
        question_text="Why are you interested in this role?",
        answer_template=(
            "The {job_title} role lets me build on my {years_experience} years as a "
            "{current_designation}, especially my work with {matching_skills}. I'm looking for "
            "[what you want next: scope, ownership, domain], which this position offers."
        ),
    ),
    AnswerTemplate(
        category="about_you",
        question_text="Tell us about yourself.",
        answer_template=(
            "I'm a {current_designation} with {years_experience} years of experience, "
            "currently at {current_company}. I work mostly with {top_skills}. Recently I "
            "[a project or result you're proud of]. I'm now looking for [what you want next]."
        ),
    ),
    AnswerTemplate(
        category="strengths",
        question_text="What are your greatest strengths?",
        answer_template=(
            "[Strength 1], shown when I [a concrete example]. I'm also strong in "
            "{top_skills}, which I've used for {years_experience} years as a "
            "{current_designation}."
        ),
    ),
    AnswerTemplate(
        category="challenging_project",
        question_text="Describe a challenging project you worked on.",
        answer_template=(
            "At {current_company}, I [the situation and your role]. The challenge was "
            "[what made it hard]. I [the actions you took], and as a result [the outcome, "
            "ideally with numbers]."
        ),
    ),
    AnswerTemplate(
        category="career_goals",
        question_text="What are your career goals?",
        answer_template=(
            "Over the next few years I want to [your goal], growing from {current_designation} "
            "toward [the role or skills you're aiming for]. The {job_title} role at {company} "
            "is a step toward that because [reason]."
        ),
    ),
    AnswerTemplate(
        category="leaving_reason",
        question_text="Why are you leaving your current job?",
        answer_template=(
            "I've learned a lot at {current_company}, and I'm now looking for [what you're "
            "seeking: new challenges, scope, domain] that the {job_title} role at {company} offers."
        ),
    ),
    AnswerTemplate(
        category="why_hire",
        question_text="Why should we hire you?",
        answer_template=(
            "I bring {years_experience} years as a {current_designation} with hands-on "
            "experience in {matching_skills}. For example, [a relevant achievement]. I'd bring the "
            "same [quality] to the {job_title} role at {company}."
        ),
    ),
    AnswerTemplate(
        category="availability",
        question_text="When can you start?",
        answer_template=(
            "My notice period is {notice_period}, so I could start [date or timeframe]."
        ),
    ),
]
