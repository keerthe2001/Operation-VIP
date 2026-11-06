/**
 * Workday names its form controls with data-automation-id (on the control or its
 * "formField-…" wrapper). These ids are stable across Workday sites, so they identify a field
 * more reliably than its label. Matched on the id with punctuation removed, lower-cased.
 */
const IDS: [RegExp, string | null][] = [
  [/legalname.*firstname|^firstname/, "first_name"],
  [/legalname.*lastname|^lastname/, "last_name"],
  [/legalname.*middlename|^middlename/, "middle_name"],
  [/preferredname.*firstname/, "preferred_name"],
  [/preferredcheck|preferrednamecheckbox/, null],
  [/addresssection.*addressline1|^addressline1/, "address"],
  [/addresssection.*city|^city$/, "city"],
  [/addresssection.*postalcode|^postalcode/, "postal_code"],
  [/addresssection.*(countryregion|region|state)/, "state"],
  [/^countrydropdown|^country$|countryregion$/, "country"],
  [/phonedevicetype|devicetype/, "phone_type"],
  [/countryphonecode|phonecode/, "phone_country"],
  [/phoneextension|extension/, null],
  [/phonenumber|^phone$/, "phone"],
  [/^email|emailaddress/, "email"],
  [/^source|howdidyouhear/, "referral_source"],
  [/previousworker|candidateisprevious/, null],
  [/jobtitle/, "current_title"],
  [/^company|companyname/, "current_company"],
  [/currentlyworkhere/, "currently_working"],
  [/roledescription|^description$/, "role_description"],
  [/^school|schoolname/, "school"],
  [/^degree/, "degree"],
  [/fieldofstudy/, "discipline"],
  [/gradeaverage|gpa|overallresult/, "gpa"],
  [/linkedin/, "linkedin"],
  [/^skills|skillsprompt/, "skills"],
];

const clean = (id: string) => id.toLowerCase().replace(/[^a-z0-9 ]/g, "");

/** The profile key for a Workday field, `null` to leave it, or `undefined` if the id is unknown. */
export function workdayKey(automationId: string | undefined, section: string): string | null | undefined {
  if (!automationId) return undefined;
  const parts = automationId.split(/\s+/).map(clean).filter(Boolean);
  const sectionText = section.toLowerCase();
  for (const part of parts) {
    // Location / dates inside Work Experience belong to that job; handled by the section rules.
    if (/^location$/.test(part)) return /experience|employment/.test(sectionText) ? "job_location" : "location";
    if (/^language$/.test(part)) return "language_item";
    if (/^url$/.test(part)) return "website_item";
    if (/fileuploadinputref|fileupload/.test(part)) return /cover/.test(sectionText) ? null : "resume";
    for (const [pattern, key] of IDS) if (pattern.test(part)) return key;
  }
  return undefined;
}
