import { Search } from "lucide-react";

export function EmptyState({ name }: { name: string | null }) {
  return (
    <section className="rounded-xl border border-dashed p-5 text-center">
      <span className="mx-auto grid size-10 place-items-center rounded-full bg-primary/10 text-primary">
        <Search className="size-5" aria-hidden="true" />
      </span>
      <h2 className="mt-3 text-sm font-semibold">{name ? `Hi ${name}, no application here yet` : "No application on this page"}</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Open a job application on Greenhouse, Lever, Workday, Ashby, LinkedIn or a company careers page. Copilot will
        recognise it and help you fill it in.
      </p>
    </section>
  );
}
