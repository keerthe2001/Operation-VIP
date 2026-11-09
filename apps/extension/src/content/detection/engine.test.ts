import { describe, expect, it } from "vitest";

import { detectJob, forcedJob } from "@/content/detection/engine";
import { scanFields } from "@/content/forms/scanner";
import { PAGES } from "@/test/fixtures/pages";

function detect(name: keyof typeof PAGES) {
  const page = PAGES[name];
  document.documentElement.innerHTML = page.html;
  return detectJob(document, page.url);
}

describe("job detection", () => {
  it.each([
    ["greenhouse", "Senior Backend Engineer", "Acme Corp"],
    ["lever", "Product Designer", "Globex"],
    ["workday", "Data Analyst", "Initech"],
    ["ashby", "Machine Learning Engineer", "Northwind Labs"],
    ["linkedin", "Frontend Developer", "Contoso"],
  ] as const)("recognizes %s applications", (portal, title, company) => {
    const job = detect(portal);
    expect(job).not.toBeNull();
    expect(job!.portal).toBe(portal);
    expect(job!.title).toBe(title);
    expect(job!.company).toBe(company);
    expect(job!.isApplicationPage).toBe(true);
    expect(job!.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("recognizes a plain company careers form with a custom CV drop zone", () => {
    // Floating-label theme: no <label for>, placeholders only, and a hidden file input
    // behind a "Browse Files" button.
    document.documentElement.innerHTML = `
      <head><title>Career - Pixelworks</title></head>
      <body><form>
        <div><input type="text" name="your-name" placeholder="Name"></div>
        <div><input type="tel" name="contact" placeholder="Contact number"></div>
        <div><input type="email" name="your-email" placeholder="Email"></div>
        <div><select name="post"><option>Backend Developer</option><option>Designer</option></select></div>
        <div><textarea name="message" placeholder="MESSAGE"></textarea></div>
        <div><input type="url" name="portfolio" placeholder="Portfolio Url"></div>
        <div><p>Upload CV:</p><div class="dropzone"><input type="file" name="file-583" style="display:none"><button type="button">Browse Files</button></div></div>
      </form></body>`;
    const job = detectJob(document, "https://pixelworks.example/career/")!;
    expect(job).not.toBeNull();
    expect(job.isApplicationPage).toBe(true);
    expect(job.signals).toEqual(expect.arrayContaining(["resume-upload", "job-url"]));
    // Autofill sees the hidden CV input too, labelled by the text next to it.
    const cv = scanFields().find((f) => f.kind === "file");
    expect(cv?.label).toMatch(/Upload CV/);
  });

  it("is confident about any form asking for name, email and phone", () => {
    document.documentElement.innerHTML = `<body><form>
      <input placeholder="Full name"><input type="email" placeholder="Email"><input type="tel" placeholder="Mobile">
    </form></body>`;
    const job = detectJob(document, "https://example.com/join-us")!;
    expect(job.isApplicationPage).toBe(true);
    expect(job.confidence).toBeGreaterThanOrEqual(0.6);
  });

  it("can treat any form as an application when the user asks", () => {
    document.documentElement.innerHTML = `<head><title>Contact - Foo</title></head><body><form><input placeholder="Email"></form></body>`;
    expect(detectJob(document, "https://foo.example/contact")).toBeNull();
    const job = forcedJob(document, "https://foo.example/contact", 1);
    expect(job).toMatchObject({ portal: "generic", isApplicationPage: true, signals: ["user-requested"] });
  });

  it("uses structured data on generic career sites", () => {
    const job = detect("generic")!;
    expect(job.portal).toBe("generic");
    expect(job.title).toBe("Site Reliability Engineer");
    expect(job.company).toBe("Fabrikam");
    expect(job.isApplicationPage).toBe(true);
    expect(job.signals).toContain("structured-data");
    expect(job.fieldCount).toBe(6);
  });

  it("captures the job description as plain text", () => {
    const page = PAGES.generic;
    document.documentElement.innerHTML = page.html.replace(
      '"title":"Site Reliability Engineer",',
      '"title":"Site Reliability Engineer","description":"<p>Keep our systems <b>reliable</b>.</p><ul><li>On-call</li></ul>",',
    );
    expect(detectJob(document, page.url)!.description).toBe("Keep our systems reliable.\nOn-call");
  });

  it("falls back to form signals and the document title", () => {
    const job = detect("genericNoStructuredData")!;
    expect(job).toMatchObject({ portal: "generic", title: "QA Engineer", company: "Contoso", isApplicationPage: true });
    expect(job.signals).toContain("resume-upload");
  });

  it.each(["newsletter", "login"] as const)("ignores non-job forms (%s)", (name) => {
    expect(detect(name)).toBeNull();
  });

  it("treats a portal listing page as not an application", () => {
    const job = detect("greenhouseListing");
    expect(job === null || !job.isApplicationPage).toBe(true);
  });

  it("recognizes a WordPress-style careers form (Contact Form 7)", () => {
    document.documentElement.innerHTML = `<head><title>Careers – Brightpath Solutions</title></head><body><h1>Careers</h1>
      <form class="wpcf7-form">
        <p><label>Your Name (required)<br><span class="wpcf7-form-control-wrap"><input type="text" name="your-name"></span></label></p>
        <p><label>Your Email (required)<br><span><input type="email" name="your-email"></span></label></p>
        <p><label>Phone<br><span><input type="tel" name="your-phone"></span></label></p>
        <p><label>Position Applied For<br><select name="position"><option>Java Developer</option><option>Tester</option></select></label></p>
        <p><label>Total Experience (Years)<br><input type="text" name="experience"></label></p>
        <p><label>Upload Resume<br><input type="file" name="resume"></label></p>
        <p><input type="submit" value="Submit"></p></form></body>`;
    const job = detectJob(document, "https://brightpath.example/careers/")!;
    expect(job).toMatchObject({ portal: "generic", isApplicationPage: true, company: "Brightpath Solutions" });
  });

  it("finds a careers form built from web components (shadow DOM)", () => {
    document.documentElement.innerHTML = `<head><title>Apply – Nimbus</title></head><body><h1>Senior Data Engineer</h1><apply-form></apply-form></body>`;
    const shadow = document.querySelector("apply-form")!.attachShadow({ mode: "open" });
    shadow.innerHTML = `<form><label for="n">Full name</label><input id="n"><label for="e">Email</label><input id="e" type="email">
      <label for="cv">Resume / CV</label><input id="cv" type="file"><label for="np">Notice period</label><input id="np"></form>`;
    const job = detectJob(document, "https://nimbus.example/jobs/senior-data-engineer")!;
    expect(job).toMatchObject({ isApplicationPage: true, title: "Senior Data Engineer" });
    expect(scanFields().map((f) => f.label)).toEqual(["Full name", "Email", "Resume / CV", "Notice period"]);
  });

  it("does not take a contact form for a job application", () => {
    document.documentElement.innerHTML = `<head><title>Contact us – Foo Ltd</title></head><body><h1>Get in touch</h1><form>
      <input placeholder="Full name"><input type="email" placeholder="Email"><input type="tel" placeholder="Phone"><textarea placeholder="Message"></textarea>
    </form></body>`;
    expect(detectJob(document, "https://foo.example/contact")).toBeNull();
  });

  it("knows careers URLs in other forms (job ids, recruitment, other languages)", () => {
    document.documentElement.innerHTML = `<body><form><input placeholder="Full name"><input type="email" placeholder="Email"><input type="tel" placeholder="Mobile"></form></body>`;
    for (const url of ["https://acme.example/recruitment/form", "https://acme.example/opening?jobid=4411", "https://acme.example/karriere/bewerbung", "https://acme.example/work-with-us"]) {
      expect(detectJob(document, url)?.isApplicationPage, url).toBe(true);
    }
  });
});

