import { jobMatch } from "@copilot/shared";
import { Badge, cn } from "@copilot/ui";
import { CheckCircle2, MapPin, XCircle } from "lucide-react";

import type { DetectedJob, ExtensionProfile } from "@/shared/types";

export function ScoreRing({ score, size = 52 }: { score: number; size?: number }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const color = score >= 70 ? "var(--color-success, #16a34a)" : score >= 45 ? "var(--color-warning, #d97706)" : "var(--color-destructive, #dc2626)";
  return (
    <div className="relative grid shrink-0 place-items-center text-xs font-bold" style={{ width: size, height: size }} role="img" aria-label={`Match score ${score} out of 100`}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="currentColor" className="text-muted" strokeWidth="5" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="5" fill="none" strokeLinecap="round" strokeDasharray={`${(score / 100) * c} ${c}`} />
      </svg>
      {score}
    </div>
  );
}

/** Rule-based fit between the profile and the job description on the page. */
export function MatchView({ job, data }: { job: DetectedJob | null; data: ExtensionProfile | null }) {
  if (!job?.description) {
    return <p className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">No job description on this page.</p>;
  }
  const match = jobMatch(data?.profile ?? null, job.description);
  const label = match.score == null ? "Not enough detail" : match.score >= 70 ? "Strong match" : match.score >= 45 ? "Fair match" : "Low match";
  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        {match.score != null && <ScoreRing score={match.score} />}
        <div>
          <p className="text-sm font-semibold">{label}</p>
          <p className="text-xs text-muted-foreground">{job.title}</p>
        </div>
      </div>
      <section className="grid gap-2 rounded-xl border bg-card p-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">You have ({match.skills.matched.length})</h3>
        <div className="flex flex-wrap gap-1.5">
          {match.skills.matched.length ? match.skills.matched.map((s) => <Badge key={s} variant="success">{s}</Badge>) : <span className="text-xs text-muted-foreground">None</span>}
        </div>
        <h3 className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Missing ({match.skills.missing.length})</h3>
        <div className="flex flex-wrap gap-1.5">
          {match.skills.missing.length ? match.skills.missing.map((s) => <Badge key={s} variant="warning">{s}</Badge>) : <span className="text-xs text-muted-foreground">None</span>}
        </div>
      </section>
      <section className="grid gap-3 rounded-xl border bg-card p-4 text-sm">
        <div className="flex items-start gap-2.5">
          {match.experience.ok === false ? <XCircle className="mt-0.5 size-4 text-warning" aria-hidden="true" /> : <CheckCircle2 className={cn("mt-0.5 size-4", match.experience.ok ? "text-success" : "text-muted-foreground")} aria-hidden="true" />}
          <div>
            <p className="font-medium">Experience</p>
            <p className="text-xs text-muted-foreground">
              {match.experience.required != null ? `${match.experience.required}+ yrs asked` : "Not stated"}
              {match.experience.have != null ? ` · you: ${match.experience.have}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-start gap-2.5">
          <MapPin className={cn("mt-0.5 size-4", match.location.ok ? "text-success" : match.location.ok === false ? "text-warning" : "text-muted-foreground")} aria-hidden="true" />
          <div>
            <p className="font-medium">Location</p>
            <p className="text-xs text-muted-foreground">{match.location.job ?? "Not stated"}</p>
          </div>
        </div>
      </section>
      <p className="text-xs text-muted-foreground">Keyword estimate, not an employer's screening.</p>
    </div>
  );
}
