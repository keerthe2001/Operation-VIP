import { Search } from "lucide-react";

import { ForceScanButton } from "@/sidepanel/components/ForceScanButton";

export function EmptyState({ name, tabId }: { name: string | null; tabId: number | null }) {
  return (
    <section className="grid gap-3 rounded-xl border border-dashed p-5 text-center">
      <span className="mx-auto grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
        <Search className="size-5" aria-hidden="true" />
      </span>
      <div>
        <h2 className="text-sm font-semibold">{name ? `Hi ${name}, no application here yet` : "No application on this page"}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Copilot recognises applications on job portals and career pages. If this page has a form you want to fill,
          Copilot can fill whatever matches your profile.
        </p>
      </div>
      <ForceScanButton tabId={tabId} />
    </section>
  );
}
