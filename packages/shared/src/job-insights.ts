/**
 * Rule-based reading of a job description: what the company does and the role's main
 * responsibility, rewritten so they fit into a first-person answer. No AI is involved;
 * when nothing reliable is found the result is null and templates use their fallback text.
 */

export interface JobInsights {
  /** Third-person predicate about the company: "helps small businesses get paid faster". */
  companyFocus: string | null;
  /** Base-form verb phrase from the responsibilities: "build data pipelines for your analytics team". */
  responsibility: string | null;
}

// Common verbs that start responsibility bullets ("Build", "Building", "Builds").
const VERBS = (
  "build design develop create own lead manage maintain implement deliver drive improve optimize optimise analyze analyse " +
  "support write test deploy run architect automate collaborate partner work help shape define plan research investigate " +
  "monitor scale migrate integrate prototype ship mentor coach coordinate communicate present report prepare conduct " +
  "perform review evaluate model train clean transform visualize visualise translate identify develop establish contribute " +
  "ensure enable use apply engage gather document drive oversee execute handle resolve troubleshoot configure operate " +
  "assist teach serve sell negotiate recruit manage organize organise track measure forecast audit draft edit produce"
).split(" ");

function gerund(verb: string): string {
  if (/ie$/.test(verb)) return `${verb.slice(0, -2)}ying`;
  if (/[^aeiou]e$/.test(verb) && verb !== "be") return `${verb.slice(0, -1)}ing`;
  if (/^(plan|ship|run|audit)$/.test(verb)) return verb === "audit" ? "auditing" : `${verb}${verb.at(-1)}ing`;
  return `${verb}ing`;
}

function thirdPerson(verb: string): string {
  if (verb === "have") return "has";
  if (verb === "do") return "does";
  if (verb === "are" || verb === "be") return "is";
  if (/[^aeiou]y$/.test(verb)) return `${verb.slice(0, -1)}ies`;
  if (/(s|sh|ch|x|z|o)$/.test(verb)) return `${verb}es`;
  return `${verb}s`;
}

const BASE_FORM = new Map<string, string>();
for (const verb of VERBS) {
  BASE_FORM.set(verb, verb);
  BASE_FORM.set(gerund(verb), verb);
  BASE_FORM.set(thirdPerson(verb), verb);
}

const RESPONSIBILITY_HEADING =
  /^(key )?(responsibilities|duties|what you('|’)?ll do|what you will do|the role|your role|in this role|about the role|day[- ]to[- ]day|your impact|what you'll be doing|what you will be doing|you will)\b/i;
const OTHER_HEADING =
  /^(requirements|qualifications|what we('|’)?re looking for|what you('|’)?ll need|what you bring|skills|benefits|perks|about (us|the company)|who we are|nice to have|preferred|compensation|why join)\b/i;
const LEAD_IN =
  /^(you will|you('|’)ll|you would|will|in this role,? you( will|('|’)ll)?|as an? [^,]{2,40}, you( will|('|’)ll)?|responsible for|your responsibilities (include|are):?)\s+/i;
const SKIP = /\b(equal opportunity|benefit|salary|visa|apply|application|privacy|accommodation|diversity|e-?verify)\b/i;

function lines(description: string): string[] {
  return description
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z])/))
    .map((line) => line.replace(/^[\s•●▪◦·*\-–—>]+|^\d+[.)]\s+/, "").trim())
    .filter(Boolean);
}

function words(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/** Shortens a clause to at most `max` words, cutting at a comma or "and" when possible. */
function shorten(text: string, max: number): string | null {
  const clean = text.replace(/\s*[.;:!]+$/, "").replace(/\s+/g, " ").trim();
  if (words(clean) <= max) return clean;
  const cut = clean.split(/\s+/).slice(0, max).join(" ");
  const boundary = Math.max(cut.lastIndexOf(","), cut.lastIndexOf(" and "));
  return boundary > 20 ? cut.slice(0, boundary).trim() : null;
}

/** "our team" → "your team" and "your skills" → "my skills" for a first-person answer. */
function toApplicantView(text: string): string | null {
  if (/\byou\b/i.test(text)) return null; // "help you grow" can't be rewritten cleanly
  return text
    .replace(/\byour\b/gi, "my")
    .replace(/\bours\b/g, "yours")
    .replace(/\bour\b/g, "your")
    .replace(/\bwe\b/g, "you")
    .replace(/\bus\b/g, "you");
}

export function extractResponsibility(description: string): string | null {
  const all = lines(description);
  const start = all.findIndex((line) => RESPONSIBILITY_HEADING.test(line) && words(line) <= 8);
  let candidates = all;
  if (start >= 0) {
    const rest = all.slice(start + 1);
    const end = rest.findIndex((line) => OTHER_HEADING.test(line) && words(line) <= 8);
    candidates = [...(end >= 0 ? rest.slice(0, end) : rest), ...all];
  }
  for (const line of candidates) {
    if (SKIP.test(line)) continue;
    const text = line.replace(LEAD_IN, "");
    const [first = "", ...rest] = text.split(/\s+/);
    const verb = BASE_FORM.get(first.toLowerCase().replace(/[^a-z]/g, ""));
    if (!verb || rest.length < 3) continue;
    // "Developing and deploying models" → "develop and deploy models".
    // Only when the first verb had the same ending, so "Build models and tests" stays as is.
    const ending = first.toLowerCase().endsWith("ing") ? /ing$/ : first.toLowerCase() !== verb ? /s$/ : null;
    const fixed = rest.map((word, i) =>
      ending && i > 0 && i < 4 && /^(and|or|&)$/.test(rest[i - 1]!) && ending.test(word.toLowerCase())
        ? (BASE_FORM.get(word.toLowerCase()) ?? word)
        : word,
    );
    const phrase = shorten(`${verb} ${fixed.join(" ")}`, 22);
    const view = phrase && toApplicantView(phrase);
    if (view && words(view) >= 4) return view;
  }
  return null;
}

const COMPANY_VERB =
  /^(is|are|builds?|helps?|makes?|creates?|provides?|powers?|enables?|develops?|designs?|delivers?|offers?|serves?|connects?|operates?|runs?|specializes?|specialises?|works?|brings?|transforms?|empowers?|supports?|has|have|was founded|exists?)\b/i;

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function extractCompanyFocus(description: string, company: string | null | undefined): string | null {
  const name = company?.trim();
  const subject = new RegExp(`^(?:at |about )?(?:${name ? `${escapeRegExp(name)}(?:,? inc\\.?|,? ltd\\.?)?|` : ""}we)[,]?\\s+`, "i");
  for (const raw of lines(description)) {
    const line = raw.replace(/’/g, "'").replace(/\bwe're\b/gi, (m) => (m[0] === "W" ? "We are" : "we are"));
    if (SKIP.test(line) || words(line) < 5) continue;
    const mission = line.match(/^(?:our|the company's|[\w&.' -]{2,40}'s) mission is (to .+)/i);
    let predicate: string | null = null;
    if (mission) {
      predicate = `is on a mission ${mission[1]}`;
    } else {
      const match = line.match(subject);
      if (!match) continue;
      const rest = line.slice(match[0].length);
      const verbMatch = rest.match(COMPANY_VERB);
      if (!verbMatch) continue;
      const verb = verbMatch[1]!.toLowerCase();
      const isWe = /^(at |about )?we\b/i.test(line);
      const fixed = isWe ? (verb.endsWith("s") && verb !== "is" ? verb : thirdPerson(verb)) : verb;
      predicate = `${fixed}${rest.slice(verbMatch[0].length)}`;
    }
    const short = shorten(predicate, 26);
    if (!short || /\byou\b/i.test(short)) continue;
    // Seen from outside the company: "our customers" → "its customers".
    return short.replace(/\bour\b/g, "its").replace(/\bwe\b/g, "it").replace(/\bus\b/g, "it");
  }
  return null;
}

export function analyzeJobDescription(description: string | null | undefined, company?: string | null): JobInsights {
  if (!description?.trim()) return { companyFocus: null, responsibility: null };
  return {
    companyFocus: extractCompanyFocus(description, company),
    responsibility: extractResponsibility(description),
  };
}
