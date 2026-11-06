import { describe, expect, it } from "vitest";

import { detectJob } from "@/content/detection/engine";
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
});
