import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Progress, Skeleton, cn } from "@copilot/ui";
import { ArrowRight, Check, Circle, FileText, Loader2 } from "lucide-react";
import { Link } from "react-router";

import { useProfile } from "@/features/profile/queries";
import { useResumes } from "@/features/resumes/queries";
import { ResumeDropzone } from "@/features/resumes/ResumeDropzone";
import { ResumeStatusBadge } from "@/features/resumes/ResumeStatusBadge";
import { isProcessing } from "@/lib/resumes/resume-service";
import { useSession } from "@/lib/services";

export function HomePage() {
  const { user } = useSession();
  const resumes = useResumes();
  const latest = resumes.data?.[0];
  const processing = !!latest && isProcessing(latest.status);
  const profile = useProfile();
  const firstName = user?.full_name?.split(" ")[0];

  if (resumes.isPending) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!latest) {
    return (
      <div className="mx-auto grid max-w-2xl gap-6 py-6">
        <div className="text-center">
          <h1 className="text-3xl font-semibold tracking-tight">
            {firstName ? `Welcome, ${firstName}` : "Welcome"} — let's build your profile
          </h1>
          <p className="mt-2 text-muted-foreground">
            Upload your resume once. We'll read it and prepare a profile you can reuse on every job application.
          </p>
        </div>
        <ResumeDropzone />
        <p className="text-center text-xs text-muted-foreground">
          Your files are private to your account and are only used to build your profile.{" "}
          <Link to="/profile" className="underline underline-offset-4">
            Prefer to type it yourself?
          </Link>
        </p>
      </div>
    );
  }

  const completion = profile.data?.completion;
  return (
    <div className="grid grid-cols-1 gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{firstName ? `Welcome back, ${firstName}` : "Welcome back"}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Here's where your application profile stands.</p>
      </div>

      {processing && (
        <Alert className="flex items-center gap-3">
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
          We're reading “{latest.file_name}”. This usually takes a few seconds.
        </Alert>
      )}
      {latest.status === "failed" && (
        <Alert variant="destructive">
          We couldn't read “{latest.file_name}”: {latest.error_message}{" "}
          <Link to="/resumes" className="font-medium underline underline-offset-4">
            Manage resumes
          </Link>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Profile readiness</CardTitle>
            <CardDescription>What job application forms will be able to use.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-5">
            {completion ? (
              <>
                <div className="flex items-center gap-4">
                  <Progress value={completion.percentage} label="Profile completion" />
                  <span className="text-sm font-medium tabular-nums">{completion.percentage}%</span>
                </div>
                <ul className="grid gap-2.5 sm:grid-cols-2">
                  {completion.items.map((item) => (
                    <li key={item.key} className="flex items-center gap-2 text-sm">
                      {item.done ? (
                        <Check className="size-4 text-success" aria-hidden="true" />
                      ) : (
                        <Circle className="size-4 text-muted-foreground/50" aria-hidden="true" />
                      )}
                      <span className={cn(!item.done && "text-muted-foreground")}>{item.label}</span>
                      <span className="sr-only">{item.done ? "(done)" : "(missing)"}</span>
                    </li>
                  ))}
                </ul>
                <div className="flex flex-wrap items-center gap-3">
                  <Button asChild>
                    <Link to="/profile">
                      {completion.unconfirmed_fields > 0 ? "Review profile" : "Edit profile"} <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                  {completion.unconfirmed_fields > 0 && (
                    <Badge variant="warning">{completion.unconfirmed_fields} details to review</Badge>
                  )}
                </div>
              </>
            ) : (
              <Skeleton className="h-40" />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Primary resume</CardTitle>
            <CardDescription>Used when an application asks for a file.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground">
                <FileText className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{latest.file_name}</p>
                <div className="mt-1">
                  <ResumeStatusBadge status={latest.status} />
                </div>
              </div>
            </div>
            <Button asChild variant="outline" size="sm" className="justify-self-start">
              <Link to="/resumes">Manage resumes</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
