import { useEffect, useState } from "react";

import { send, useActiveTabId, useLocal, useTabState } from "@/sidepanel/chrome-state";
import { EmptyState } from "@/sidepanel/components/EmptyState";
import { Header } from "@/sidepanel/components/Header";
import { JobCard } from "@/sidepanel/components/JobCard";
import { Readiness } from "@/sidepanel/components/Readiness";
import { SettingsView } from "@/sidepanel/components/SettingsView";
import { SignInView } from "@/sidepanel/components/SignInView";

export function App() {
  const auth = useLocal("auth");
  const profile = useLocal("profile");
  const sync = useLocal("sync");
  const tabId = useActiveTabId();
  const tab = useTabState(tabId);
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
          <JobCard job={job} onRescan={() => tabId !== null && send({ type: "RESCAN_TAB", tabId })} />
        ) : (
          <EmptyState name={firstName} />
        )}
        <Readiness data={profile} />
      </main>
    </>
  );
}
