import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";

import { quickProfile } from "@/background/widget";
import { WEB_URL } from "@/shared/config";
import type { ExtensionProfile } from "@/shared/types";

/** Profile values to copy into fields Copilot can't fill. */
export function ProfileView({ data }: { data: ExtensionProfile | null }) {
  const [copied, setCopied] = useState<string | null>(null);
  const rows = quickProfile(data);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Profile is empty.</p>;
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Click to copy.</p>
        <a className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline" href={`${WEB_URL}/profile`} target="_blank" rel="noreferrer">
          Edit <ExternalLink className="size-3" aria-hidden="true" />
        </a>
      </div>
      <ul className="grid">
        {rows.map(({ label, value }) => (
          <li key={label}>
            <button
              type="button"
              aria-label={`Copy ${label}`}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-muted"
              onClick={async () => {
                await navigator.clipboard.writeText(value).catch(() => undefined);
                setCopied(label);
                setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{label}</span>
                <span className="block truncate text-xs text-muted-foreground">{value}</span>
              </span>
              {copied === label ? <Check className="size-4 text-success" aria-hidden="true" /> : <Copy className="size-4 text-muted-foreground" aria-hidden="true" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
