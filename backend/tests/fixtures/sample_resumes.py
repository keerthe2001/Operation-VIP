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

FRESHER = lines(
    [
        ("ARJUN KUMAR", NAME),
        "arjun.kumar2003@gmail.com | 9876501234 | Coimbatore, Tamil Nadu",
        "https://www.linkedin.com/in/arjunkumar03",
        ("CAREER OBJECTIVE", H),
        "Final-year Computer Science student seeking a software developer role.",
        ("ACADEMIC DETAILS", H),
        "B.E. Computer Science and Engineering | PSG College of Technology | 2021 - 2025 | CGPA: 8.9",
        "Class XII | Sri Vidya Mandir Matriculation School | 2021 | 94.2%",
        ("INTERNSHIPS", H),
        "Software Development Intern",
        "Zoho Corporation, Chennai | Jun 2024 - Aug 2024",
        "• Built an internal dashboard using React and Node.js",
        "• Reduced report generation time by 30%",
        ("TECHNICAL SKILLS", H),
        "Java, Python, C++, JavaScript, React, Node.js, MySQL, Git",
        ("PROJECTS", H),
        ("Smart Attendance System", dict(bold=True)),
        "• Face-recognition attendance app built with Python and OpenCV.",
        ("CERTIFICATIONS", H),
        "• NPTEL - Programming in Java (2023)",
        "• Oracle Certified Associate, Java SE 8 Programmer - 2024",
        ("ACHIEVEMENTS", H),
        "Winner, Smart India Hackathon 2023",
    ]
)

DESIGNER = lines(
    [
        ("Elena Garcia", NAME),
        "Product Designer",
        "elena.garcia@studio.design  ·  +1 (646) 555-0199  ·  Brooklyn, NY",
        "elenagarcia.design/portfolio",
        ("Professional Profile", H),
        "Product designer with a focus on accessible design systems for fintech.",
        ("Employment History", H),
        ("Northwind Bank", dict(bold=True)),
        "Lead Product Designer   March 2022 to Present",
        "- Own the design system used by 40 product teams",
        "- Partnered with engineering to ship a new onboarding flow",
        ("Contoso Studio", dict(bold=True)),
        "Product Designer (Contract)   Sept 2019 to Feb 2022",
        "- Designed mobile banking apps for 3 clients",
        ("Education", H),
        "Parsons School of Design",
        "BFA, Communication Design, 2019",
        ("Skills", H),
        "Figma • Sketch • Prototyping • User Research • HTML • CSS",
    ]
)
