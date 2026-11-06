import { Button } from "@copilot/ui";
import { Wand2 } from "lucide-react";
import { useState } from "react";

import { send } from "@/sidepanel/chrome-state";

/** Lets the user fill a form Copilot didn't recognise as a job application. */
export function ForceScanButton({ tabId, variant = "default" }: { tabId: number | null; variant?: "default" | "outline" }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (tabId === null) return null;
  return (
    <div className="grid gap-1.5">
      <Button
        size="sm"
        variant={variant}
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const reply = await send({ type: "FORCE_SCAN", tabId });
          setBusy(false);
          if (!reply.ok) setError(reply.error);
        }}
      >
        <Wand2 aria-hidden="true" /> Fill this page anyway
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
