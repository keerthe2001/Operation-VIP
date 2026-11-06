/**
 * Application-form samples modelled on the markup of common applicant tracking systems and
 * career pages. Each field lists what it should map to: a profile key, "question" (answered in
 * the user's own words), or null (left alone). Used to measure and improve recognition.
 */
export type Expected = string | null;
export interface Sample {
  name: string;
  html: string;
  /** [label as shown, expected key] in page order (radio groups count once). */
  expect: [string, Expected][];
}

let n = 0;
const id = () => `x${++n}`;
const req = (r: boolean) => (r ? ' <abbr title="required">*</abbr>' : "");

/** Workday: data-automation-id wrappers, dropdown buttons whose aria-label carries the label. */
const wd = {
  text(label: string, r = true, type = "text") {
    const i = id();
    return `<div data-automation-id="formField-${i}"><label for="${i}">${label}${req(r)}</label><input type="${type}" id="${i}" data-automation-id="${i}" ${r ? 'aria-required="true"' : ""}></div>`;
  },
  select(label: string, r = true) {
    const i = id();
    return `<div data-automation-id="formField-${i}"><label id="l${i}">${label}${req(r)}</label><button type="button" aria-haspopup="listbox" aria-label="${label} Select One ${r ? "Required" : ""}" id="${i}">Select One</button></div>`;
  },
  search(label: string, r = true) {
    const i = id();
    return `<div data-automation-id="formField-${i}"><label for="${i}">${label}${req(r)}</label><input id="${i}" data-uxi-widget-type="selectinput" aria-autocomplete="list"></div>`;
  },
  radio(label: string) {
    const i = id();
    return `<fieldset><legend>${label}${req(true)}</legend><label><input type="radio" name="${i}" value="1">Yes</label><label><input type="radio" name="${i}" value="0">No</label></fieldset>`;
  },
  check(label: string) {
    const i = id();
    return `<div><input type="checkbox" id="${i}"><label for="${i}">${label}</label></div>`;
  },
};

/** Plain HTML forms (Greenhouse, Lever, iCIMS, Taleo…): label[for] + input/select/textarea. */
const f = {
  text(label: string, attrs = "", type = "text") {
    const i = id();
    return `<div class="field"><label for="${i}">${label}</label><input type="${type}" id="${i}" ${attrs}></div>`;
  },
  select(label: string, options: string[], attrs = "") {
    const i = id();
    return `<div class="field"><label for="${i}">${label}</label><select id="${i}" ${attrs}><option value="">Select…</option>${options.map((o) => `<option>${o}</option>`).join("")}</select></div>`;
  },
  area(label: string, attrs = "") {
    const i = id();
    return `<div class="field"><label for="${i}">${label}</label><textarea id="${i}" ${attrs}></textarea></div>`;
  },
  file(label: string, attrs = "") {
    const i = id();
    return `<div class="field"><label for="${i}">${label}</label><input type="file" id="${i}" ${attrs}></div>`;
  },
  radio(label: string, options = ["Yes", "No"]) {
    const i = id();
    return `<fieldset><legend>${label}</legend>${options.map((o) => `<label><input type="radio" name="${i}" value="${o}">${o}</label>`).join("")}</fieldset>`;
  },
  check(label: string, attrs = "") {
    const i = id();
    return `<div><input type="checkbox" id="${i}" ${attrs}><label for="${i}">${label}</label></div>`;
  },
};

/** Workday's real "My Experience" markup: automation ids, MM / YYYY spinbuttons, error text. */
const wdx = {
  input(auto: string, label: string, r = true, extra = "") {
    const i = id();
    return `<div data-automation-id="formField-${auto}"><label for="${i}">${label}${req(r)}</label><input type="text" id="${i}" data-automation-id="${auto}" ${r ? 'aria-required="true"' : ""} ${extra}></div>`;
  },
  button(auto: string, label: string) {
    const i = id();
    return `<div data-automation-id="formField-${auto}"><label id="l${i}">${label}${req(true)}</label><button type="button" aria-haspopup="listbox" aria-label="${label} Select One Required" id="${i}" data-automation-id="${auto}">Select One</button></div>`;
  },
  date(auto: string, label: string, error = "") {
    const i = id();
    const err = error ? `<div data-automation-id="errorMessage" id="e${i}" role="alert">${error}</div>` : "";
    return `<div data-automation-id="formField-${auto}"><label id="l${i}">${label}${req(true)}</label><div data-automation-id="dateInputWrapper" role="group" aria-labelledby="l${i}">
      <input type="text" role="spinbutton" aria-label="Month" aria-valuetext="MM" placeholder="MM" data-automation-id="dateSectionMonth-input" ${error ? `aria-invalid="true" aria-describedby="e${i}"` : ""}>
      <input type="text" role="spinbutton" aria-label="Year" aria-valuetext="YYYY" placeholder="YYYY" data-automation-id="dateSectionYear-input"></div>${err}</div>`;
  },
  check(auto: string, label: string) {
    const i = id();
    return `<div data-automation-id="formField-${auto}"><input type="checkbox" id="${i}" data-automation-id="${auto}"><label for="${i}">${label}</label></div>`;
  },
};

export const SAMPLES: Sample[] = [
  {
    name: "Workday · My Information",
    html: `<h2>My Information</h2>${wd.select("How Did You Hear About Us?")}${wd.radio("Have you previously worked for Caterpillar Inc. or any of its subsidiaries?")}
      <h3>Legal Name</h3>${wd.select("Country")}${wd.text("First Name")}${wd.text("Last Name")}${wd.check("I have a preferred name")}
      <h3>Address</h3>${wd.text("Address Line 1")}${wd.text("City")}${wd.select("State")}${wd.text("Postal Code")}
      <h3>Phone</h3>${wd.select("Phone Device Type")}${wd.search("Country Phone Code")}${wd.text("Phone Number")}${wd.text("Phone Extension", false)}
      <h3>Email</h3>${wd.text("Email Address", true, "email")}`,
    expect: [
      ["How Did You Hear About Us?", "referral_source"], ["Have you previously worked for…", null], ["Country", "country"],
      ["First Name", "first_name"], ["Last Name", "last_name"], ["I have a preferred name", null],
      ["Address Line 1", "address"], ["City", "city"], ["State", "state"], ["Postal Code", "postal_code"],
      ["Phone Device Type", "phone_type"], ["Country Phone Code", "phone_country"], ["Phone Number", "phone"], ["Phone Extension", null],
      ["Email Address", "email"],
    ],
  },
  {
    name: "Workday · Application Questions",
    html: `<h2>Application Questions</h2>${wd.select("Are you legally authorized to work in India?")}
      ${wd.select("Will you now or in the future require sponsorship for employment visa status?")}
      ${wd.text("What are your salary expectations?")}${wd.select("Are you willing to relocate?")}
      ${wd.text("What is your notice period?")}${wd.select("How many years of relevant experience do you have?")}
      ${wd.select("Are you at least 18 years of age?")}`,
    expect: [
      ["Authorized to work", "work_authorization"], ["Sponsorship", "requires_sponsorship"], ["Salary expectations", "expected_salary"],
      ["Relocate", "willing_to_relocate"], ["Notice period", "notice_period"], ["Years of experience", "years_experience"], ["18 or older", null],
    ],
  },
  {
    name: "Workday · Voluntary Disclosures",
    html: `<h2>Voluntary Disclosures</h2>${wd.select("Gender")}${wd.select("Ethnicity")}${wd.select("Are you Hispanic or Latino?")}
      ${wd.select("Veteran Status")}${wd.select("Please select one of the options below regarding disability")}
      ${wd.check("I have read and consent to the terms and conditions *")}`,
    expect: [["Gender", "gender"], ["Ethnicity", "ethnicity"], ["Hispanic", "hispanic"], ["Veteran", "veteran_status"], ["Disability", "disability_status"], ["Consent", null]],
  },
  {
    name: "Workday · My Experience (automation ids, MM/YYYY dates, errors)",
    html: `<h2>My Experience</h2>
      <div data-automation-id="workExperienceSection"><div role="group" aria-labelledby="we1"><h4 id="we1">Work Experience 1</h4>
        ${wdx.input("jobTitle", "Job Title")}${wdx.input("company", "Company")}${wdx.input("location", "Location", false)}
        ${wdx.check("currentlyWorkHere", "I currently work here")}${wdx.date("startDate", "From", "Error: The month must be between 1 and 12")}${wdx.date("endDate", "To")}
        ${wdx.input("roleDescription", "Role Description", false)}</div></div>
      <div data-automation-id="educationSection"><div role="group" aria-labelledby="ed1"><h4 id="ed1">Education 1</h4>
        ${wdx.input("school", "School or University")}${wdx.button("degree", "Degree")}${wdx.input("fieldOfStudy", "Field of Study", false)}
        ${wdx.input("gradeAverage", "Overall Result (GPA)", false)}</div></div>
      <div data-automation-id="skillsSection"><h3>Skills</h3>${wdx.input("skills", "Type to Add Skills", false, 'data-uxi-widget-type="selectinput"')}</div>
      <div data-automation-id="resumeSection"><h3>Resume/CV</h3><input type="file" data-automation-id="file-upload-input-ref" aria-label="Upload a file"></div>
      <div data-automation-id="websiteSection"><h3>Websites</h3>${wdx.input("url", "URL", false)}</div>
      <h3>Social Network URLs</h3>${wdx.input("linkedin", "LinkedIn", false)}`,
    expect: [
      ["Job Title", "current_title"], ["Company", "current_company"], ["Location", "job_location"], ["I currently work here", "currently_working"],
      ["From · Month", "employment_start"], ["From · Year", "employment_start"], ["To · Month", "employment_end"], ["To · Year", "employment_end"],
      ["Role Description", "role_description"], ["School", "school"], ["Degree", "degree"], ["Field of Study", "discipline"], ["GPA", "gpa"],
      ["Skills", "skills"], ["Resume", "resume"], ["Website", "website_item"], ["LinkedIn", "linkedin"],
    ],
  },
  {
    name: "Greenhouse",
    html: `<form id="application_form">${f.text("First Name *", 'name="job_application[first_name]"')}${f.text("Last Name *", 'name="job_application[last_name]"')}
      ${f.text("Email *", 'name="job_application[email]"', "email")}${f.text("Phone", 'name="job_application[phone]"', "tel")}
      ${f.text("Location (City)", 'name="job_application[location]"')}${f.file("Resume/CV *")}${f.file("Cover Letter")}
      ${f.text("LinkedIn Profile")}${f.text("Website")}${f.text("How did you hear about this job?")}
      <h3>Education</h3>${f.select("School", ["Anna University", "Other"])}${f.select("Degree", ["Bachelor's Degree", "Master's Degree"])}
      ${f.select("Discipline", ["Computer Science", "Engineering"])}${f.text("Start Date year", 'placeholder="YYYY"')}${f.text("End Date year", 'placeholder="YYYY"')}
      ${f.area("Why do you want to work at Acme?")}</form>`,
    expect: [
      ["First Name", "first_name"], ["Last Name", "last_name"], ["Email", "email"], ["Phone", "phone"], ["Location (City)", "location"],
      ["Resume/CV", "resume"], ["Cover Letter", null], ["LinkedIn", "linkedin"], ["Website", "website"], ["How did you hear", "referral_source"],
      ["School", "school"], ["Degree", "degree"], ["Discipline", "discipline"], ["Start year", "education_start"], ["End year", "graduation_year"],
      ["Why Acme", "question"],
    ],
  },
  {
    name: "Lever",
    html: `<div class="application-page">${f.file("Resume/CV ✱", 'name="resume"')}${f.text("Full name ✱", 'name="name"')}${f.text("Email ✱", 'name="email"', "email")}
      ${f.text("Phone", 'name="phone"')}${f.text("Current company", 'name="org"')}
      <h4>Links</h4>${f.text("LinkedIn URL", 'name="urls[LinkedIn]"')}${f.text("GitHub URL", 'name="urls[GitHub]"')}${f.text("Portfolio URL", 'name="urls[Portfolio]"')}${f.text("Other website", 'name="urls[Other]"')}
      ${f.area("Additional information", 'name="comments"')}</div>`,
    expect: [
      ["Resume/CV", "resume"], ["Full name", "full_name"], ["Email", "email"], ["Phone", "phone"], ["Current company", "current_company"],
      ["LinkedIn URL", "linkedin"], ["GitHub URL", "github"], ["Portfolio URL", "portfolio"], ["Other website", "website_item"], ["Additional information", null],
    ],
  },
  {
    name: "iCIMS",
    html: `<div class="iCIMS_Forms">${f.text("First Name")}${f.text("Last Name")}${f.text("Email")}${f.select("Phone Type", ["Mobile", "Home"])}${f.text("Phone Number")}
      ${f.text("Address")}${f.text("City")}${f.select("State/Province", ["Karnataka", "Tamil Nadu"])}${f.text("Zip/Postal Code")}${f.select("Country", ["India", "United States"])}
      ${f.radio("Are you at least 18 years of age?")}${f.text("Desired Salary")}${f.text("Date Available")}</div>`,
    expect: [
      ["First Name", "first_name"], ["Last Name", "last_name"], ["Email", "email"], ["Phone Type", "phone_type"], ["Phone Number", "phone"],
      ["Address", "address"], ["City", "city"], ["State/Province", "state"], ["Zip/Postal Code", "postal_code"], ["Country", "country"],
      ["18+", null], ["Desired Salary", "expected_salary"], ["Date Available", "earliest_start_date"],
    ],
  },
  {
    name: "SmartRecruiters",
    html: `${f.text("First name")}${f.text("Last name")}${f.text("Email")}${f.text("Confirm your email")}${f.text("Phone number")}${f.text("Location")}
      ${f.text("LinkedIn profile")}${f.text("Website, blog or portfolio")}${f.area("Message to the Hiring Team")}`,
    expect: [
      ["First name", "first_name"], ["Last name", "last_name"], ["Email", "email"], ["Confirm email", "email"], ["Phone", "phone"], ["Location", "location"],
      ["LinkedIn", "linkedin"], ["Website, blog or portfolio", "profile_links"], ["Message to the Hiring Team", "question"],
    ],
  },
  {
    name: "Taleo",
    html: `${f.text("First Name")}${f.text("Middle Name")}${f.text("Last Name")}${f.text("Email Address")}${f.text("Primary Number")}
      ${f.text("Address Line 1")}${f.text("City")}${f.select("State", ["Karnataka"])}${f.text("Zip Code")}${f.select("Country", ["India"])}
      ${f.text("Name of Employer")}${f.text("Job Function")}`,
    expect: [
      ["First Name", "first_name"], ["Middle Name", "middle_name"], ["Last Name", "last_name"], ["Email Address", "email"], ["Primary Number", "phone"],
      ["Address Line 1", "address"], ["City", "city"], ["State", "state"], ["Zip Code", "postal_code"], ["Country", "country"],
      ["Name of Employer", "current_company"], ["Job Function", null],
    ],
  },
  {
    name: "SuccessFactors",
    html: `${f.text("First Name")}${f.text("Last Name")}${f.text("Contact E-mail")}${f.text("Cell Phone")}${f.select("Country/Region of residence", ["India"])}
      ${f.text("Date of Availability")}${f.select("Highest Degree Attained", ["Bachelor's", "Master's"])}${f.text("Current Job Title")}`,
    expect: [
      ["First Name", "first_name"], ["Last Name", "last_name"], ["Contact E-mail", "email"], ["Cell Phone", "phone"], ["Country/Region", "country"],
      ["Date of Availability", "earliest_start_date"], ["Highest Degree", "degree"], ["Current Job Title", "current_title"],
    ],
  },
  {
    name: "Ashby",
    html: `${f.text("Name", 'name="_systemfield_name"')}${f.text("Email", 'name="_systemfield_email"')}${f.text("Phone")}${f.file("Resume", 'name="_systemfield_resume"')}
      ${f.text("LinkedIn")}${f.text("Location")}${f.area("Is there anything else you'd like us to know?")}`,
    expect: [["Name", "full_name"], ["Email", "email"], ["Phone", "phone"], ["Resume", "resume"], ["LinkedIn", "linkedin"], ["Location", "location"], ["Anything else", "question"]],
  },
  {
    name: "Naukri-style apply form",
    html: `${f.text("Name")}${f.text("Email ID")}${f.text("Mobile No.")}${f.select("Total Experience (Years)", ["0", "1", "2", "3"])}
      ${f.text("Current CTC (Lakhs)")}${f.text("Expected CTC (Lakhs)")}${f.select("Notice Period (Days)", ["15", "30", "60"])}
      ${f.text("Current Location")}${f.text("Preferred Location")}${f.text("Key Skills")}${f.select("Highest Qualification", ["B.E/B.Tech", "M.Tech"])}${f.file("Upload Resume")}`,
    expect: [
      ["Name", "full_name"], ["Email ID", "email"], ["Mobile No.", "phone"], ["Total Experience", "years_experience"],
      ["Current CTC", "current_salary"], ["Expected CTC", "expected_salary"], ["Notice Period", "notice_period"],
      ["Current Location", "location"], ["Preferred Location", "preferred_location"], ["Key Skills", "skills"], ["Highest Qualification", "degree"], ["Upload Resume", "resume"],
    ],
  },
  {
    name: "Indian company careers page",
    html: `<h2>Personal Information</h2>${f.text("First Name *")}${f.text("Last Name *")}${f.text("Date of Birth (optional)", "", "date")}${f.text("Mobile Number *")}${f.text("Email Address *")}
      ${f.text("City")}${f.text("State")}${f.text("Country")}${f.text("Pin Code")}${f.text("Father's Name")}${f.select("Gender", ["Male", "Female", "Prefer not to say"])}
      <h2>Professional Details</h2>${f.text("Latest Employer Name *")}${f.text("Designation on Leaving *")}${f.text("Current / Last CTC")}${f.text("Expected CTC")}
      ${f.text("Notice Period")}${f.text("Job Duration *")}${f.area("Reason for Change *")}${f.text("Portfolio / LinkedIn / GitHub Link (optional)")}
      <h2>Education</h2>${f.text("Highest Qualification *")}${f.text("College / University")}${f.text("Year of Passing")}${f.text("Percentage*")}`,
    expect: [
      ["First Name", "first_name"], ["Last Name", "last_name"], ["DOB", "date_of_birth"], ["Mobile", "phone"], ["Email", "email"],
      ["City", "city"], ["State", "state"], ["Country", "country"], ["Pin Code", "postal_code"], ["Father's Name", "father_name"], ["Gender", "gender"],
      ["Latest Employer", "current_company"], ["Designation on Leaving", "current_title"], ["Current / Last CTC", "current_salary"], ["Expected CTC", "expected_salary"],
      ["Notice Period", "notice_period"], ["Job Duration", "job_duration"], ["Reason for Change", "question"], ["Profile links", "profile_links"],
      ["Highest Qualification", "degree"], ["College / University", "school"], ["Year of Passing", "graduation_year"], ["Percentage", "gpa"],
    ],
  },
];
