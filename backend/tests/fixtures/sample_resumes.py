"""Synthetic resumes used by parser and pipeline tests (fictional people)."""

from app.resume_pipeline.types import TextLine

H = dict(size=13.0, bold=True)
NAME = dict(size=22.0, bold=True)


def lines(spec: list[tuple[str, dict[str, object]] | str]) -> list[TextLine]:
    out = []
    for item in spec:
        if isinstance(item, str):
            out.append(TextLine(text=item))
        else:
            text, style = item
            out.append(TextLine(text=text, **style))  # type: ignore[arg-type]
    return out


ENGINEER = lines(
    [
        ("Priya Raman", NAME),
        "Senior Backend Engineer",
        "Bengaluru, India | priya.raman@example.com | +91 98765 43210",
        "linkedin.com/in/priya-raman | github.com/priyaraman | priyaraman.dev",
        ("SUMMARY", H),
        "Backend engineer with 7+ years of experience building distributed systems in Python and Go.",
        ("EXPERIENCE", H),
        ("Senior Software Engineer", dict(bold=True)),
        "Acme Technologies Pvt Ltd | Bengaluru, India | Jan 2021 – Present",
        "• Led migration of billing services to Kubernetes and PostgreSQL.",
        "• Reduced API latency by 40% by introducing Redis caching.",
        "• Mentored 4 engineers and ran design reviews for the payments",
        "platform team.",
        ("Software Engineer", dict(bold=True)),
        "Globex Solutions, Chennai, India  Jul 2017 – Dec 2020",
        "• Built REST APIs with Django and FastAPI.",
        "• Automated deployments with GitHub Actions and Docker.",
        ("Software Engineering Intern", dict(bold=True)),
        "Initech Labs | May 2016 - Aug 2016",
        "• Wrote data pipelines in Python.",
        ("EDUCATION", H),
        "B.Tech in Computer Science and Engineering",
        "Anna University, Chennai | 2013 - 2017 | CGPA: 8.6/10",
        ("TECHNICAL SKILLS", H),
        "Languages: Python, Go, SQL, JavaScript",
        "Frameworks: Django, FastAPI, React",
        "Cloud & Tools: AWS, Docker, Kubernetes, Git, Terraform",
        "Databases: PostgreSQL, Redis, MongoDB",
        ("PROJECTS", H),
        ("OpenLedger | github.com/priyaraman/openledger", dict(bold=True)),
        "• Double-entry accounting library used by 2,000+ developers.",
        "Tech: Python, PostgreSQL",
        ("CERTIFICATIONS", H),
        "AWS Certified Solutions Architect – Associate | Amazon Web Services | Mar 2022",
        "Certified Kubernetes Application Developer (CKAD), CNCF, 2021",
    ]
)

MINIMAL = lines(
    [
        ("JOHN SMITH", NAME),
        "john.smith@mail.com",
        "(415) 555-0134",
        ("Work Experience", H),
        "Barista, Blue Bottle Coffee",
        "2019 - 2022",
        "- Served 300 customers daily",
        ("Education", H),
        "High School Diploma, Lincoln High School, 2018",
    ]
)
