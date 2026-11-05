import { Badge, Button } from "@copilot/ui";
import { Briefcase, Building2, FormInput, Link2, RefreshCw } from "lucide-react";

import { PORTAL_NAMES, type DetectedJob } from "@/shared/types";

export function JobCard({ job, onRescan }: { job: DetectedJob; onRescan: () => void }) {
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
    </section>
  );
}
