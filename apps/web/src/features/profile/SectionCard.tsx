import { CardContent, CardDescription, CardHeader } from "@copilot/ui";
import { useId, type ReactNode } from "react";

export function SectionCard({ id, title, description, action, children }: {
  id: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="scroll-mt-32 rounded-xl border bg-card text-card-foreground shadow-sm"
    >
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div className="grid gap-1.5">
          <h2 id={headingId} className="font-semibold leading-none tracking-tight">
            {title}
          </h2>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </section>
  );
}
