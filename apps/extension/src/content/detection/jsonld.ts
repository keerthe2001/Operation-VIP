import { clean } from "@/content/detection/text";

export interface JobPostingData {
  title: string | null;
  company: string | null;
}

function* walk(node: unknown): Generator<Record<string, unknown>> {
  if (Array.isArray(node)) {
    for (const item of node) yield* walk(item);
  } else if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    yield record;
    if (record["@graph"]) yield* walk(record["@graph"]);
  }
}

/** Reads schema.org JobPosting structured data, which most career sites publish. */
export function readJobPosting(doc: Document): JobPostingData | null {
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    let data: unknown;
    try {
      data = JSON.parse(script.textContent ?? "");
    } catch {
      continue;
    }
    for (const item of walk(data)) {
      const type = item["@type"];
      const isPosting = type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
      if (!isPosting) continue;
      const org = item.hiringOrganization as Record<string, unknown> | string | undefined;
      const company = typeof org === "string" ? org : (org?.name as string | undefined);
      return { title: clean(item.title as string | undefined), company: clean(company) };
    }
  }
  return null;
}
