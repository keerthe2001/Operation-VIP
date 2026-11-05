import { Card, CardContent, CardDescription, CardHeader, CardTitle, cn } from "@copilot/ui";
import { Check, FileText, Puzzle } from "lucide-react";
import type { ReactNode } from "react";

import { useSession } from "@/lib/services";

function Step({ done, icon, title, description, badge }: {
  done: boolean;
  icon: ReactNode;
  title: string;
  description: string;
  badge?: string;
}) {
  return (
    <li className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg border [&_svg]:size-4",
          done ? "border-success/30 bg-success/10 text-success" : "bg-muted text-muted-foreground",
        )}
        aria-hidden="true"
      >
        {done ? <Check /> : icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          {title}
          {done && <span className="sr-only">(completed)</span>}
          {badge && (
            <span className="rounded-full border px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
              {badge}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
    </li>
  );
}

export function HomePage() {
  const { user } = useSession();
  const firstName = user?.full_name?.split(" ")[0];

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {firstName ? `Welcome, ${firstName}` : "Welcome"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here's how to get set up for faster job applications.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Getting started</CardTitle>
          <CardDescription>Your account is ready. The next steps unlock as they ship.</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="divide-y">
            <Step done icon={<Check />} title="Create your account" description={`Signed in as ${user?.email ?? ""}`} />
            <Step
              done={false}
              icon={<FileText />}
              title="Upload your resume"
              description="We'll read it and build your profile automatically."
              badge="Coming next"
            />
            <Step
              done={false}
              icon={<Puzzle />}
              title="Install the browser extension"
              description="Autofill applications on Greenhouse, Lever, Workday and more."
              badge="Planned"
            />
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
