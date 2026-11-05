import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { App } from "@/sidepanel/App";
import { installFakeChrome } from "@/test/fake-chrome";

const user = { id: "u1", email: "priya@example.com", full_name: "Priya Raman", created_at: "2026-01-01T00:00:00Z" };
const profile = {
  synced_at: "2026-01-01T00:00:00Z",
  primary_resume: null,
  profile: {
    personal_information: { first_name: "Priya" },
    completion: {
      percentage: 80,
      unconfirmed_fields: 2,
      items: [],
      sections: { personal: "complete", contact: "complete", experience: "complete", resume: "missing", additional: "incomplete" },
    },
  },
};
const job = {
  portal: "greenhouse", company: "Acme Corp", title: "Senior Backend Engineer",
  url: "https://boards.greenhouse.io/acme/jobs/1", isApplicationPage: true, confidence: 1, signals: [], fieldCount: 6,
};

describe("side panel", () => {
  it("shows sign-in when signed out and submits credentials", async () => {
    const { sendMessage } = installFakeChrome({ local: { auth: { status: "signed_out", user: null } } });
    sendMessage.mockResolvedValueOnce({ ok: false, error: "Incorrect email or password." });
    render(<App />);
    expect(await screen.findByRole("link", { name: /Connect with your Copilot account/ })).toHaveAttribute(
      "href",
      "http://localhost:5173/extension/connect",
    );
    await userEvent.type(screen.getByLabelText("Email"), "priya@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(sendMessage).toHaveBeenCalledWith({ type: "SIGN_IN", email: "priya@example.com", password: "wrong" });
    expect(await screen.findByText("Incorrect email or password.")).toBeInTheDocument();
  });

  it("tells users when their session expired", async () => {
    installFakeChrome({ local: { auth: { status: "expired", user: null } } });
    render(<App />);
    expect(await screen.findByText(/session expired/)).toBeInTheDocument();
  });

  it("shows the empty state and readiness when no job is detected", async () => {
    const { sendMessage } = installFakeChrome({ local: { auth: { status: "signed_in", user }, profile, sync: { state: "ok", lastSyncedAt: 1, error: null } } });
    render(<App />);
    expect(await screen.findByText("Hi Priya, no application here yet")).toBeInTheDocument();
    expect(screen.getByText("Application readiness")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("Synced")).toBeInTheDocument();
    expect(sendMessage).toHaveBeenCalledWith({ type: "SYNC_PROFILE" });
  });

  it("shows the detected job for the active tab and reacts to updates", async () => {
    const fake = installFakeChrome({ local: { auth: { status: "signed_in", user }, profile } });
    render(<App />);
    await screen.findByText("Hi Priya, no application here yet");
    await fake.set("session", { "tab:7": { url: job.url, job, analyzedAt: 1 } });
    expect(await screen.findByRole("heading", { name: "Senior Backend Engineer" })).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Greenhouse")).toBeInTheDocument();
    expect(screen.getByText("Application detected")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Scan page again" }));
    expect(fake.sendMessage).toHaveBeenCalledWith({ type: "RESCAN_TAB", tabId: 7 });
  });

  it("switches to sign-in when the background signs the user out", async () => {
    const fake = installFakeChrome({ local: { auth: { status: "signed_in", user }, profile } });
    render(<App />);
    await screen.findByText("Application readiness");
    await fake.set("local", { auth: { status: "signed_out", user: null } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument());
  });

  it("requests the all-sites permission from settings", async () => {
    const fake = installFakeChrome({ local: { auth: { status: "signed_in", user }, profile } });
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Settings" }));
    await userEvent.click(screen.getByRole("button", { name: /Enable on all career sites/ }));
    expect(fake.chrome.permissions.request).toHaveBeenCalledWith({ origins: ["https://*/*", "http://*/*"] });
    expect(fake.sendMessage).toHaveBeenCalledWith({ type: "ENABLE_ALL_SITES" });
  });
});
