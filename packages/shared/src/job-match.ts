/**
 * Rule-based job match: how well a profile fits a job description. It compares skills
 * (from a keyword list plus the user's own skills), required years of experience and
 * location. Deterministic and local; no AI service is involved.
 */
import type { components } from "@copilot/api-types";

type Profile = components["schemas"]["ProfileRead"];
type MatchProfile = Pick<Profile, "skills" | "professional_summary" | "personal_information" | "additional_info">;

/** Common skills employers list. "Name|alias|alias": the first entry is shown. */
const SKILL_LIST = `
Python|Java|JavaScript|js|TypeScript|ts|C|C++|cpp|C#|csharp|Go|golang|Rust|Ruby|PHP|Kotlin|Swift|Scala|R|MATLAB|Perl|Dart|Bash|shell scripting
SQL|MySQL|PostgreSQL|postgres|SQLite|Oracle|SQL Server|mssql|MongoDB|mongo|Redis|Cassandra|DynamoDB|Elasticsearch|Snowflake|BigQuery|Redshift|Databricks|Hive|Neo4j|Firebase
React|react.js|reactjs|Angular|Vue|vue.js|Next.js|nextjs|Node.js|node|nodejs|Express|express.js|Django|Flask|FastAPI|Spring|Spring Boot|.NET|asp.net|Rails|ruby on rails|Laravel|jQuery|Redux|Tailwind CSS|tailwind|Bootstrap|HTML|html5|CSS|css3|GraphQL|REST APIs|rest api|restful|gRPC|Microservices|WebSockets
AWS|amazon web services|Azure|microsoft azure|GCP|google cloud|Docker|Kubernetes|k8s|Terraform|Ansible|Jenkins|GitHub Actions|CI/CD|ci cd|Linux|Unix|Git|GitHub|GitLab|Nginx|Kafka|RabbitMQ|Airflow|Spark|apache spark|PySpark|Hadoop|Serverless|Lambda
Pandas|NumPy|Scikit-learn|sklearn|scikit learn|TensorFlow|PyTorch|Keras|XGBoost|LightGBM|OpenCV|NLTK|spaCy|Hugging Face|huggingface|Transformers|LangChain|LlamaIndex|OpenAI|LLM|llms|large language models|Generative AI|genai|RAG|retrieval-augmented generation|Prompt Engineering|NLP|natural language processing|Computer Vision|Deep Learning|Machine Learning|ml|Artificial Intelligence|ai|AI Agents|agentic ai|MLOps|Statistics|statistical analysis|Hypothesis Testing|A/B Testing|ab testing|Time Series|time series forecasting|Regression|Classification|Clustering|Feature Engineering|Data Analysis|data analytics|Data Visualization|EDA|exploratory data analysis|ETL|Data Pipelines|data pipeline|Data Modeling|data modelling|Data Warehousing|data warehouse
Tableau|Power BI|powerbi|Excel|ms excel|advanced excel|Looker|Matplotlib|Seaborn|Plotly|Jupyter|Google Analytics|SAS|SPSS|Alteryx
Selenium|Cypress|Playwright|Jest|PyTest|JUnit|Unit Testing|Test Automation|Postman|JIRA|Confluence|Agile|Scrum|Kanban|Figma|Photoshop|Illustrator
Android|iOS|React Native|Flutter|Unity|Embedded Systems|IoT|Blockchain|Solidity|Cybersecurity|Networking|SAP|Salesforce|ServiceNow|SharePoint
Project Management|Product Management|Stakeholder Management|Communication|communication skills|Leadership|Team Leadership|Problem Solving|Teamwork|Customer Service|Sales|Marketing|SEO|Content Writing|Digital Marketing|Accounting|Financial Analysis|Business Analysis
`;

interface SkillEntry {
  name: string;
  aliases: string[];
  patterns: RegExp[];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word matcher that also works for names like "C++", "Node.js" or ".NET". */
function wordPattern(term: string): RegExp {
  return new RegExp(`(^|[^a-z0-9+#.])${escapeRegExp(term.toLowerCase())}(?![a-z0-9+#]|\\.[a-z])`, "i");
}

// Short or ambiguous terms only count in this exact spelling ("R", "Go", "AI").
const EXACT: Record<string, string> = { R: "R", C: "C", Go: "Go", ai: "AI", ml: "ML", js: "JS", ts: "TS", node: "Node", mongo: "Mongo" };

const SKILLS: SkillEntry[] = SKILL_LIST.trim()
  .split(/\n/)
  .flatMap((row) => row.split("|"))
  .map((item) => item.trim())
  .filter(Boolean)
  .reduce<string[][]>((groups, item) => {
    // Capitalised or symbol-led entries start a skill; lowercase ones are its aliases.
    if (/^[A-Z.#0-9]/.test(item) || groups.length === 0) groups.push([item]);
    else groups.at(-1)!.push(item);
    return groups;
  }, [])
  .map(([name, ...aliases]) => ({
    name: name!,
    aliases: [name!, ...aliases].map((a) => a.toLowerCase()),
    patterns: [name!, ...aliases].map((term) =>
      EXACT[term] ? new RegExp(`(^|[^A-Za-z0-9+#.])${escapeRegExp(EXACT[term])}(?![A-Za-z0-9+#])`) : wordPattern(term),
    ),
  }));

const BY_ALIAS = new Map(SKILLS.flatMap((skill) => skill.aliases.map((alias) => [alias, skill] as const)));

/** The keyword-list name for a profile skill ("sklearn" → "scikit-learn"), else the skill itself. */
function canonical(skill: string): string {
  const key = skill.toLowerCase().trim();
  const entry = BY_ALIAS.get(key) ?? BY_ALIAS.get(key.split("(")[0]!.trim());
  return (entry?.name ?? skill).toLowerCase();
}

/** Skills the description asks for, in the order of the keyword list. */
export function jobSkills(description: string): string[] {
  return SKILLS.filter((skill) => skill.patterns.some((pattern) => pattern.test(description))).map((s) => s.name);
}

export interface JobMatch {
  /** 0-100, or null when the description is too thin to judge. */
  score: number | null;
  skills: { matched: string[]; missing: string[] };
  experience: { required: number | null; have: number | null; ok: boolean | null };
  location: { job: string | null; ok: boolean | null };
}

/** Smallest "N years" figure that talks about experience: "3+ years", "2-4 yrs of experience". */
export function requiredYears(description: string): number | null {
  const found: number[] = [];
  const pattern = /(\d{1,2})\s*(?:\+|plus)?\s*(?:(?:-|–|to)\s*\d{1,2}\s*)?\+?\s*(?:years?|yrs?)\b([^.\n]{0,60})/gi;
  for (const match of description.matchAll(pattern)) {
    const after = match[2] ?? "";
    const before = description.slice(Math.max(0, match.index - 40), match.index);
    if (/experience|exp\b|working|industry|hands-on|professional/i.test(`${before} ${after}`)) found.push(Number(match[1]));
  }
  const plausible = found.filter((n) => n > 0 && n <= 30);
  return plausible.length ? Math.min(...plausible) : null;
}

/** "Location: Bengaluru, India" or a remote mention in the description. */
export function jobLocation(description: string): string | null {
  const labelled = description.match(/\b(?:location|based in|work location|job location)\s*[:\-–]\s*([^\n|•]{2,80})/i);
  if (labelled) return labelled[1]!.trim().replace(/[.;]+$/, "");
  if (/\b(fully remote|100% remote|remote[- ]first|work from home|wfh)\b/i.test(description)) return "Remote";
  return null;
}

const tokens = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 2 && !["india", "usa", "the", "and", "area", "city"].includes(w));

export function jobMatch(profile: MatchProfile | null, description: string | null | undefined, location?: string | null): JobMatch {
  const text = description ?? "";
  const wanted = jobSkills(text);
  const mine = profile ? Object.values(profile.skills ?? {}).flat() : [];
  const mineCanonical = new Set(mine.map(canonical));
  // The user's own skills the description mentions, even ones not in the keyword list.
  const matched = new Map<string, string>();
  for (const skill of mine) {
    const key = canonical(skill);
    if (matched.has(key)) continue;
    const entry = SKILLS.find((s) => s.name.toLowerCase() === key);
    const patterns = entry?.patterns ?? [wordPattern(skill.split("(")[0]!.trim() || skill)];
    if (patterns.some((pattern) => pattern.test(text))) matched.set(key, skill);
  }
  const missing = wanted.filter((name) => !mineCanonical.has(name.toLowerCase()) && !matched.has(name.toLowerCase()));

  const required = requiredYears(text);
  const have = profile?.professional_summary.total_experience_years ?? null;
  const experienceOk = required === null || have === null ? null : have >= required;

  const jobLoc = location || jobLocation(text);
  const places = [profile?.personal_information.location, ...(profile?.additional_info.preferred_locations ?? [])].filter(
    (place): place is string => !!place,
  );
  let locationOk: boolean | null = null;
  if (jobLoc && /remote|anywhere/i.test(jobLoc)) locationOk = true;
  else if (jobLoc && places.length) {
    const jobWords = new Set(tokens(jobLoc));
    locationOk = places.some((place) => tokens(place).some((w) => jobWords.has(w))) || profile?.additional_info.willing_to_relocate === true;
  }

  // Weighted score over the parts that could be judged.
  const parts: [number, number][] = [];
  const skillTotal = matched.size + missing.length;
  if (skillTotal > 0) parts.push([matched.size / skillTotal, 0.6]);
  if (experienceOk !== null) parts.push([experienceOk ? 1 : Math.max(0, (have ?? 0) / (required ?? 1)), 0.25]);
  if (locationOk !== null) parts.push([locationOk ? 1 : 0, 0.15]);
  const weight = parts.reduce((sum, [, w]) => sum + w, 0);
  const score = skillTotal === 0 ? null : Math.round((parts.reduce((sum, [value, w]) => sum + value * w, 0) / weight) * 100);

  return {
    score,
    skills: { matched: [...matched.values()], missing },
    experience: { required, have, ok: experienceOk },
    location: { job: jobLoc ?? null, ok: locationOk },
  };
}
