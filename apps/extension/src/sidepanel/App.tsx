import { useEffect, useMemo, useState } from "react";

import { summarize } from "@/sidepanel/autofill-model";
import { send, useActiveTabId, useFormState, useLocal, useTabState, useTrackedApplication } from "@/sidepanel/chrome-state";
import { AnswersSection } from "@/sidepanel/components/AnswersSection";
import { AutofillSection } from "@/sidepanel/components/AutofillSection";
import { EmptyState } from "@/sidepanel/components/EmptyState";
import { Header } from "@/sidepanel/components/Header";
import { JobCard } from "@/sidepanel/components/JobCard";
import { ProgressCard } from "@/sidepanel/components/ProgressCard";
import { Readiness } from "@/sidepanel/components/Readiness";
import { SettingsView } from "@/sidepanel/components/SettingsView";
import { SignInView } from "@/sidepanel/components/SignInView";

export function App() {
  const auth = useLocal("auth");
  const profile = useLocal("profile");
  const sync = useLocal("sync");
  const tabId = useActiveTabId();
  const tab = useTabState(tabId);
  const form = useFormState(tabId);
  const tracked = useTrackedApplication(tabId);
  const formSummary = useMemo(() => summarize(form), [form]);
  const [settings, setSettings] = useState(false);
  const signedIn = auth.status === "signed_in" && auth.user;

  // Refresh the profile whenever the panel opens (cheap thanks to ETags).
  useEffect(() => {
    if (signedIn) void send({ type: "SYNC_PROFILE" });
  }, [signedIn]);

  if (!signedIn) return <SignInView expired={auth.status === "expired"} />;
  if (settings) {
    return (
      <>
        <Header user={auth.user!} sync={sync} onSettings={() => setSettings(false)} />
        <SettingsView user={auth.user!} onBack={() => setSettings(false)} />
      </>
    );
  }

  const job = tab?.job ?? null;
  const firstName = profile?.profile.personal_information.first_name ?? auth.user!.full_name?.split(" ")[0] ?? null;
  return (
    <>
      <Header user={auth.user!} sync={sync} onSettings={() => setSettings(true)} />
      <main className="grid gap-4 p-4">
        {job ? (
          <JobCard
            job={job}
            tabId={tabId}
            tracked={tracked?.url === job.url ? tracked : null}
            skills={profile ? Object.values(profile.profile.skills ?? {}).flat() : undefined}
            onRescan={() => tabId !== null && send({ type: "RESCAN_TAB", tabId })}
          />
        ) : (
          <EmptyState name={firstName} />
        )}
        {job?.isApplicationPage && tabId !== null && <AutofillSection tabId={tabId} form={form} />}
        {job?.isApplicationPage && tabId !== null && (
          <AnswersSection questions={formSummary.questions} tabId={tabId} job={job} data={profile} />
        )}
        {job?.isApplicationPage && <ProgressCard summary={formSummary} />}
        <Readiness data={profile} />
      </main>
    </>
  );
}
