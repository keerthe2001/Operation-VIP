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
  /** Patterns written for whole questions ("What's the name you'd prefer us to use…"), so a
   * long label is not weaker evidence for them. */
  sentence?: RegExp[];
}

export const RULES: FieldRule[] = [
  {
    key: "first_name", label: "First name",
    patterns: [/^(legal )?first name\b/, /\bgiven names?\b/, /^forename/, /\bfirst name\b/, /^prenom/],
    attrPatterns: [/\bfirst ?name\b/, /\bfname\b/, /\bgiven name\b/],
    autocomplete: ["given-name"],
    exclude: [/\b(emergency|reference|referr|manager|spouse|parent|father|mother|guardian|husband|wife|nominee|company|employer)\b/],
  },
  {
    key: "last_name", label: "Last name",
    patterns: [/^(legal )?last name\b/, /\bsurname\b/, /\bfamily names?\b/, /\blast name\b/],
    attrPatterns: [/\blast ?name\b/, /\blname\b/, /\bsurname\b/, /\bfamily name\b/],
    autocomplete: ["family-name"],
    exclude: [/\b(emergency|reference|referr|manager|spouse|parent|father|mother|guardian|husband|wife|nominee|company|employer)\b/],
  },
  {
    key: "full_name", label: "Full name",
    patterns: [
      /^(full |legal |your )?name\b\*?$/, /^full name/, /^your full name/, /^(legal )?name \(as/,
      /\b(candidate|applicant)('?s)? (full )?name\b/, /^name of (the )?(candidate|applicant)\b/, /^name as per\b/,
    ],
    attrPatterns: [/^(full )?name$/, /\bfull ?name\b/, /\bsystemfield name\b/, /\b(your|candidate|applicant) ?name\b/],
    autocomplete: ["name"],
    exclude: [/\b(company|employer|organi[sz]ation|school|college|university|institut|reference|referr|emergency|manager|user ?name|nick|father|mother|guardian|spouse|nominee|project|file)\b/],
  },
  {
    key: "email", label: "Email",
    patterns: [/\be ?mail\b/, /\bmail id\b/],
    attrPatterns: [/\be ?mail\b/],
    autocomplete: ["email"],
    // "Confirm email" still gets the same address.
    exclude: [/\b(reference|referr|manager|emergency|alternate|alternative|secondary)\b/],
    types: ["email", "text"],
  },
  {
    key: "phone", label: "Phone",
    patterns: [/\b(phone|mobile|cell|telephone|contact (number|no)|whats ?app( number| no)?|mob no|ph no)\b/, /^contact$/, /\bprimary (number|contact)\b/],
    attrPatterns: [/\b(phone|mobile|tel|cell|contact|whatsapp|mob)\b/],
    autocomplete: ["tel", "tel-national"],
    exclude: [/\b(country code|phone code|dial|extension|type|reference|emergency|device|alternate|alternative|secondary|other|landline|home|office|person)\b/],
  },
  {
    key: "alternate_phone", label: "Alternate phone",
    patterns: [/\b(alternate|alternative|secondary|other|additional) (phone|mobile|contact|number)\b/, /\blandline\b/],
    attrPatterns: [/\b(alt|alternate|secondary) ?(phone|mobile|contact)\b/],
    exclude: [/\b(emergency|reference)\b/],
    types: ["tel", "text", "number"],
  },
  {
    key: "location", label: "Location",
    patterns: [/^(current |present )?location\b/, /\bwhere are you (currently )?(located|based)\b/, /\bwhat is your (current )?location\b/, /\bcity,? state\b/, /\bcurrent (city|residence)\b/, /\bbased (in|out of)\b/],
    attrPatterns: [/\blocation\b/],
    exclude: [/\b(preferred|desired|willing|relocat|office|job location|work location)\b/],
  },
  {
    key: "city", label: "City",
    patterns: [/^(home |residential )?city\b/, /\btown\b/, /^city of residence\b/, /\bdistrict\b/],
    attrPatterns: [/\b(city|town)\b/],
    autocomplete: ["address-level2"],
    exclude: [/\b(preferred|desired|willing|relocat|office|birth)\b/],
  },
  {
    key: "state", label: "State",
    patterns: [/^state\b/, /\bstate ?(\/ ?|or )?(province|region|ut)\b/, /\bprovince\b/, /\bstate of residence\b/],
    attrPatterns: [/\b(state|province|region)\b/],
    autocomplete: ["address-level1"],
    exclude: [/\b(statement|united states|status|state (why|your|how|whether))\b/],
  },
  {
    key: "country", label: "Country",
    patterns: [
      /^(current |home )?country\b/, /\bcountry of (current )?residence\b/, /\bcurrent country\b/,
    ],
    sentence: [
      /\bcountry (in which|where) you (are|currently|live|reside)/, /\bwhich country (are you|do you)\b/, /\bwhat country\b.*\b(located|live|reside|based)\b/,
      /\b(current )?country of (current )?residence\b/,
    ],
    attrPatterns: [/\bcountry\b/],
    autocomplete: ["country", "country-name"],
    exclude: [/\b(code|dial|citizenship|birth|nationality|issu)\b/],
  },
  {
    key: "postal_code", label: "PIN / ZIP code",
    patterns: [/\b(pin ?code|pincode|zip( code)?|postal ?code|post ?code)\b/, /^pin$/],
    attrPatterns: [/\b(pin ?code|zip|postal|postcode)\b/],
    autocomplete: ["postal-code"],
  },
  {
    key: "address", label: "Address",
    patterns: [/\b(current |permanent |residential |postal |mailing |home |correspondence )?address( line 1)?\b/, /\bstreet\b/],
    attrPatterns: [/\baddress\b/, /\bstreet\b/],
    autocomplete: ["street-address", "address-line1"],
    exclude: [/\b(e ?mail|web|ip|url|line 2|address 2)\b/],
  },
  {
    key: "date_of_birth", label: "Date of birth",
    patterns: [/\b(date of birth|birth ?date|birthday|d ?o ?b)\b/],
    attrPatterns: [/\b(dob|birth ?date|date of birth|birthday)\b/],
    autocomplete: ["bday"],
  },
  {
    key: "marital_status", label: "Marital status",
    patterns: [/\bmarital status\b/, /^married\b/], attrPatterns: [/\bmarital\b/],
  },
  {
    key: "father_name", label: "Father's name",
    patterns: [/\b(father|guardian)('?s)? name\b/, /^name of (the )?(father|guardian)\b/], attrPatterns: [/\b(father|guardian) ?name\b/],
  },
  {
    key: "preferred_location", label: "Preferred location",
    patterns: [/\b(preferred|desired) (job |work )?(location|city|cities|locations)\b/, /\blocation preference\b/],
    attrPatterns: [/\bpreferred ?location\b/],
  },
  {
    key: "profile_links", label: "Profile link",
    // "Portfolio / LinkedIn / GitHub link": any one of them will do.
    patterns: [/\b(portfolio|linked ?in|git ?hub|web ?site)\b.*\b(portfolio|linked ?in|git ?hub|web ?site)\b/],
    types: ["url", "text"],
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
    patterns: [/\b(portfolio|blog)\b/],
    attrPatterns: [/\bportfolio\b/],
    autocomplete: ["url"],
    exclude: [/\b(linked ?in|git ?hub|company|twitter|facebook|instagram)\b/],
    types: ["url", "text"],
  },
  {
    key: "website", label: "Website",
    patterns: [/\b(personal )?web ?site\b/, /^other (website|links?)/, /\bpersonal site\b/, /^url$/],
    attrPatterns: [/\b(website|web site|url)\b/],
    autocomplete: ["url"],
    exclude: [/\b(linked ?in|git ?hub|company|twitter|facebook|instagram|behance|dribbble)\b/],
    types: ["url", "text"],
  },
  {
    key: "twitter", label: "Twitter / X",
    patterns: [/\btwitter\b/, /^x( profile| handle| url)?$/, /\bx \(twitter\)/], attrPatterns: [/\btwitter\b/],
  },
  { key: "behance", label: "Behance", patterns: [/\bbehance\b/], attrPatterns: [/\bbehance\b/] },
  { key: "dribbble", label: "Dribbble", patterns: [/\bdribb?ble\b/], attrPatterns: [/\bdribb?ble\b/] },
  {
    key: "middle_name", label: "Middle name",
    patterns: [/\bmiddle (name|initial)s?\b/], attrPatterns: [/\bmiddle ?name\b/], autocomplete: ["additional-name"],
  },
  {
    key: "preferred_name", label: "Preferred name",
    patterns: [/\b(preferred|nick) ?(first )?name\b/, /\bname you (go by|prefer)\b/],
    sentence: [/\bname (you|you['’]d|you would) (like us|prefer)\b/, /\bwhat (should|would you like|do you want) (us to|we) call you\b/, /^preferred (first )?name\b/], attrPatterns: [/\b(preferred|nick) ?name\b/], autocomplete: ["nickname"],
    // "I have a preferred name" is a yes/no box that reveals the field.
    exclude: [/^(i have|i use|do you have)\b/],
  },
  {
    key: "phone_type", label: "Phone type",
    patterns: [/\bphone (device |number )?type\b/, /\btype of phone\b/], attrPatterns: [/\bphone ?(device ?)?type\b/],
  },
  {
    key: "phone_country", label: "Phone country",
    patterns: [/\b(country|territory)( \/ territory)?( phone)? code\b/, /\bphone country\b/, /\bdiall?ing code\b/, /\bcountry code\b/],
    attrPatterns: [/\b(country ?code|phone ?country|dial ?code)\b/],
  },
  {
    key: "username", label: "Username",
    patterns: [/\buser ?name\b/, /\blogin( id)?\b/, /\buser id\b/], attrPatterns: [/\buser ?name\b/, /\blogin\b/], autocomplete: ["username"],
    exclude: [/\b(github|twitter|linked ?in|instagram|skype)\b/],
  },
  {
    key: "hispanic", label: "Hispanic / Latino",
    patterns: [/\bhispanic\b/, /\blatin[oax]\b/], attrPatterns: [/\bhispanic\b/],
  },
  {
    key: "armed_forces", label: "Armed forces",
    patterns: [/\barmed forces\b/, /\bmilitary (service|status|spouse)\b/, /\bserved in the\b/], attrPatterns: [/\b(military|armed ?forces)\b/],
  },
  {
    key: "lgbt", label: "LGBTQ+",
    patterns: [/\bsexual orientation\b/, /\blgbt/, /\btransgender\b/], attrPatterns: [/\b(orientation|lgbt)\b/],
  },
  {
    key: "referred_by", label: "Referred by",
    patterns: [/\breferred by\b/, /\b(referrer|referral|referring employee)('?s)? name\b/, /\bwho referred you\b/], attrPatterns: [/\breferr(er|ed ?by)\b/],
  },
  {
    key: "current_date", label: "Today's date",
    patterns: [/\b(today'?s|current) date\b/, /^date$/, /\bsignature date\b/, /^date signed\b/], attrPatterns: [/\b(today|current ?date|sign(ature)? ?date)\b/],
  },
  {
    key: "current_company", label: "Current company",
    patterns: [
      /\b(current|present|most recent|latest|last|previous|recent|past) (company|employer|organi[sz]ation|firm)\b/,
      /^(company|employer|organi[sz]ation)( name)?$/, /\b(employer|organi[sz]ation)('?s)? name\b/, /^name of (the |your )?(employer|company|organi[sz]ation)\b/,
      /^(currently )?working (at|with|for)\b/, /\bemployer\b/,
    ],
    attrPatterns: [/\b(current|latest|last|previous) ?(company|employer|organi[sz]ation)\b/, /\b(org|company|employer)( ?name)?$/],
    autocomplete: ["organization"],
    exclude: [
      /\b(why|reference|referr|applying|address|location|city|phone|email|website|type|size|industry)\b/,
      // Yes/no questions that only mention an employer ("Are you subject to agreements with your current employer?").
      /\b(agreements?|restrictions?|subject to|non ?compete|relatives?|related to|know anyone|conflict)\b/, /^(are|have|do|did|were|is|will|would|has) (you|your|any)\b/,
    ],
  },
  {
    key: "current_title", label: "Current title",
    patterns: [
      /\b(current|present|most recent|latest|last|previous|recent) (job )?(title|role|position|designation)\b/, /^(job )?title$/,
      /\bdesignation\b/, /\bposition held\b/, /^(your )?(role|position)$/, /\bjob role\b/,
    ],
    attrPatterns: [/\b(current|latest|last) ?(title|designation|role)\b/, /\bjob ?title\b/, /\bdesignation\b/],
    autocomplete: ["organization-title"],
    exclude: [/\b(applying|applied|desired|preferred|interested|seeking|looking)\b/],
  },
  {
    key: "job_duration", label: "Job duration",
    patterns: [/\b(job |employment |work |service )?duration\b/, /\btenure\b/, /\bperiod of (employment|service|work)\b/, /\bhow long\b.*\b(worked|employed|working)\b/],
    attrPatterns: [/\b(duration|tenure)\b/],
    exclude: [/\b(course|degree|internship|notice|project)\b/],
  },
  {
    key: "employment_start", label: "Employment start date",
    patterns: [/\bdate of joining\b/, /^from( date)?$/, /\bemployment start\b/, /\bstart(ed)? date of employment\b/, /^worked from\b/],
    attrPatterns: [/\b(doj|date of joining|from ?date)\b/],
    exclude: [/\b(earliest|expected|possible|available|new)\b/],
  },
  {
    key: "employment_end", label: "Employment end date",
    patterns: [/\bdate of (leaving|relieving|exit|resignation)\b/, /\brelieving date\b/, /\blast working (day|date)\b/, /^to( date)?$/, /^worked till\b/],
    attrPatterns: [/\b(dol|relieving ?date|to ?date|last ?working ?day)\b/],
  },
  {
    key: "currently_employed", label: "Currently employed",
    patterns: [/\b(are you )?currently (employed|working)\b/, /\bemployment status\b/, /\b(i )?currently work here\b/, /\bcurrent (job|role|position|employer)\b$/],
    types: ["select", "radio", "checkbox", "text"],
  },
  {
    key: "years_experience", label: "Years of experience",
    patterns: [
      /\b(total |overall |years of |relevant )?(work )?experience( in years)?\b.*\byears?\b/, /\byears of (professional |relevant |work )?experience\b/,
      /^(total |overall |relevant |work )?(experience|exp)( \(?in (years|yrs)\)?)?$/, /\btotal (work )?(experience|exp)\b/, /\bexperience \(?(years|yrs)\)?/,
    ],
    attrPatterns: [/\b(years|yrs) ?(of )?exp/, /\bexperience years\b/, /\btotal ?(experience|exp)\b/],
    exclude: [/\b(describe|tell|explain|relevant to|with)\b/],
    types: ["number", "text", "select", "radio"],
  },
  {
    key: "school", label: "School",
    patterns: [/\b(school|university|college|institution|institute)( name)?\b/, /\bname of (the )?(college|university|institute)\b/, /\balma mater\b/],
    attrPatterns: [/\b(school|university|college|institution|institute)\b/],
    exclude: [/\b(high school diploma|degree|major|gpa|graduat)\b/],
  },
  {
    key: "degree", label: "Degree",
    patterns: [
      /^(highest |latest |educational |education )?(degree|qualification)( obtained| level| name)?\b/, /\blevel of education\b/, /\bhighest (level of )?education\b/,
      /^(highest )?education$/, /^course( name)?$/, /\bgraduation degree\b/,
    ],
    attrPatterns: [/\b(degree|qualification)\b/],
  },
  {
    key: "discipline", label: "Field of study",
    patterns: [/\b(major|discipline|field of study|speciali[sz]ation|area of study|branch|stream)\b/],
    attrPatterns: [/\b(major|discipline|field of study|speciali[sz]ation|branch|stream)\b/],
  },
  {
    key: "graduation_year", label: "Graduation year",
    patterns: [/\bgraduation (year|date)\b/, /\byear of (graduation|passing|completion)\b/, /^end (date )?year$/, /\bpassing (out )?year\b/, /\bpassed out\b/, /^batch$/, /\bcompletion year\b/],
    attrPatterns: [/\bgrad(uation)? ?(year|date)\b/, /\bpassing ?year\b/, /\byop\b/],
  },
  {
    key: "gpa", label: "GPA / percentage",
    patterns: [/\b(c?gpa|grade point|cgpa|percentage|marks|aggregate|grade|score)\b/],
    attrPatterns: [/\b(c?gpa|percentage|marks|grade)\b/],
    exclude: [/\b(test|exam|gre|gmat|ielts|toefl|credit)\b/],
  },
  {
    key: "skills", label: "Skills",
    patterns: [/^(key |technical |relevant )?skills\b/, /\bwhat (are your|skills)\b.*skills/, /\b(type to )?add skills\b/],
    attrPatterns: [/\bskills?\b/],
  },
  {
    key: "account_password", label: "Account password",
    // Sign-up and sign-in pages of job portals (Workday, Taleo, iCIMS…).
    patterns: [/\bpassword\b/, /\bpass ?code\b/, /\bpin\b/],
    attrPatterns: [/\b(password|passwd|pwd)\b/],
    autocomplete: ["new-password", "current-password"],
    types: ["password"],
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
    sentence: [/\b(require|need)\b.*\bto sponsor\b/, /\bsponsor (a |an |your )?(visa|immigration|work permit|h-?1b)\b/],
    attrPatterns: [/\bsponsor/],
  },
  {
    key: "notice_period", label: "Notice period",
    patterns: [/\bnotice( period)?\b/, /\bserving notice\b/, /\bjoining time\b/],
    attrPatterns: [/\bnotice\b/],
  },
  {
    key: "earliest_start_date", label: "Earliest start date",
    patterns: [
      /\bwhen can you (start|join)\b/, /\bearliest (possible )?(start|joining) date\b/, /\bavailab(le|ility) to (start|join)\b/,
      /\b(desired|preferred|available|possible) start date\b/, /\bdate (of )?availab(le|ility)\b/, /\bavailability date\b/,
    ],
    // A bare "start date" usually belongs to a job or degree in the history sections.
    attrPatterns: [/\bavailability\b/],
    exclude: [/\b(employment|job|position held|degree|education|school)\b/],
  },
  {
    key: "work_mode_preference", label: "Work mode preference",
    patterns: [/\b(preferred )?(work|working) (mode|arrangement|model|setup)\b/, /\b(remote|hybrid|on ?site) (preference|work)\b/, /\bopen to (remote|hybrid|on ?site)\b/],
  },
  {
    key: "referral_source", label: "How you heard about the job",
    patterns: [/\bhow did you (hear|learn|find out) about\b/, /\b(referral|application|candidate) source\b/, /\bwhere did you (hear|find|see)\b/],
    sentence: [/\bhow (did )?you (hear|heard|learn|learned|found|find out) about (this|the|us|our)\b/],
    attrPatterns: [/\b(source|referral source|hear about)\b/],
    exclude: [/\breferr(er|ed by)\b.*\bname\b/],
  },
  {
    key: "ethnicity", label: "Race / ethnicity",
    patterns: [/\b(race|ethnicity|ethnic (origin|background))\b/, /\bhispanic or latino\b/], attrPatterns: [/\b(race|ethnicity)\b/],
  },
  {
    key: "veteran_status", label: "Veteran status",
    patterns: [/\bveteran\b/, /\bprotected veteran\b/, /\bmilitary service\b/], attrPatterns: [/\bveteran\b/],
  },
  {
    key: "disability_status", label: "Disability status",
    patterns: [/\bdisabilit(y|ies)\b/], attrPatterns: [/\bdisabilit/],
  },
  {
    key: "expected_salary", label: "Expected salary",
    patterns: [/\b(expected|desired|target|expectation) (annual )?(salary|compensation|ctc|pay|package)\b/, /\b(salary|ctc|compensation) expectations?\b/, /\bectc\b/],
    attrPatterns: [/\b(expected|desired) ?(salary|ctc|compensation)\b/, /\bectc\b/],
  },
  {
    key: "current_salary", label: "Current salary",
    patterns: [/\b(current|present|last|existing|previous)( last| drawn| annual)? (salary|compensation|ctc|pay|package)\b/, /\blast drawn\b/, /^(annual )?ctc$/, /\bcctc\b/],
    attrPatterns: [/\b(current|last) ?(salary|ctc)\b/, /\bcctc\b/],
  },
  {
    key: "willing_to_relocate", label: "Willing to relocate",
    patterns: [/\b(willing|open) to relocat/, /\brelocat(e|ion)\b/], attrPatterns: [/\brelocat/],
  },
  {
    key: "gender", label: "Gender", patterns: [/^gender\b/, /\bgender identity\b/], attrPatterns: [/\bgender\b/],
    sentence: [/\b(describes|describe|identify) (your|you r) gender\b/, /\bwhat is your gender\b/],
  },
  { key: "pronouns", label: "Pronouns", patterns: [/\bpronouns?\b/], attrPatterns: [/\bpronoun/] },
  { key: "nationality", label: "Nationality", patterns: [/\b(nationality|citizenship)\b/], attrPatterns: [/\b(nationality|citizenship)\b/] },
  {
    key: "languages", label: "Languages", patterns: [/\blanguages? (you speak|spoken|known)\b/, /^languages?$/, /^language skills?\b/],
    sentence: [/\bwhat languages\b/, /\blanguages? (do you|can you|you) (speak|read|write|know)\b/, /\blanguage (skills?|proficienc)/],
  },
  {
    key: "role_description", label: "Role description",
    patterns: [/\b(role|job|position) description\b/, /\b(key )?responsibilities\b/, /\bdescribe your (role|work|responsibilities)\b/, /^description$/],
    attrPatterns: [/\b(role|job) ?description\b/],
  },
];

export const RULES_BY_KEY = Object.fromEntries(RULES.map((r) => [r.key, r]));
