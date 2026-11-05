import { Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "@copilot/ui";

import { STATUS_LABELS, STATUSES, type ApplicationStats } from "@/lib/applications/application-service";

function weekLabel(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** Single-series column chart: one hue, thin columns, recessive axis, tooltip per column. */
function WeeklyChart({ weekly }: { weekly: ApplicationStats["weekly"] }) {
  const max = Math.max(1, ...weekly.map((w) => w.count));
  return (
    <figure className="grid gap-2">
      <div className="flex h-36 items-end gap-[2px] border-b border-border/70 px-1" role="img" aria-label="Applications started per week, last 8 weeks">
        {weekly.map((week) => (
          <div key={week.week_start} className="group relative flex h-full flex-1 items-end justify-center">
            <div
              className="w-full max-w-7 rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80"
              style={{ height: `${(week.count / max) * 100}%`, minHeight: week.count ? 4 : 0 }}
            />
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-md border bg-background px-2 py-1 text-xs shadow-md group-hover:block"
            >
              Week of {weekLabel(week.week_start)}: <span className="font-medium tabular-nums">{week.count}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="flex gap-[2px] px-1 text-[10px] text-muted-foreground" aria-hidden="true">
        {weekly.map((week, i) => (
          <span key={week.week_start} className="flex-1 text-center">
            {(weekly.length - 1 - i) % 2 === 0 ? weekLabel(week.week_start) : ""}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>Applications started per week</caption>
        <thead>
          <tr><th>Week starting</th><th>Applications</th></tr>
        </thead>
        <tbody>
          {weekly.map((w) => (
            <tr key={w.week_start}><td>{w.week_start}</td><td>{w.count}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function Pipeline({ stats }: { stats: ApplicationStats }) {
  const max = Math.max(1, ...Object.values(stats.by_status));
  return (
    <dl className="grid gap-2">
      {STATUSES.map((status) => {
        const count = stats.by_status[status] ?? 0;
        return (
          <div key={status} className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-2 text-xs">
            <dt className="text-muted-foreground">{STATUS_LABELS[status]}</dt>
            <dd className="h-2 rounded-full bg-muted" aria-hidden="true">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${(count / max) * 100}%`, minWidth: count ? 4 : 0 }} />
            </dd>
            <dd className="text-right font-medium tabular-nums">{count}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export function StatTiles({ stats }: { stats: ApplicationStats | undefined }) {
  if (!stats) return <Skeleton className="h-24" />;
  const tiles: [string, string, string?][] = [
    ["Total", String(stats.total)],
    ["In progress", String(stats.active), "Detected, being filled or ready"],
    ["Submitted", String(stats.submitted), "Including those with a response"],
    ["Response rate", stats.response_rate === null ? "—" : `${Math.round(stats.response_rate * 100)}%`, "Interviews, offers and rejections ÷ submitted"],
    ["This week", String(stats.this_week)],
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map(([label, value, hint]) => (
        <div key={label} className="rounded-xl border bg-card p-4 shadow-sm" title={hint}>
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Analytics({ stats }: { stats: ApplicationStats | undefined }) {
  if (!stats || stats.total === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Applications per week</CardTitle>
          <CardDescription>Started in the last 8 weeks</CardDescription>
        </CardHeader>
        <CardContent>
          <WeeklyChart weekly={stats.weekly} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Pipeline</CardTitle>
          <CardDescription>Applications by current status</CardDescription>
        </CardHeader>
        <CardContent>
          <Pipeline stats={stats} />
        </CardContent>
      </Card>
    </div>
  );
}
