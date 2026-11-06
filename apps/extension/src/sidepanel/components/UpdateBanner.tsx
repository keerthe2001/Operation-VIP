import { Button } from "@copilot/ui";
import { RotateCw } from "lucide-react";
import { useEffect, useState } from "react";

import { STALE_WORKER_EVENT } from "@/sidepanel/chrome-state";

/** Shown when the background is still running an older build of Copilot. */
export function UpdateBanner() {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const onStale = () => setStale(true);
    window.addEventListener(STALE_WORKER_EVENT, onStale);
    return () => window.removeEventListener(STALE_WORKER_EVENT, onStale);
  }, []);
  if (!stale) return null;
  return (
    <div role="alert" className="mx-4 mt-4 flex items-center gap-3 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm">
      <p className="flex-1">Copilot was updated. Restart it to finish the update, then refresh the job page.</p>
      <Button size="sm" onClick={() => chrome.runtime.reload()}>
        <RotateCw aria-hidden="true" /> Restart
      </Button>
    </div>
  );
}
