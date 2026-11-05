import type { PortalId } from "@/shared/types";

export interface AdapterResult {
  title: string | null;
  company: string | null;
  /** The adapter knows this page is an application step (form or apply modal). */
  isApplicationPage?: boolean;
  /** The page is a job posting page on this portal. */
  isJobPage: boolean;
}

export interface PortalAdapter {
  id: Exclude<PortalId, "generic">;
  matches(url: URL): boolean;
  extract(doc: Document, url: URL): AdapterResult;
}
