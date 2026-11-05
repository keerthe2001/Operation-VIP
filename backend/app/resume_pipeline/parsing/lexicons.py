"""Keyword lists for the rule-based parser. Extend these to improve recall."""

SECTION_HEADINGS: dict[str, tuple[str, ...]] = {
    "summary": (
        "summary",
        "professional summary",
        "profile",
        "professional profile",
        "about me",
        "about",
        "objective",
        "career objective",
        "career summary",
        "executive summary",
        "overview",
    ),
    "experience": (
        "experience",
        "work experience",
        "professional experience",
        "employment history",
        "employment",
        "work history",
        "career history",
        "relevant experience",
        "internships",
        "internship",
        "internship experience",
        "work",
    ),
    "education": (
        "education",
        "academic background",
        "academics",
        "educational qualifications",
        "academic qualifications",
        "qualifications",
        "education and training",
    ),
    "skills": (
        "skills",
        "technical skills",
        "core competencies",
        "key skills",
        "competencies",
        "technologies",
        "tech stack",
        "skills and tools",
        "tools and technologies",
        "areas of expertise",
        "expertise",
        "skill set",
        "skillset",
    ),
    "projects": (
        "projects",
        "personal projects",
        "academic projects",
        "key projects",
        "selected projects",
        "side projects",
        "project experience",
    ),
    "certifications": (
        "certifications",
        "certification",
        "certificates",
        "licenses and certifications",
        "licenses & certifications",
        "courses and certifications",
        "courses",
        "professional certifications",
        "trainings",
        "training",
    ),
    "other": (
        "awards",
        "honors",
        "achievements",
        "awards and honors",
        "languages",
        "interests",
        "hobbies",
        "publications",
        "volunteer",
        "volunteering",
        "volunteer experience",
        "activities",
        "extracurricular activities",
        "references",
        "leadership",
        "declaration",
        "personal details",
        "personal information",
        "contact",
        "contact information",
    ),
}

TITLE_KEYWORDS = (
    "engineer",
    "developer",
    "manager",
    "analyst",
    "intern",
    "lead",
    "designer",
    "consultant",
    "scientist",
    "architect",
    "director",
    "specialist",
    "associate",
    "officer",
    "administrator",
    "coordinator",
    "executive",
    "head",
    "vp",
    "president",
    "founder",
    "co-founder",
    "assistant",
    "technician",
    "programmer",
    "tester",
    "trainee",
    "researcher",
    "professor",
    "lecturer",
    "teacher",
    "accountant",
    "advisor",
    "owner",
    "representative",
    "strategist",
    "editor",
    "writer",
    "recruiter",
    "partner",
    "principal",
    "sde",
    "swe",
    "devops",
    "qa",
    "fellow",
    "apprentice",
    "chief",
    "cto",
    "ceo",
    "cfo",
    "product owner",
    "scrum master",
    "staff",
    "member of technical staff",
    "barista",
    "cashier",
    "nurse",
    "driver",
    "sales",
    "salesperson",
    "chef",
    "cook",
    "clerk",
    "agent",
    "operator",
    "supervisor",
    "worker",
    "mechanic",
    "electrician",
    "pharmacist",
    "doctor",
    "physician",
    "therapist",
    "attorney",
    "lawyer",
    "paralegal",
    "auditor",
    "banker",
    "broker",
    "buyer",
    "planner",
    "producer",
    "photographer",
    "artist",
    "author",
    "journalist",
    "translator",
    "tutor",
    "instructor",
    "coach",
    "trainer",
    "waiter",
    "server",
    "bartender",
    "receptionist",
    "secretary",
    "guard",
    "pilot",
    "attendant",
    "inspector",
    "surveyor",
    "marketer",
    "marketing",
    "copywriter",
    "counselor",
    "clinician",
    "pharmacologist",
    "biologist",
    "chemist",
    "economist",
    "statistician",
    "librarian",
)

COMPANY_STRONG_HINTS = (
    "inc",
    "inc.",
    "llc",
    "ltd",
    "ltd.",
    "limited",
    "pvt",
    "private limited",
    "corp",
    "corp.",
    "corporation",
    "company",
    "co.",
    "gmbh",
    "plc",
    "ag",
    "s.a.",
    "llp",
    "bv",
)
COMPANY_HINTS = (
    *COMPANY_STRONG_HINTS,
    "technologies",
    "technology",
    "solutions",
    "labs",
    "systems",
    "group",
    "software",
    "services",
    "consulting",
    "studio",
    "studios",
    "bank",
    "university",
    "foundation",
    "institute",
    "agency",
    "coffee",
    "hospital",
    "clinic",
    "media",
    "ventures",
    "partners",
    "capital",
    "networks",
    "analytics",
    "digital",
    "industries",
)

DEGREE_PATTERNS = (
    r"b\.?\s?tech",
    r"m\.?\s?tech",
    r"b\.?\s?e\b",
    r"m\.?\s?e\b",
    r"b\.?\s?sc",
    r"m\.?\s?sc",
    r"b\.?\s?s\b",
    r"m\.?\s?s\b",
    r"b\.?\s?a\b",
    r"m\.?\s?a\b",
    r"b\.?\s?com",
    r"m\.?\s?com",
    r"bca",
    r"mca",
    r"bba",
    r"mba",
    r"ph\.?\s?d",
    r"bachelor",
    r"master",
    r"doctor(ate)?",
    r"associate'?s? degree",
    r"diploma",
    r"high school",
    r"higher secondary",
    r"secondary school",
    r"hsc",
    r"ssc",
    r"12th",
    r"10th",
    r"class xii",
    r"class x\b",
    r"a-levels?",
    r"gcse",
    r"b\.?\s?arch",
    r"m\.?\s?arch",
    r"llb",
    r"llm",
    r"md\b",
    r"mbbs",
    r"b\.?\s?pharm",
    r"pgdm",
    r"post ?graduate",
    r"undergraduate",
    r"graduate certificate",
)

INSTITUTION_HINTS = (
    "university",
    "college",
    "institute",
    "school",
    "academy",
    "polytechnic",
    "iit",
    "nit",
    "iiit",
    "bits",
    "vidyalaya",
    "universit",
    "faculty",
    "campus",
    "mit",
    "conservatory",
)

CERT_ISSUERS = {
    "amazon web services": "Amazon Web Services",
    "aws": "Amazon Web Services",
    "google cloud": "Google Cloud",
    "google": "Google",
    "microsoft": "Microsoft",
    "azure": "Microsoft",
    "coursera": "Coursera",
    "udemy": "Udemy",
    "oracle": "Oracle",
    "cisco": "Cisco",
    "ibm": "IBM",
    "meta": "Meta",
    "salesforce": "Salesforce",
    "comptia": "CompTIA",
    "pmi": "PMI",
    "linux foundation": "Linux Foundation",
    "hashicorp": "HashiCorp",
    "cncf": "CNCF",
    "edx": "edX",
    "databricks": "Databricks",
    "snowflake": "Snowflake",
    "red hat": "Red Hat",
    "scrum alliance": "Scrum Alliance",
    "scrum.org": "Scrum.org",
    "nptel": "NPTEL",
    "linkedin learning": "LinkedIn Learning",
    "isc2": "ISC2",
    "(isc)2": "ISC2",
    "isaca": "ISACA",
    "tableau": "Tableau",
    "mongodb": "MongoDB",
    "kubernetes": "CNCF",
    "deeplearning.ai": "DeepLearning.AI",
    "freecodecamp": "freeCodeCamp",
    "hackerrank": "HackerRank",
    "atlassian": "Atlassian",
}

# Canonical skill name -> category. Matching is case-insensitive on word boundaries.
SKILLS: dict[str, str] = {}


def _register(category: str, names: str) -> None:
    for name in names.split("|"):
        SKILLS[name.strip()] = category


_register(
    "programming_languages",
    (
        "Python|Java|JavaScript|TypeScript|C|C++|C#|Go|Golang|Rust|Ruby|PHP|Swift|Kotlin|Scala|R|"
        "MATLAB|Perl|Dart|Objective-C|Shell|Bash|PowerShell|SQL|HTML|CSS|SASS|Haskell|Elixir|"
        "Clojure|Lua|Julia|Groovy|VBA|Solidity|Assembly|COBOL|Fortran|F#|Visual Basic"
    ),
)
_register(
    "frameworks",
    (
        "React|React.js|ReactJS|Next.js|Vue|Vue.js|Nuxt|Angular|AngularJS|Svelte|SvelteKit|"
        "Node.js|NodeJS|Express|Express.js|NestJS|Django|Flask|FastAPI|Spring|Spring Boot|"
        "Hibernate|Rails|Ruby on Rails|Laravel|Symfony|ASP.NET|.NET|.NET Core|Blazor|"
        "Flutter|React Native|SwiftUI|Jetpack Compose|Ionic|Electron|Tailwind CSS|Tailwind|"
        "Bootstrap|Material UI|jQuery|Redux|GraphQL|gRPC|Celery|Gin|Echo|Fiber|Phoenix|"
        "Pandas|NumPy|SciPy|Matplotlib|Seaborn|Streamlit|Gradio|Selenium|Playwright|Cypress|"
        "Jest|Pytest|JUnit|Mocha|Vite|Webpack|Three.js|D3.js|Socket.IO|Kafka Streams|Spark|"
        "Apache Spark|PySpark|Hadoop|Airflow|Apache Airflow|dbt|Unity|Unreal Engine|Qt"
    ),
)
_register(
    "databases",
    (
        "PostgreSQL|Postgres|MySQL|MariaDB|SQLite|Oracle Database|SQL Server|MSSQL|MongoDB|"
        "Redis|Cassandra|DynamoDB|Elasticsearch|OpenSearch|Neo4j|Firebase|Firestore|CouchDB|"
        "Snowflake|BigQuery|Redshift|ClickHouse|Supabase|Pinecone|Weaviate|Milvus|Memcached|"
        "InfluxDB|TimescaleDB|CockroachDB|HBase|Couchbase|Realm|Prisma|SQLAlchemy"
    ),
)
_register(
    "cloud",
    (
        "AWS|Amazon Web Services|Azure|Microsoft Azure|GCP|Google Cloud|Google Cloud Platform|"
        "Docker|Kubernetes|K8s|Terraform|Ansible|Pulumi|CloudFormation|Lambda|AWS Lambda|EC2|S3|"
        "ECS|EKS|GKE|AKS|Heroku|Vercel|Netlify|DigitalOcean|Cloudflare|OpenShift|Helm|"
        "Serverless|CI/CD|Jenkins|GitHub Actions|GitLab CI|CircleCI|Travis CI|ArgoCD|Nginx|"
        "Apache|Linux|Prometheus|Grafana|Datadog|New Relic|Splunk|ELK|Kafka|Apache Kafka|"
        "RabbitMQ|SQS|SNS|Pub/Sub|Cloud Run|App Engine|Firebase Hosting"
    ),
)
_register(
    "ai_ml",
    (
        "Machine Learning|Deep Learning|TensorFlow|PyTorch|Keras|scikit-learn|Scikit-Learn|"
        "XGBoost|LightGBM|CatBoost|OpenCV|NLP|Natural Language Processing|Computer Vision|"
        "Hugging Face|Transformers|LangChain|LlamaIndex|LLM|LLMs|Generative AI|GenAI|RAG|"
        "spaCy|NLTK|MLflow|Kubeflow|SageMaker|Vertex AI|ONNX|CUDA|Reinforcement Learning|"
        "Data Science|Statistics|Time Series|Recommendation Systems|MLOps|JAX|YOLO|BERT|GPT"
    ),
)
_register(
    "tools",
    (
        "Git|GitHub|GitLab|Bitbucket|Jira|Confluence|Trello|Asana|Notion|Slack|Figma|Sketch|"
        "Adobe XD|Photoshop|Illustrator|Postman|Swagger|VS Code|IntelliJ|Eclipse|Xcode|"
        "Android Studio|Excel|Microsoft Excel|Power BI|Tableau|Looker|Google Analytics|"
        "SAP|Salesforce|HubSpot|Zendesk|Linear|Maven|Gradle|npm|Yarn|pnpm|Webpack|Babel|"
        "ESLint|Prettier|SonarQube|Vim|Agile|Scrum|Kanban|TDD|REST|REST APIs|RESTful APIs|"
        "Microservices|OOP|Data Structures|Algorithms|System Design|Unix|Windows|macOS|"
        "WordPress|Shopify|Webflow|Zapier|Airtable|Miro|Canva|Blender|AutoCAD|SolidWorks"
    ),
)
_register(
    "soft_skills",
    (
        "Communication|Leadership|Teamwork|Team Leadership|Problem Solving|Problem-Solving|"
        "Critical Thinking|Time Management|Collaboration|Mentoring|Mentorship|Adaptability|"
        "Creativity|Attention to Detail|Project Management|Stakeholder Management|"
        "Public Speaking|Presentation|Negotiation|Decision Making|Conflict Resolution|"
        "Customer Service|Analytical Skills|Interpersonal Skills|Ownership|Emotional Intelligence"
    ),
)
