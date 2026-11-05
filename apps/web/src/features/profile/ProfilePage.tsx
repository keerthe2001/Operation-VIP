import { Alert, Badge, Button, Card, CardContent, Progress, Skeleton } from "@copilot/ui";
import { CheckCheck, FileUp, Save } from "lucide-react";
import { useEffect } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { Link, useBlocker } from "react-router";
import { toast } from "sonner";

import { useProfile, useSaveProfile } from "@/features/profile/queries";
import { AdditionalSection } from "@/features/profile/sections/AdditionalSection";
import { CertificationsSection } from "@/features/profile/sections/CertificationsSection";
import { EducationSection } from "@/features/profile/sections/EducationSection";
import { ExperienceSection } from "@/features/profile/sections/ExperienceSection";
import { PersonalSection } from "@/features/profile/sections/PersonalSection";
import { ProjectsSection } from "@/features/profile/sections/ProjectsSection";
import { SkillsSection } from "@/features/profile/sections/SkillsSection";
import { SummarySection } from "@/features/profile/sections/SummarySection";
import { ApiError } from "@/lib/api/errors";
import { applyEdits, cleanForSave, confirmAll, countUnconfirmed, toFormValues } from "@/lib/profile/form";
import type { Profile, ProfileWrite } from "@/lib/profile/profile-service";

const NAV = [
  ["personal", "Personal"],
  ["summary", "Summary"],
  ["experience", "Experience"],
  ["education", "Education"],
  ["skills", "Skills"],
  ["projects", "Projects"],
  ["certifications", "Certifications"],
  ["additional", "Application details"],
] as const;

export function ProfilePage() {
  const profile = useProfile();
  if (profile.isPending) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (profile.isError) {
    return (
      <Alert variant="destructive">
        Couldn't load your profile.{" "}
        <button className="underline" onClick={() => profile.refetch()}>
          Try again
        </button>
      </Alert>
    );
  }
  return <ProfileEditor profile={profile.data} />;
}

function ProfileEditor({ profile }: { profile: Profile }) {
  const form = useForm<ProfileWrite>({ defaultValues: toFormValues(profile), mode: "onBlur" });
  const save = useSaveProfile();
  const values = useWatch({ control: form.control }) as ProfileWrite;
  const unconfirmed = countUnconfirmed(values);
  const isDirty = form.formState.isDirty;

  // Warn before leaving with unsaved edits (in-app navigation and tab close).
  const blocker = useBlocker(({ currentLocation, nextLocation }) => isDirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm("You have unsaved changes. Leave without saving?")) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  async function persist(next: ProfileWrite, message: string) {
    try {
      const saved = await save.mutateAsync(cleanForSave(next));
      form.reset(toFormValues(saved));
      toast.success(message);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save your profile.");
    }
  }

  const onSubmit = form.handleSubmit(
    (data) => persist(applyEdits(data, form.formState.dirtyFields as never), "Profile saved"),
    () => toast.error("Some fields need fixing before you can save."),
  );

  const completion = profile.completion;
  const empty = !profile.personal_information.full_name && profile.experience.length === 0;

  return (
    <FormProvider {...form}>
      <form onSubmit={onSubmit} noValidate className="grid grid-cols-1 gap-6">
        <div className="sticky top-14 z-[5] -mx-4 border-b bg-background/85 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <div className="min-w-0 flex-1">
              <h1 className="whitespace-nowrap text-xl font-semibold tracking-tight">Your profile</h1>
              <div className="mt-1.5 flex items-center gap-3">
                <Progress value={completion.percentage} className="w-24 sm:w-32" label="Profile completion" />
                <span className="whitespace-nowrap text-xs text-muted-foreground">{completion.percentage}% complete</span>
                {unconfirmed > 0 && (
                  <Badge variant="warning">
                    {unconfirmed} to review
                  </Badge>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              {unconfirmed > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => persist(confirmAll(applyEdits(form.getValues(), form.formState.dirtyFields as never)), "All details confirmed")}
                  loading={save.isPending && !isDirty}
                >
                  <CheckCheck aria-hidden="true" /> Confirm all
                </Button>
              )}
              <Button
                type="submit"
                className={unconfirmed > 0 ? undefined : "col-span-2"}
                disabled={!isDirty}
                loading={save.isPending && isDirty}
              >
                <Save aria-hidden="true" /> Save changes
              </Button>
            </div>
          </div>
        </div>

        {empty && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center">
              <p className="flex-1 text-sm text-muted-foreground">
                Upload your resume and we'll fill this in for you. You can also type everything yourself.
              </p>
              <Button asChild variant="outline" size="sm">
                <Link to="/resumes">
                  <FileUp aria-hidden="true" /> Upload resume
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {unconfirmed > 0 && (
          <p className="text-sm text-muted-foreground">
            Fields marked <span className="font-medium text-warning-foreground">Review</span> were read from your resume
            automatically. Check them, then edit or confirm.
          </p>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[180px_minmax(0,1fr)]">
          <nav aria-label="Profile sections" className="hidden lg:block">
            <ul className="sticky top-40 grid gap-1 text-sm">
              {NAV.map(([id, label]) => (
                <li key={id}>
                  <a href={`#${id}`} className="block rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-foreground">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="grid min-w-0 grid-cols-1 gap-6">
            <PersonalSection />
            <SummarySection />
            <ExperienceSection />
            <EducationSection />
            <SkillsSection />
            <ProjectsSection />
            <CertificationsSection />
            <AdditionalSection />
          </div>
        </div>
      </form>
    </FormProvider>
  );
}
