import { matchJobSkills } from "@copilot/shared";
import { Badge, Button } from "@copilot/ui";
import { Briefcase, Building2, CheckCircle2, ExternalLink, FormInput, Link2, RefreshCw, Send } from "lucide-react";
import { useState } from "react";

import { send } from "@/sidepanel/chrome-state";
import { WEB_URL } from "@/shared/config";
import { PORTAL_NAMES, type ApplicationStatus, type DetectedJob, type TrackedApplication } from "@/shared/types";

function MatchingSkills({ description, skills }: { description: string | null | undefined; skills: string[] }) {
  if (!description) {
    return <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">No job description found on this page.</p>;
  }
  const matched = matchJobSkills(description, skills);
  return (
    <div className="mt-3 grid gap-1.5 border-t pt-3">
      <p className="text-xs text-muted-foreground">
        {matched.length
          ? `The description mentions ${matched.length} of your skills`
          : "The description doesn't mention any skills from your profile."}
      </p>
      {matched.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Your skills mentioned in the job description">
          {matched.map((skill) => (
            <li key={skill}>
              <Badge variant="secondary">{skill}</Badge>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  detected: "Detected",
  in_progress: "In progress",
  ready_to_submit: "Ready to submit",
  submitted: "Submitted",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
};

function TrackerRow({ tabId, tracked }: { tabId: number; tracked: TrackedApplication }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const before = ["detected", "in_progress", "ready_to_submit"].includes(tracked.status);
  return (
    <div className="mt-3 grid gap-2 border-t pt-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          Tracked · <span className="font-medium text-foreground">{STATUS_LABELS[tracked.status]}</span>
        </span>
        <a
          className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
          href={`${WEB_URL}/applications?id=${tracked.id}`}
          target="_blank"
          rel="noreferrer"
        >
          Open tracker <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      </div>
      {before ? (
        <Button
          size="sm"
          variant="outline"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const reply = await send({ type: "SET_APPLICATION_STATUS", tabId, status: "submitted" });
            setBusy(false);
            setError(reply.ok ? null : reply.error);
          }}
        >
          <Send aria-hidden="true" /> I submitted this application
        </Button>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-success">
          <CheckCircle2 className="size-3.5" aria-hidden="true" /> Marked as {STATUS_LABELS[tracked.status].toLowerCase()}
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function JobCard({
  job,
  onRescan,
  tabId,
  tracked,
  skills,
}: {
  job: DetectedJob;
  onRescan: () => void;
  tabId?: number | null;
  tracked?: TrackedApplication | null;
  skills?: string[];
}) {
  return (
    <section aria-labelledby="job-heading" className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <Badge variant={job.isApplicationPage ? "success" : "secondary"}>
          {job.isApplicationPage ? "Application detected" : "Job posting"}
        </Badge>
        <Button variant="ghost" size="icon" className="-mr-2 -mt-1 size-7" onClick={onRescan} aria-label="Scan page again">
          <RefreshCw aria-hidden="true" />
        </Button>
      </div>
      <h2 id="job-heading" className="mt-3 text-base font-semibold leading-snug">
        {job.title ?? "Untitled position"}
      </h2>
      <dl className="mt-3 grid gap-2 text-sm">
        <div className="flex items-center gap-2">
          <dt className="sr-only">Company</dt>
          <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />
          <dd>{job.company ?? "Unknown company"}</dd>
        </div>
        <div className="flex items-center gap-2">
          <dt className="sr-only">Portal</dt>
          <Briefcase className="size-4 text-muted-foreground" aria-hidden="true" />
          <dd>{PORTAL_NAMES[job.portal]}</dd>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <dt className="sr-only">Page</dt>
          <Link2 className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <dd className="truncate text-muted-foreground" title={job.url}>
            {new URL(job.url).hostname + new URL(job.url).pathname}
          </dd>
        </div>
        {job.isApplicationPage && (
          <div className="flex items-center gap-2">
            <dt className="sr-only">Form fields</dt>
            <FormInput className="size-4 text-muted-foreground" aria-hidden="true" />
            <dd>{job.fieldCount} form fields found</dd>
          </div>
        )}
      </dl>
      {skills && <MatchingSkills description={job.description} skills={skills} />}
      {tracked && tabId != null && <TrackerRow tabId={tabId} tracked={tracked} />}
    </section>
  );
}
