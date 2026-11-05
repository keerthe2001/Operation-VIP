import { Loader2 } from "lucide-react";

export function FullPageSpinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="grid min-h-svh place-items-center" role="status" aria-label={label}>
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
    </div>
  );
}
