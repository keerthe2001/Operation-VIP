/** Trimmed-down markup modelled on each portal's real application pages. */

const APPLICATION_FORM = `
  <form id="application_form">
    <label for="first_name">First Name</label><input id="first_name" name="job_application[first_name]" type="text">
    <label for="last_name">Last Name</label><input id="last_name" name="job_application[last_name]" type="text">
    <label for="email">Email</label><input id="email" type="email">
    <label for="phone">Phone</label><input id="phone" type="tel">
    <label for="resume">Resume/CV</label><input id="resume" type="file">
    <label for="linkedin">LinkedIn Profile</label><input id="linkedin" type="text">
    <input type="hidden" name="token" value="x">
    <button type="submit">Submit Application</button>
  </form>`;

export const PAGES = {
  greenhouse: {
    url: "https://boards.greenhouse.io/acmecorp/jobs/4012345",
    html: `<head><title>Job Application for Senior Backend Engineer at Acme Corp</title></head>
      <body><div id="header"><h1 class="app-title">Senior Backend Engineer</h1><span class="company-name">at Acme Corp</span>
      <div class="location">Remote</div></div><div id="content"><p>We are hiring.</p></div>${APPLICATION_FORM}</body>`,
  },
  lever: {
    url: "https://jobs.lever.co/globex/9f1c2d3e-aaaa-bbbb-cccc-1234567890ab/apply",
    html: `<head><title>Globex - Product Designer</title></head><body>
      <div class="main-header-logo"><img alt="Globex logo" src="x.png"></div>
      <div class="posting-headline"><h2>Product Designer</h2></div>
      <form id="application-form">
        <div class="application-question"><div class="application-label">Full name</div><input name="name" type="text"></div>
        <div class="application-question"><div class="application-label">Email</div><input name="email" type="email"></div>
        <div class="application-question"><div class="application-label">Phone</div><input name="phone" type="text"></div>
        <div class="application-question"><div class="application-label">Resume/CV</div><input name="resume" type="file"></div>
      </form></body>`,
  },
  workday: {
    url: "https://initech.wd5.myworkdayjobs.com/en-US/External/job/Austin-TX/Data-Analyst_R-1234/apply/applyManually",
    html: `<head><title>Data Analyst</title></head><body>
      <div data-automation-id="applyFlowPage"><h2 data-automation-id="jobPostingHeader">Data Analyst</h2>
      <div data-automation-id="progressBar">My Information</div>
      <label for="legalNameSection_firstName">Given Name(s)</label><input id="legalNameSection_firstName">
      <label for="legalNameSection_lastName">Family Name</label><input id="legalNameSection_lastName">
      <label for="email">Email Address</label><input id="email"></div></body>`,
  },
  ashby: {
    url: "https://jobs.ashbyhq.com/northwind-labs/6a7b8c9d-1111-2222-3333-444455556666/application",
    html: `<head><title>Northwind Labs</title></head><body><h1>Machine Learning Engineer</h1>
      <form><label for="_systemfield_name">Name</label><input id="_systemfield_name">
      <label for="_systemfield_email">Email</label><input id="_systemfield_email" type="email">
      <label for="_systemfield_resume">Resume</label><input id="_systemfield_resume" type="file"></form></body>`,
  },
  linkedin: {
    url: "https://www.linkedin.com/jobs/view/3900000001/",
    html: `<head><title>(3) Frontend Developer | Contoso | LinkedIn</title></head><body>
      <div class="job-details-jobs-unified-top-card__job-title"><h1>Frontend Developer</h1></div>
      <div class="job-details-jobs-unified-top-card__company-name"><a href="#">Contoso</a></div>
      <div class="jobs-easy-apply-modal" role="dialog">
        <label for="phone">Mobile phone number</label><input id="phone">
        <label for="email">Email address</label><select id="email"><option>me@example.com</option></select>
        <label for="first">First name</label><input id="first">
      </div></body>`,
  },
  generic: {
    url: "https://careers.fabrikam.com/positions/1234-site-reliability-engineer",
    html: `<head><title>Site Reliability Engineer - Fabrikam Careers</title>
      <script type="application/ld+json">{"@context":"https://schema.org","@type":"JobPosting","title":"Site Reliability Engineer",
      "hiringOrganization":{"@type":"Organization","name":"Fabrikam"}}</script></head>
      <body><h1>Site Reliability Engineer</h1><p>Apply for this job below.</p>${APPLICATION_FORM}</body>`,
  },
  genericNoStructuredData: {
    url: "https://www.contoso.io/careers/apply?role=qa-engineer",
    html: `<head><title>QA Engineer at Contoso</title></head><body><h1>QA Engineer</h1>
      <form><div><label>Your name</label><input name="name"></div><div><label>Email</label><input name="email" type="email"></div>
      <div><label>Upload your CV</label><input type="file" name="cv"></div><button>Submit application</button></form></body>`,
  },
  newsletter: {
    url: "https://blog.example.com/posts/hello",
    html: `<head><title>Hello world</title></head><body><h1>Post</h1>
      <form><label for="e">Email</label><input id="e" type="email"><button>Subscribe</button></form></body>`,
  },
  login: {
    url: "https://app.example.com/login",
    html: `<head><title>Sign in</title></head><body><form><label for="u">Email</label><input id="u">
      <label for="p">Password</label><input id="p" type="password"></form></body>`,
  },
  greenhouseListing: {
    url: "https://boards.greenhouse.io/acmecorp",
    html: `<head><title>Jobs at Acme Corp</title></head><body><h1>Current openings at Acme Corp</h1><a href="/acmecorp/jobs/1">Engineer</a></body>`,
  },
};
