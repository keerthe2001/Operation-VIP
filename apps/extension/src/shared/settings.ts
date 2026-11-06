/** Autofill behaviour the user controls from the panel's Settings. Stored on this device. */
export interface AutofillSettings {
  /** Use this address in application forms instead of the profile email. */
  applicationEmail: string | null;
  /** Answer what the profile can't: required consent boxes ticked, self-identification
   * "prefer not to say", marketing opt-ins "no", "worked here before?" from your history. */
  bestGuessAnswers: boolean;
  /** Match score on the edge tab and job card. */
  showMatch: boolean;
  /** "auto": fill every page as it opens, create the job-site account (or sign in when it
   * exists) and continue to the next page; stop for fields that need you and ask before
   * the final Submit. "manual": fill when asked; you press the page's buttons. */
  applyMode: "auto" | "manual";
  /** Track applications even when you fill them yourself. */
  trackWithoutAutofill: boolean;
  /** Upload the resume as "First_Last_Resume.pdf" instead of its original file name. */
  resumeFileName: "my_name" | "original";
  /** How filling is shown on the page. */
  fillProgress: "popup" | "modal" | "off";
  /** Ask to mark the application submitted when a confirmation page shows up. */
  submissionPrompt: boolean;
  /** Short "What's new" note after each update. */
  whatsNew: boolean;
  /** Field keys the user switched off. */
  disabledFields: string[];
}

export const DEFAULT_SETTINGS: AutofillSettings = {
  applicationEmail: null,
  bestGuessAnswers: true,
  showMatch: true,
  applyMode: "auto",
  trackWithoutAutofill: true,
  resumeFileName: "my_name",
  fillProgress: "off",
  submissionPrompt: true,
  whatsNew: true,
  disabledFields: [],
};

/** "Fields to autofill": groups of field keys the user can switch off. */
export const FIELD_GROUPS: { title: string; fields: [key: string, label: string][] }[] = [
  {
    title: "Personal information",
    fields: [
      ["first_name", "First name"], ["last_name", "Last name"], ["full_name", "Full name"], ["legal_name", "Legal name"],
      ["middle_name", "Middle name"], ["preferred_name", "Preferred name"], ["email", "Email"], ["phone", "Phone"],
      ["phone_type", "Phone type"], ["phone_country", "Phone country"], ["alternate_phone", "Alternate phone"],
      ["username", "Username"], ["account_password", "Account password"], ["date_of_birth", "Birthday"],
      ["marital_status", "Marital status"], ["father_name", "Father's name"],
    ],
  },
  {
    title: "Location",
    fields: [
      ["location", "Location"], ["address", "Address"], ["city", "City"], ["state", "State"], ["country", "Country"],
      ["postal_code", "Postal code"], ["preferred_location", "Preferred location"], ["willing_to_relocate", "Relocation"],
    ],
  },
  { title: "Documents", fields: [["resume", "Resume"], ["cover_letter", "Cover letter"]] },
  {
    title: "Education",
    fields: [["school", "School"], ["degree", "Highest degree"], ["discipline", "Field of study"], ["graduation_year", "Graduation date"], ["gpa", "GPA / percentage"]],
  },
  {
    title: "Experience",
    fields: [
      ["current_company", "Current company"], ["current_title", "Current title"], ["years_experience", "Years of experience"],
      ["job_duration", "Job duration"], ["employment_start", "Start date"], ["employment_end", "End date"],
      ["currently_employed", "Currently working"], ["notice_period", "Notice period"], ["earliest_start_date", "Start availability"],
      ["current_salary", "Current salary"], ["expected_salary", "Expected salary"], ["work_mode_preference", "Work mode"],
    ],
  },
  {
    title: "EEO",
    fields: [
      ["gender", "Gender"], ["pronouns", "Pronouns"], ["ethnicity", "Ethnicity"], ["hispanic", "Hispanic / Latino"],
      ["veteran_status", "Veteran status"], ["armed_forces", "Armed forces"], ["disability_status", "Disability"], ["lgbt", "LGBTQ+"],
    ],
  },
  {
    title: "Work authorization",
    fields: [["work_authorization", "Work authorization"], ["requires_sponsorship", "Sponsorship"], ["nationality", "Nationality"]],
  },
  {
    title: "Social & links",
    fields: [
      ["linkedin", "LinkedIn"], ["github", "GitHub"], ["portfolio", "Portfolio"], ["website", "Website"], ["profile_links", "Any profile link"],
      ["twitter", "Twitter / X"], ["behance", "Behance"], ["dribbble", "Dribbble"],
    ],
  },
  {
    title: "Other",
    fields: [["skills", "Skills"], ["languages", "Language"], ["referral_source", "Source"], ["referred_by", "Referred by"], ["current_date", "Current date"]],
  },
];
