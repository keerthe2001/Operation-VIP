import { cn } from "@copilot/ui";
import { Gauge, UserRound, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { summarize } from "@/sidepanel/autofill-model";
import { send, useActiveTabId, useFormState, useLocal, useTabState, useTrackedApplication } from "@/sidepanel/chrome-state";
import { AnswersSection } from "@/sidepanel/components/AnswersSection";
import { AutofillSection, PageAction } from "@/sidepanel/components/AutofillSection";
import { EmptyState } from "@/sidepanel/components/EmptyState";
import { UpdateBanner, WhatsNew } from "@/sidepanel/components/UpdateBanner";
import { ForceScanButton } from "@/sidepanel/components/ForceScanButton";
import { Header } from "@/sidepanel/components/Header";
import { JobCard } from "@/sidepanel/components/JobCard";
import { MatchView } from "@/sidepanel/components/MatchView";
import { ProfileView } from "@/sidepanel/components/ProfileView";
import { ProgressCard } from "@/sidepanel/components/ProgressCard";
import { Readiness } from "@/sidepanel/components/Readiness";
import { SettingsView } from "@/sidepanel/components/SettingsView";
import { SignInView } from "@/sidepanel/components/SignInView";

const params = new URLSearchParams(location.search);
/** Docked in a page's drawer (rather than opened on its own, e.g. in tests). */
const EMBEDDED = params.get("embed") === "1";

type View = "autofill" | "match" | "profile";

export function App() {
  // An embedded panel only runs for the drawer that requested it (a one-time code from the
  // background), so other websites can't frame it.
  const [allowed, setAllowed] = useState<boolean | null>(EMBEDDED ? null : true);
  useEffect(() => {
    if (!EMBEDDED) return;
    void send<boolean>({
      type: "VERIFY_EMBED",
      tabId: Number(params.get("tab")),
      nonce: params.get("nonce") ?? "",
    }).then((r) => setAllowed(r.ok && r.data === true));
  }, []);
  if (allowed === null) return null;
  if (!allowed) return <p className="p-4 text-sm text-muted-foreground">Open Copilot from its toolbar icon.</p>;
  return <Panel />;
}

function Panel() {
  const auth = useLocal("auth");
  const profile = useLocal("profile");
  const sync = useLocal("sync");
  const tabId = useActiveTabId();
  const tab = useTabState(tabId);
  const form = useFormState(tabId);
  const tracked = useTrackedApplication(tabId);
  const formSummary = useMemo(() => summarize(form), [form]);
  const [settings, setSettings] = useState(false);
  const [view, setView] = useState<View>("autofill");
  const onClose = EMBEDDED && tabId !== null ? () => void send({ type: "COLLAPSE_EMBED", tabId }) : undefined;
  const signedIn = auth.status === "signed_in" && auth.user;

  // Refresh the profile whenever the panel opens (cheap thanks to ETags).
  useEffect(() => {
    if (signedIn) void send({ type: "SYNC_PROFILE" });
  }, [signedIn]);

  if (!signedIn) return <SignInView expired={auth.status === "expired"} />;
  if (settings) {
    return (
      <>
        <Header user={auth.user!} sync={sync} onSettings={() => setSettings(false)} onClose={onClose} />
        <SettingsView user={auth.user!} onBack={() => setSettings(false)} />
      </>
    );
  }

  const job = tab?.job ?? null;
  const firstName = profile?.profile.personal_information.first_name ?? auth.user!.full_name?.split(" ")[0] ?? null;
  return (
    <>
      <Header user={auth.user!} sync={sync} onSettings={() => setSettings(true)} onClose={onClose} />
      <UpdateBanner />
      <WhatsNew />
      <div role="tablist" aria-label="Copilot sections" className="mx-4 mt-4 grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {(
          [
            ["autofill", "Autofill", Wand2],
            ["match", "Match", Gauge],
            ["profile", "Profile", UserRound],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => setView(id)}
            className={cn(
              "inline-flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium text-muted-foreground",
              view === id && "bg-background text-foreground shadow-sm",
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" /> {label}
          </button>
        ))}
      </div>
      {view === "match" ? (
        <main className="p-4">
          <MatchView job={job} data={profile} />
        </main>
      ) : view === "profile" ? (
        <main className="p-4">
          <ProfileView data={profile} />
        </main>
      ) : (
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
            <EmptyState name={firstName} tabId={tabId} />
          )}
          {job && !job.isApplicationPage && <ForceScanButton tabId={tabId} variant="outline" />}
          {job?.isApplicationPage && tabId !== null && <AutofillSection tabId={tabId} form={form} />}
            {job?.isApplicationPage && tabId !== null && form?.action && <PageAction tabId={tabId} label={form.action} />}
          {job?.isApplicationPage && tabId !== null && (
            <AnswersSection questions={formSummary.questions} tabId={tabId} job={job} data={profile} />
          )}
          {job?.isApplicationPage && <ProgressCard summary={formSummary} />}
          <Readiness data={profile} />
        </main>
      )}
    </>
  );
}
