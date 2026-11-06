import type { components } from "@copilot/api-types";

export type ExtensionProfile = components["schemas"]["ExtensionProfile"];
export type Profile = ExtensionProfile["profile"];
export type UserRead = components["schemas"]["UserRead"];

export type PortalId = "greenhouse" | "lever" | "workday" | "ashby" | "linkedin" | "generic";

export const PORTAL_NAMES: Record<PortalId, string> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  workday: "Workday",
  ashby: "Ashby",
  linkedin: "LinkedIn",
  generic: "Career site",
};

export interface DetectedJob {
  portal: PortalId;
  company: string | null;
  title: string | null;
  url: string;
  /** True when the page contains a fillable application form. */
  isApplicationPage: boolean;
  /** 0..1, how sure we are that this is a job (application) page. */
  confidence: number;
  signals: string[];
  fieldCount: number;
  /** Plain-text job description, when the page has one (capped). */
  description?: string | null;
}

export type ApplicationStatus = components["schemas"]["ApplicationRead"]["status"];

export interface TrackedApplication {
  id: string;
  url: string;
  status: ApplicationStatus;
}

export interface TabState {
  url: string;
  job: DetectedJob | null;
  analyzedAt: number;
}

export type AuthStatus = "signed_out" | "signed_in" | "expired";

export interface AuthState {
  status: AuthStatus;
  user: UserRead | null;
}

export interface SyncState {
  state: "idle" | "syncing" | "ok" | "error" | "offline";
  lastSyncedAt: number | null;
  error: string | null;
}

/** Everything the floating in-page assistant shows, computed by the background. */
export interface WidgetState {
  signedIn: boolean;
  firstName: string | null;
  job: DetectedJob | null;
  tracked: TrackedApplication | null;
  form: {
    detected: number;
    /** Ready to fill now (confident, still empty). */
    ready: number;
    review: number;
    missing: number;
    questions: number;
    filled: number;
    hasCoverLetterField: boolean;
    hasResumeField: boolean;
    /** A password box is on the page but no account password is saved. */
    needsPassword: boolean;
  };
  resumeName: string | null;
  match: {
    score: number | null;
    matched: string[];
    missing: string[];
    requiredYears: number | null;
    haveYears: number | null;
    experienceOk: boolean | null;
    location: string | null;
    locationOk: boolean | null;
  } | null;
  /** Quick-copy profile values. */
  profile: { label: string; value: string }[];
  prefs: { mode: "job_pages" | "always" | "off"; autoOpen: boolean; y: number; hidden: boolean; theme: "system" | "light" | "dark" };
}
