import { Progress } from "@copilot/ui";

import type { FormSummary } from "@/sidepanel/autofill-model";

export function ProgressCard({ summary }: { summary: FormSummary }) {
  if (summary.detected === 0) return null;
  return (
    <section aria-labelledby="progress-heading" className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 id="progress-heading" className="text-sm font-semibold">
          Application progress
        </h2>
        <span className="text-xs tabular-nums text-muted-foreground">{summary.percentage}%</span>
      </div>
      <Progress value={summary.percentage} className="mt-2" label="Application completion" />
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Completed</dt>
          <dd className="font-medium tabular-nums">{summary.completed}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Remaining</dt>
          <dd className="font-medium tabular-nums">{summary.remaining}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Need you</dt>
          <dd className="font-medium tabular-nums">{summary.attention}</dd>
        </div>
      </dl>
    </section>
  );
}
