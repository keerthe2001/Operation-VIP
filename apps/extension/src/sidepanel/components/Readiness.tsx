import { Progress, cn } from "@copilot/ui";
import { CheckCircle2, CircleDashed, ExternalLink } from "lucide-react";

import { WEB_URL } from "@/shared/config";
import type { ExtensionProfile } from "@/shared/types";

const ROWS: [string, string, string][] = [
  ["personal", "Profile information", "Complete"],
  ["contact", "Contact information", "Complete"],
  ["experience", "Experience", "Available"],
  ["resume", "Resume", "Available"],
  ["additional", "Application details", "Complete"],
];

export function Readiness({ data }: { data: ExtensionProfile | null }) {
  if (!data) {
    return <div className="h-40 animate-pulse rounded-xl bg-muted" aria-label="Loading profile" />;
  }
  const { completion } = data.profile;
  return (
    <section aria-labelledby="readiness-heading" className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 id="readiness-heading" className="text-sm font-semibold">
          Application readiness
        </h2>
        <span className="text-xs tabular-nums text-muted-foreground">{completion.percentage}%</span>
      </div>
      <Progress value={completion.percentage} className="mt-2" label="Profile completion" />
      <ul className="mt-3 grid gap-2">
        {ROWS.map(([key, label, okWord]) => {
          const status = completion.sections[key];
          const ok = status === "complete";
          return (
            <li key={key} className="flex items-center gap-2 text-sm">
              {ok ? (
                <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
              ) : (
                <CircleDashed className="size-4 text-muted-foreground" aria-hidden="true" />
              )}
              <span className="flex-1">{label}</span>
              <span className={cn("text-xs", ok ? "text-success" : "text-muted-foreground")}>
                {ok ? okWord : okWord === "Available" ? "Missing" : "Incomplete"}
              </span>
            </li>
          );
        })}
      </ul>
      {completion.unconfirmed_fields > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">{completion.unconfirmed_fields} extracted details still need review.</p>
      )}
      <a
        href={`${WEB_URL}/profile`}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      >
        Edit profile <ExternalLink className="size-3" aria-hidden="true" />
      </a>
    </section>
  );
}
