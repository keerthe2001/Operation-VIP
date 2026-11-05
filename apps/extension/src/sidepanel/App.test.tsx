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

describe("smart autofill section", () => {
  function mapped(id: string, label: string, status: string, value: string | null, extra: Record<string, unknown> = {}) {
    return {
      id, frameId: 0, kind: "text", label, name: "", htmlId: "", placeholder: "", autocomplete: "", helpText: "",
      required: false, options: [], currentValue: "", accept: "", maxLength: null, key: status === "unmapped" ? null : "k",
      confidence: status === "auto" ? 0.97 : 0.7, status, value, optionValue: null, ...extra,
    };
  }
  const form = {
    url: job.url,
    updatedAt: 1,
    fields: [
      mapped("f1", "First Name", "auto", "Priya"),
      mapped("f2", "Email", "auto", "priya@example.com"),
      mapped("f3", "Will you require sponsorship?", "review", "No"),
      mapped("f4", "Phone", "missing", null, { required: true }),
      mapped("f5", "Why do you want to work at Acme?", "question", null, { kind: "textarea", required: true }),
      mapped("f6", "How did you hear about us?", "unmapped", null),
    ],
  };

  async function renderWithForm() {
    const fake = installFakeChrome({
      local: { auth: { status: "signed_in", user }, profile },
      session: { "tab:7": { url: job.url, job, analyzedAt: 1 }, "form:7": form },
    });
    render(<App />);
    await screen.findByText("Smart autofill");
    return fake;
  }

  it("shows counts and fills only high-confidence fields with Autofill", async () => {
    const fake = await renderWithForm();
    expect(screen.getByText("Detected").nextSibling).toHaveTextContent("6");
    expect(screen.getByText("Application progress")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Autofill 2 fields" }));
    expect(fake.sendMessage).toHaveBeenCalledWith({ type: "FILL_FIELDS", tabId: 7, fields: ["0:f1", "0:f2"], overwrite: false });
  });

  it("lets the user review, approve medium-confidence fields and exclude others", async () => {
    const fake = await renderWithForm();
    await userEvent.click(screen.getByRole("button", { name: "Review & fill" }));
    expect(screen.getByText("Missing from your profile")).toBeInTheDocument();
    expect(screen.getByText("Questions to answer")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/Will you require sponsorship/));
    await userEvent.click(screen.getByLabelText(/^Email/));
    await userEvent.click(screen.getByLabelText("Replace values already on the page"));
    await userEvent.click(screen.getByRole("button", { name: "Fill selected (2)" }));
    expect(fake.sendMessage).toHaveBeenCalledWith({ type: "FILL_FIELDS", tabId: 7, fields: ["0:f1", "0:f3"], overwrite: true });
  });

  it("shows the fill summary and per-field results", async () => {
    const fake = await renderWithForm();
    await fake.set("session", {
      "form:7": {
        ...form,
        lastFill: { at: 2, filled: 2, skipped: 0, failed: 0 },
        fields: form.fields.map((f) => (f.status === "auto" ? { ...f, result: "filled", currentValue: f.value } : f)),
      },
    });
    expect(await screen.findByText(/Filled 2 fields\. Review the form, then submit it yourself\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Everything ready is filled" })).toBeDisabled();
  });
});
