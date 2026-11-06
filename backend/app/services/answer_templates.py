"""Starter answers.

They are filled in automatically for each application: from the user's profile and from the
job page (company, title and description, read with simple rules — no AI). Every value has a
fallback written as {placeholder|fallback}, so an answer reads naturally even when the page
has no description, and nothing has to be filled in by hand before inserting it. Nothing is
claimed that isn't in the profile or the job description.
"""

from app.schemas.answers import AnswerTemplate

PLACEHOLDERS = {
    "company": "Company you're applying to (from the job page)",
    "job_title": "Title of the job (from the job page)",
    "role": '"the <job title> role" (from the job page)',
    "company_focus": "What the company does, read from the job description",
    "job_responsibility": "The role's main responsibility, read from the job description",
    "matching_skills": "Your skills that the job description mentions (else your top skills)",
    "first_name": "Your first name",
    "full_name": "Your full name",
    "background": "Who you are: your title and years, or your degree if you're a student",
    "current_designation": "Your current title",
    "current_company": "Your current or latest employer",
    "years_experience": "Your total years of experience",
    "top_skills": "Your first few skills",
    "recent_work": "The first point of your latest job (or project)",
    "top_achievement": "Your first point with a number or result in it",
    "project_name": "Your first project",
    "project_highlight": "The first point of that project",
    "project_result": "A later point of that project with a number or result",
    "highest_degree": "Your most recent degree",
    "notice_period": "Your notice period",
    "start_availability": '"immediately" or "after my notice period of …"',
}

STARTER_TEMPLATES: list[AnswerTemplate] = [
    AnswerTemplate(
        category="why_company",
        question_text="Why do you want to work at this company?",
        answer_template=(
            "I'm excited about {company|your company} because it {company_focus|is doing work I "
            "genuinely want to be part of}. As {background|someone eager to grow}, I've worked "
            "hands-on with {matching_skills|the skills this role asks for}, and I'd love to "
            "{job_responsibility|contribute to your team} as your {job_title|next team member}."
        ),
        variants=[
            "{company|Your company} {company_focus|does work that matches what I care about}, and "
            "{role|this role} is a strong fit for my experience with {matching_skills|the skills "
            "you're looking for}."
        ],
    ),
    AnswerTemplate(
        category="why_role",
        question_text="Why are you interested in this role?",
        answer_template=(
            "I'm interested in {role|this role} because it's a natural next step for me. As "
            "{background|an early-career professional}, I've built my skills in "
            "{matching_skills|the areas this role focuses on}, and I'm keen to "
            "{job_responsibility|take on more ownership} in a role where I can keep learning and "
            "deliver results."
        ),
    ),
    AnswerTemplate(
        category="about_you",
        question_text="Tell us about yourself.",
        answer_template=(
            "I'm {background|a motivated professional early in my career}, working mostly with "
            "{top_skills|a range of tools}. Recently, I {recent_work|completed projects that "
            "strengthened my practical skills}. I'm now looking for a role where I can "
            "{job_responsibility|grow and make a real contribution}."
        ),
    ),
    AnswerTemplate(
        category="strengths",
        question_text="What are your greatest strengths?",
        answer_template=(
            "My biggest strength is turning skills into results. I'm strongest in "
            "{top_skills|problem solving and learning quickly}, and for example I "
            "{top_achievement|consistently deliver work I'm proud of}. I'd bring the same "
            "approach to {company|your team}."
        ),
    ),
    AnswerTemplate(
        category="challenging_project",
        question_text="Describe a challenging project you worked on.",
        answer_template=(
            "One challenging project was {project_name|a recent project of mine}. I "
            "{project_highlight|took ownership of the core work from start to finish}. Along the "
            "way I {project_result|learned to break hard problems into smaller steps and test "
            "each one}."
        ),
    ),
    AnswerTemplate(
        category="career_goals",
        question_text="What are your career goals?",
        answer_template=(
            "Over the next few years I want to deepen my expertise in {matching_skills|my core "
            "skills} and take on more responsibility. Joining {company|your company} in "
            "{role|this role} is a step toward that, because I'd get to "
            "{job_responsibility|work on meaningful problems with a strong team}."
        ),
    ),
    AnswerTemplate(
        category="leaving_reason",
        question_text="Why are you leaving your current job?",
        answer_template=(
            "I've learned a lot at {current_company|my current job}, and I'm now looking for a "
            "role where I can {job_responsibility|take on bigger challenges}. That's exactly what "
            "{role|this role} at {company|your company} offers."
        ),
    ),
    AnswerTemplate(
        category="why_hire",
        question_text="Why should we hire you?",
        answer_template=(
            "I bring hands-on experience in {matching_skills|the skills this role needs} as "
            "{background|a motivated early-career professional}. For example, I "
            "{top_achievement|have consistently delivered quality work on time}. I'd bring the "
            "same focus to {role|this role} at {company|your company}."
        ),
    ),
    AnswerTemplate(
        category="availability",
        question_text="When can you start?",
        answer_template=("I can start {start_availability|at a date that works for your team}."),
    ),
]
