from datetime import date

import pytest

from app.resume_pipeline.parsing.dates import find_date_range, normalize_date, total_years
from app.resume_pipeline.parsing.parser import RuleBasedParser
from app.resume_pipeline.types import TextLine
from tests.fixtures.sample_resumes import ENGINEER, MINIMAL, lines

TODAY = date(2026, 11, 1)


def parse(doc: list[TextLine], region: str = "US"):
    return RuleBasedParser(default_phone_region=region, today=TODAY).parse(doc)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Jan 2021", "2021-01"),
        ("September, 2019", "2019-09"),
        ("Sept. 2019", "2019-09"),
        ("03/2020", "2020-03"),
        ("2020-11", "2020-11"),
        ("2018", "2018"),
        ("Mar '19", "2019-03"),
    ],
)
def test_normalize_date(raw, expected):
    assert normalize_date(raw) == expected


def test_date_ranges():
    r = find_date_range("Acme | Jan 2021 – Present")
    assert (r.start, r.end, r.is_current) == ("2021-01", None, True)
    r = find_date_range("2013 - 2017")
    assert (r.start, r.end, r.is_current) == ("2013", "2017", False)
    r = find_date_range("06/2018 to 09/2020")
    assert (r.start, r.end) == ("2018-06", "2020-09")
    assert find_date_range("Founded in 2019 with 5 people") is None


def test_total_years_merges_overlaps():
    ranges = [("2020-01", "2021-12", False), ("2021-06", "2022-12", False)]
    assert total_years(ranges, TODAY) == 3.0
    assert total_years([("2025-11", None, True)], TODAY) == 1.0
    assert total_years([], TODAY) is None


def test_engineer_resume_personal_and_links():
    data = parse(ENGINEER)
    p = data.personal_information
    assert p.full_name == "Priya Raman"
    assert (p.first_name, p.last_name) == ("Priya", "Raman")
    assert p.email == "priya.raman@example.com"
    assert p.phone == "+919876543210"
    assert p.location == "Bengaluru, India"
    assert p.linkedin == "https://linkedin.com/in/priya-raman"
    assert p.github == "https://github.com/priyaraman"
    assert p.portfolio == "https://priyaraman.dev"
    assert data.field_meta["personal_information.email"].confidence > 0.9
    assert not data.field_meta["personal_information.email"].is_confirmed


def test_engineer_resume_experience():
    data = parse(ENGINEER)
    assert [(e.designation, e.company_name) for e in data.experience] == [
        ("Senior Software Engineer", "Acme Technologies Pvt Ltd"),
        ("Software Engineer", "Globex Solutions"),
        ("Software Engineering Intern", "Initech Labs"),
    ]
    current, previous, intern = data.experience
    assert (current.start_date, current.end_date, current.is_current) == ("2021-01", None, True)
    assert current.location == "Bengaluru, India"
    assert previous.location == "Chennai, India"
    assert (previous.start_date, previous.end_date) == ("2017-07", "2020-12")
    assert intern.employment_type == "Internship"
    # Wrapped bullet lines are joined; every bullet is a responsibility unless the resume
    # labels achievements explicitly.
    assert current.responsibilities == [
        "Led migration of billing services to Kubernetes and PostgreSQL.",
        "Reduced API latency by 40% by introducing Redis caching.",
        "Mentored 4 engineers and ran design reviews for the payments platform team.",
    ]
    assert current.achievements == []
    assert {"Kubernetes", "PostgreSQL", "Redis"} <= set(current.technologies)


def test_engineer_resume_summary_education_skills():
    data = parse(ENGINEER)
    s = data.professional_summary
    assert s.current_designation == "Senior Software Engineer"
    assert s.total_experience_years == 7.0  # explicit "7+ years" wins over the computed value
    assert s.employment_status == "employed"
    assert s.summary.startswith("Backend engineer with 7+ years")

    (edu,) = data.education
    assert edu.degree == "B.Tech"
    assert edu.specialization == "Computer Science and Engineering"
    assert edu.institution == "Anna University"
    assert (edu.start_year, edu.graduation_year, edu.grade) == (2013, 2017, "8.6/10")

    assert data.skills.programming_languages == ["Python", "Go", "SQL", "JavaScript"]
    assert data.skills.frameworks == ["Django", "FastAPI", "React"]
    assert data.skills.databases == ["PostgreSQL", "Redis", "MongoDB"]
    assert set(data.skills.cloud) == {"AWS", "Docker", "Kubernetes", "Terraform"}
    assert data.skills.tools == ["Git"]


def test_engineer_resume_projects_and_certifications():
    data = parse(ENGINEER)
    (project,) = data.projects
    assert project.project_name == "OpenLedger"
    assert project.url == "https://github.com/priyaraman/openledger"
    assert project.points == ["Double-entry accounting library used by 2,000+ developers."]

    assert [
        (c.certification_name, c.issuing_organization, c.issue_date) for c in data.certifications
    ] == [
        ("AWS Certified Solutions Architect – Associate", "Amazon Web Services", "2022-03"),
        ("Certified Kubernetes Application Developer (CKAD)", "CNCF", "2021"),
    ]


def test_minimal_resume_never_invents_missing_fields():
    data = parse(MINIMAL)
    p = data.personal_information
    assert p.full_name == "John Smith"
    assert p.phone == "+14155550134"
    assert p.location is None and p.linkedin is None and p.portfolio is None
    (job,) = data.experience
    assert (job.designation, job.company_name) == ("Barista", "Blue Bottle Coffee")
    assert (job.start_date, job.end_date) == ("2019", "2022")
    assert data.education[0].degree == "High School Diploma"
    assert data.education[0].institution == "Lincoln High School"
    assert data.projects == [] and data.certifications == []
    assert data.professional_summary.summary is None
    assert "professional_summary.summary" not in data.field_meta


def test_empty_input():
    data = parse([])
    assert data.personal_information.full_name is None
    assert data.experience == []


def test_heading_requires_short_line():
    # Body text that merely contains a heading word must not start a section.
    doc = lines(
        [
            ("Ana Lopez", dict(size=20.0, bold=True)),
            "I have experience leading teams across three continents.",
            ("Experience", dict(bold=True, size=13.0)),
            "Product Manager, Contoso Ltd",
            "2020 - 2023",
        ]
    )
    data = parse(doc)
    assert len(data.experience) == 1
    assert data.experience[0].company_name == "Contoso Ltd"


def test_skills_fallback_without_section_has_lower_confidence():
    doc = lines(
        [
            ("Sam Lee", dict(size=20.0, bold=True)),
            ("Experience", dict(bold=True)),
            "Data Analyst, Fabrikam Inc",
            "2021 - Present",
            "• Built dashboards in Tableau using SQL and Python.",
        ]
    )
    data = parse(doc)
    assert {"Tableau", "SQL", "Python"} <= {*data.skills.tools, *data.skills.programming_languages}
    assert data.field_meta["skills"].confidence == 0.5


def test_achievements_only_when_labelled():
    doc = lines(
        [
            ("Ravi Iyer", dict(size=20.0, bold=True)),
            ("Experience", dict(bold=True)),
            "Sales Manager, Contoso Ltd",
            "2019 - Present",
            "• Managed a team of 12 account executives.",
            "• Grew regional revenue by 35% in two years.",
            "Key Achievements:",
            "• Top performer award 2022.",
            "• Opened three new markets.",
            "Operations Lead, Fabrikam Inc",
            "2016 - 2019",
            "• Ran daily operations.",
            "Achievement: Cut costs by 15%.",
        ]
    )
    first, second = parse(doc).experience
    assert first.responsibilities == [
        "Managed a team of 12 account executives.",
        "Grew regional revenue by 35% in two years.",
    ]
    assert first.achievements == ["Top performer award 2022.", "Opened three new markets."]
    assert second.responsibilities == ["Ran daily operations."]
    assert second.achievements == ["Cut costs by 15%."]


def test_project_points_are_not_split_into_projects():
    # Bullets with Word's Symbol-font glyph (as pdfplumber reports it), wrapped lines and
    # plain sentence lines must all stay inside their project.
    doc = lines(
        [
            ("Meera Das", dict(size=20.0, bold=True)),
            ("Projects", dict(bold=True)),
            "Inventory Tracker",
            "\uf0b7 Built a REST API with Flask and PostgreSQL for the",
            "warehouse team",
            "\uf0b7Added barcode scanning",
            "Deployed on AWS with Docker.",
            "Chat Application | github.com/meera/chat",
            "• Real-time messaging using WebSockets.",
            "Role: Frontend Lead",
        ]
    )
    tracker, chat = parse(doc).projects
    assert tracker.project_name == "Inventory Tracker"
    assert tracker.points == [
        "Built a REST API with Flask and PostgreSQL for the warehouse team",
        "Added barcode scanning",
        "Deployed on AWS with Docker.",
    ]
    assert chat.project_name == "Chat Application"
    assert chat.url == "https://github.com/meera/chat"
    assert chat.role == "Frontend Lead"


def test_bold_project_titles_win_over_heuristics():
    doc = lines(
        [
            ("Sam Roy", dict(size=20.0, bold=True)),
            ("Projects", dict(bold=True)),
            ("Weather App", dict(bold=True)),
            "Shows forecasts.",
            "Uses OpenWeather API",
            ("Budget Planner", dict(bold=True)),
            "Tracks spending.",
        ]
    )
    projects = parse(doc).projects
    assert [p.project_name for p in projects] == ["Weather App", "Budget Planner"]
    assert projects[0].points == ["Shows forecasts.", "Uses OpenWeather API"]


def test_sentence_lines_without_bullets_are_separate_points():
    doc = lines(
        [
            ("Ana Silva", dict(size=20.0, bold=True)),
            ("Experience", dict(bold=True)),
            "Nurse, City Hospital",
            "2018 - 2023",
            "Cared for patients in a 30-bed ward.",
            "Trained new staff on safety procedures.",
        ]
    )
    (job,) = parse(doc).experience
    assert job.responsibilities == [
        "Cared for patients in a 30-bed ward.",
        "Trained new staff on safety procedures.",
    ]


@pytest.mark.parametrize("bold_titles", [True, False])
def test_wrapped_metric_list_stays_in_its_point(bold_titles):
    # A point that wraps mid-list ("(Accuracy, Precision," / "Recall, F1-Score)") must stay
    # one point, keep its commas, and never turn "Recall" into a project of its own.
    title = dict(bold=True) if bold_titles else {}
    doc = lines(
        [
            ("Priya Nair", dict(size=20.0, bold=True)),
            ("Projects", dict(bold=True)),
            ("Sales Demand Forecasting", title),
            "• Built a demand forecasting model using 10+ years of weekly sales data to plan stock levels.",
            "• G enerated forecasts by tuning seasonality and trend parameters to improve stability.",
            ("Customer Churn Prediction for Telecom Subscribers", title),
            "• Trained Logistic Regression and XGBoost models on 200,000+ customer records.",
            "• Cleaned and encoded features to improve model performance.",
            "• Evaluated the models with cross-validation and classification metrics (Accuracy, Precision,",
            "Recall, F1-Score)",
            "• Reached 88% accuracy, helping the retention team target at-risk customers early.",
            ("Skills", dict(bold=True)),
            "• Data: Python, SQL, Pandas, Statistical Analysis, Feature Engineering, Data Pipelines, ETL",
            "Concepts, Data Quality, Tableau",
            "• Cloud: AWS (S3)",
            ("Certifications", dict(bold=True)),
            "• PG Diploma in Data Analytics — Northfield Learning Academy",
            "• AWS Certified Solutions Architect – Associate",
        ]
    )
    data = parse(doc)
    forecasting, churn = data.projects
    assert forecasting.points[1].startswith("Generated forecasts")
    assert churn.project_name == "Customer Churn Prediction for Telecom Subscribers"
    assert churn.points == [
        "Trained Logistic Regression and XGBoost models on 200,000+ customer records.",
        "Cleaned and encoded features to improve model performance.",
        "Evaluated the models with cross-validation and classification metrics "
        "(Accuracy, Precision, Recall, F1-Score)",
        "Reached 88% accuracy, helping the retention team target at-risk customers early.",
    ]
    assert "ETL Concepts" in data.skills.other
    assert "AWS (S3)" in data.skills.cloud
    diploma, architect = data.certifications
    assert diploma.certification_name == "PG Diploma in Data Analytics"
    assert diploma.issuing_organization == "Northfield Learning Academy"
    assert architect.certification_name == "AWS Certified Solutions Architect – Associate"
