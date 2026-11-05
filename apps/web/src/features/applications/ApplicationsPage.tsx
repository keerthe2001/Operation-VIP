import { Alert, Badge, Button, Input, NativeSelect, Skeleton, cn } from "@copilot/ui";
import { Plus, Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { useSearchParams } from "react-router";

import { AddApplicationDialog } from "@/features/applications/AddApplicationDialog";
import { Analytics, StatTiles } from "@/features/applications/Analytics";
import { ApplicationDetailDialog } from "@/features/applications/ApplicationDetailDialog";
import { useApplications, useApplicationStats, useUpdateApplication } from "@/features/applications/queries";
import { STATUS_LABELS, STATUSES, type ApplicationStatus } from "@/lib/applications/application-service";
import { formatDate } from "@/lib/format";

const FILTERS: (ApplicationStatus | "all")[] = ["all", "in_progress", "submitted", "interview", "offer", "rejected"];
const PORTALS: Record<string, string> = {
  greenhouse: "Greenhouse", lever: "Lever", workday: "Workday", ashby: "Ashby", linkedin: "LinkedIn", generic: "Career site",
};

export function ApplicationsPage() {
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<ApplicationStatus | "all">("all");
  const [search, setSearch] = useState("");
  const q = useDeferredValue(search);
  const [adding, setAdding] = useState(false);
  const stats = useApplicationStats();
  const list = useApplications({ status: filter === "all" ? undefined : filter, q });
  const update = useUpdateApplication();
  const openId = params.get("id");

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Applications</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            The extension adds applications as you open them. Only you can mark one as submitted.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" /> Add application
        </Button>
      </div>

      <StatTiles stats={stats.data} />
      <Analytics stats={stats.data} />

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter by status">
          {FILTERS.map((value) => (
            <button
              key={value}
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-colors",
                filter === value ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {value === "all" ? "All" : STATUS_LABELS[value]}
            </button>
          ))}
        </div>
        <label className="relative ml-auto w-full sm:w-64">
          <span className="sr-only">Search applications</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input className="pl-8" placeholder="Search company or title" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      {list.isPending ? (
        <Skeleton className="h-48" />
      ) : list.isError ? (
        <Alert variant="destructive">Couldn't load applications.</Alert>
      ) : list.data.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          {stats.data?.total
            ? "No applications match."
            : "No applications yet. Open a job application with the extension, or add one here."}
        </p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-sm">
          {list.data.map((application) => (
            <li key={application.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <button
                className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => setParams({ id: application.id })}
              >
                <span className="block truncate text-sm font-medium">{application.job_title ?? "Untitled position"}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {application.company_name ?? "Unknown company"}
                  {application.portal && <Badge variant="outline">{PORTALS[application.portal] ?? application.portal}</Badge>}
                  <span>Updated {formatDate(application.updated_at)}</span>
                </span>
              </button>
              <NativeSelect
                aria-label={`Status of ${application.job_title ?? "application"}`}
                className="h-8 w-44 text-xs"
                value={application.status}
                onChange={(e) => update.mutate({ id: application.id, input: { status: e.target.value as ApplicationStatus } })}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </NativeSelect>
            </li>
          ))}
        </ul>
      )}

      <ApplicationDetailDialog id={openId} onClose={() => setParams({})} />
      <AddApplicationDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}
