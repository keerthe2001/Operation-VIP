/**
 * Field taxonomy: what a form field asks for, recognized from its label and attributes.
 * Patterns run against normalized text (lower case, punctuation → spaces).
 */
export interface FieldRule {
  key: string;
  label: string;
  /** Matches on the visible label/placeholder/aria text. */
  patterns: RegExp[];
  /** Matches on name/id attributes (normalized to words). */
  attrPatterns?: RegExp[];
  /** HTML autocomplete tokens that identify the field exactly. */
  autocomplete?: string[];
  /** If any of these match, the rule does not apply. */
  exclude?: RegExp[];
  /** Input types that fit this field (others lower the confidence). */
  types?: string[];
}

export const RULES: FieldRule[] = [
  {
    key: "first_name", label: "First name",
    patterns: [/^(legal )?first name\b/, /\bgiven names?\b/, /^forename/, /\bfirst name\b/, /^prenom/],
    attrPatterns: [/\bfirst ?name\b/, /\bfname\b/, /\bgiven name\b/],
    autocomplete: ["given-name"],
    exclude: [/\b(emergency|reference|referr|manager|spouse|parent)\b/],
  },
  {
    key: "last_name", label: "Last name",
    patterns: [/^(legal )?last name\b/, /\bsurname\b/, /\bfamily names?\b/, /\blast name\b/],
    attrPatterns: [/\blast ?name\b/, /\blname\b/, /\bsurname\b/, /\bfamily name\b/],
    autocomplete: ["family-name"],
    exclude: [/\b(emergency|reference|referr|manager|spouse|parent)\b/],
  },
  {
    key: "full_name", label: "Full name",
    patterns: [/^(full |legal |your )?name\b\*?$/, /^full name/, /^your full name/, /^(legal )?name \(as/],
    attrPatterns: [/^(full )?name$/, /\bfull ?name\b/, /\bsystemfield name\b/],
    autocomplete: ["name"],
    exclude: [/\b(company|employer|school|university|reference|referr|emergency|manager|user ?name|nick)\b/],
  },
  {
    key: "email", label: "Email",
    patterns: [/\be ?mail\b/],
    attrPatterns: [/\be ?mail\b/],
    autocomplete: ["email"],
    exclude: [/\b(confirm|reference|referr|manager|emergency)\b/],
    types: ["email", "text"],
  },
  {
    key: "phone", label: "Phone",
    patterns: [/\b(phone|mobile|cell|telephone|contact number)\b/],
    attrPatterns: [/\b(phone|mobile|tel|cell)\b/],
    autocomplete: ["tel", "tel-national"],
    exclude: [/\b(country code|extension|type|reference|emergency|device)\b/],
    types: ["tel", "text", "number"],
  },
  {
    key: "location", label: "Location",
    patterns: [/^(current )?(location|city)\b/, /\bwhere are you (located|based)\b/, /^city/, /\bcity,? state\b/],
    attrPatterns: [/\b(location|city)\b/],
    autocomplete: ["address-level2"],
    exclude: [/\b(preferred|desired|willing|relocat|office|job location)\b/],
  },
  {
    key: "linkedin", label: "LinkedIn",
    patterns: [/\blinked ?in\b/], attrPatterns: [/\blinked ?in\b/], types: ["url", "text"],
  },
  {
    key: "github", label: "GitHub",
    patterns: [/\bgit ?hub\b/], attrPatterns: [/\bgit ?hub\b/], types: ["url", "text"],
  },
  {
    key: "portfolio", label: "Website / portfolio",
    patterns: [/\b(portfolio|personal (web ?site|site)|web ?site|blog)\b/, /^other (website|links?)/],
    attrPatterns: [/\b(portfolio|website|web site|url)\b/],
    autocomplete: ["url"],
    exclude: [/\b(linked ?in|git ?hub|company|twitter|facebook|instagram)\b/],
    types: ["url", "text"],
  },
  {
    key: "current_company", label: "Current company",
    patterns: [/\b(current|present|most recent) (company|employer|organi[sz]ation)\b/, /^company( name)?$/, /^employer$/],
    attrPatterns: [/\bcurrent ?company\b/, /\b(org|company|employer)$/],
    autocomplete: ["organization"],
    exclude: [/\b(why|previous|reference)\b/],
  },
  {
    key: "current_title", label: "Current title",
    patterns: [/\b(current|present|most recent) (job )?(title|role|position|designation)\b/, /^(job )?title$/],
    attrPatterns: [/\bcurrent ?title\b/, /\bjob ?title\b/],
    autocomplete: ["organization-title"],
    exclude: [/\b(applying|desired|preferred)\b/],
  },
  {
    key: "years_experience", label: "Years of experience",
    patterns: [/\b(total |overall |years of |relevant )?(work )?experience( in years)?\b.*\byears?\b/, /\byears of (professional |relevant |work )?experience\b/, /^(total )?experience$/],
    attrPatterns: [/\b(years|yrs) ?(of )?exp/, /\bexperience years\b/, /\btotal experience\b/],
    types: ["number", "text", "select", "radio"],
  },
  {
    key: "school", label: "School",
    patterns: [/\b(school|university|college|institution)( name)?\b/],
    attrPatterns: [/\b(school|university|college|institution)\b/],
    exclude: [/\b(high school diploma|degree|major|gpa|graduat)\b/],
  },
  {
    key: "degree", label: "Degree",
    patterns: [/^(highest )?(degree|qualification)( obtained| level)?\b/, /\blevel of education\b/, /\bhighest (level of )?education\b/],
    attrPatterns: [/\bdegree\b/],
  },
  {
    key: "discipline", label: "Field of study",
    patterns: [/\b(major|discipline|field of study|specialization|area of study)\b/],
    attrPatterns: [/\b(major|discipline|field of study|specialization)\b/],
  },
  {
    key: "graduation_year", label: "Graduation year",
    patterns: [/\bgraduation (year|date)\b/, /\byear of (graduation|passing)\b/, /^end (date )?year$/],
    attrPatterns: [/\bgrad(uation)? ?(year|date)\b/],
  },
  { key: "gpa", label: "GPA", patterns: [/\b(c?gpa|grade point|cgpa|percentage)\b/], attrPatterns: [/\bc?gpa\b/] },
  {
    key: "skills", label: "Skills",
    patterns: [/^(key |technical |relevant )?skills\b/, /\bwhat (are your|skills)\b.*skills/],
    attrPatterns: [/\bskills?\b/],
  },
  {
    key: "resume", label: "Resume",
    patterns: [/\b(resume|resumé|cv|curriculum vitae)\b/], attrPatterns: [/\b(resume|cv)\b/], types: ["file"],
    exclude: [/\bcover\b/],
  },
  {
    key: "work_authorization", label: "Work authorization",
    patterns: [/\b(legally )?(authori[sz]ed|eligible|entitled|permitted) to work\b/, /\bwork (authori[sz]ation|permit|eligibility)\b/, /\bright to work\b/],
    attrPatterns: [/\bwork ?auth/, /\bauthori[sz]ed\b/],
  },
  {
    key: "requires_sponsorship", label: "Visa sponsorship",
    patterns: [/\b(require|need)s? (visa )?sponsorship\b/, /\bvisa sponsorship\b/, /\bsponsorship\b/],
    attrPatterns: [/\bsponsor/],
  },
  {
    key: "notice_period", label: "Notice period",
    patterns: [/\bnotice period\b/, /\bwhen can you (start|join)\b/, /\bearliest (start|joining) date\b/, /\bavailability to start\b/],
    attrPatterns: [/\bnotice\b/],
  },
  {
    key: "expected_salary", label: "Expected salary",
    patterns: [/\b(expected|desired|target) (salary|compensation|ctc|pay)\b/, /\bsalary expectations?\b/, /\bcompensation expectations?\b/],
    attrPatterns: [/\b(expected|desired) ?(salary|ctc|compensation)\b/],
  },
  {
    key: "current_salary", label: "Current salary",
    patterns: [/\b(current|present) (salary|compensation|ctc)\b/], attrPatterns: [/\bcurrent ?(salary|ctc)\b/],
  },
  {
    key: "willing_to_relocate", label: "Willing to relocate",
    patterns: [/\b(willing|open) to relocat/, /\brelocat(e|ion)\b/], attrPatterns: [/\brelocat/],
  },
  { key: "gender", label: "Gender", patterns: [/^gender\b/, /\bgender identity\b/], attrPatterns: [/\bgender\b/] },
  { key: "pronouns", label: "Pronouns", patterns: [/\bpronouns?\b/], attrPatterns: [/\bpronoun/] },
  { key: "nationality", label: "Nationality", patterns: [/\b(nationality|citizenship)\b/], attrPatterns: [/\b(nationality|citizenship)\b/] },
  { key: "languages", label: "Languages", patterns: [/\blanguages? (you speak|spoken|known)\b/, /^languages?$/] },
];

export const RULES_BY_KEY = Object.fromEntries(RULES.map((r) => [r.key, r]));
