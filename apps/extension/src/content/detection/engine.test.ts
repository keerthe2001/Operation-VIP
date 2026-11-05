import { describe, expect, it } from "vitest";

import { detectJob } from "@/content/detection/engine";
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

  it("uses structured data on generic career sites", () => {
    const job = detect("generic")!;
    expect(job.portal).toBe("generic");
    expect(job.title).toBe("Site Reliability Engineer");
    expect(job.company).toBe("Fabrikam");
    expect(job.isApplicationPage).toBe(true);
    expect(job.signals).toContain("structured-data");
    expect(job.fieldCount).toBe(6);
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
