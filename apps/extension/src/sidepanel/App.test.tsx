import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { App } from "@/sidepanel/App";
import { installFakeChrome } from "@/test/fake-chrome";

const user = { id: "u1", email: "priya@example.com", full_name: "Priya Raman", created_at: "2026-01-01T00:00:00Z" };
const profile = {
  synced_at: "2026-01-01T00:00:00Z",
  primary_resume: null,
  answers: [
    {
      id: "11111111-1111-4111-8111-111111111111", category: "why_company", question_text: "Why do you want to work here?",
      answer_template: "I'd love to join {company} as a {current_designation}.", variants: ["Short: {company} fits me."],
      usage_count: 0, created_at: "", updated_at: "",
    },
  ],
  profile: {
    personal_information: { first_name: "Priya" },
    professional_summary: { current_designation: "Senior Engineer" },
    experience: [],
    education: [],
    skills: {},
    additional_info: {},
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

describe("answer suggestions", () => {
  const questionField = {
    id: "q1", frameId: 0, kind: "textarea", label: "Why do you want to work at Acme?", name: "", htmlId: "", placeholder: "",
    autocomplete: "", helpText: "", required: true, options: [], currentValue: "", accept: "", maxLength: null, key: null,
    confidence: 0, status: "question", value: null, optionValue: null,
  };
  const otherQuestion = { ...questionField, id: "q2", label: "Describe your favourite data structure and why." };

  async function renderQuestions() {
    const fake = installFakeChrome({
      local: { auth: { status: "signed_in", user }, profile },
      session: { "tab:7": { url: job.url, job, analyzedAt: 1 }, "form:7": { url: job.url, updatedAt: 1, fields: [questionField, otherQuestion] } },
    });
    render(<App />);
    await screen.findByText("Answer suggestions");
    return fake;
  }

  it("renders the matching saved answer with job and profile values, and inserts it", async () => {
    const fake = await renderQuestions();
    const box = screen.getByLabelText(/Why do you want to work at Acme\?/);
    expect(box).toHaveValue("I'd love to join Acme Corp as a Senior Engineer.");
    await userEvent.click(screen.getAllByRole("button", { name: "Insert" })[0]!);
    expect(fake.sendMessage).toHaveBeenCalledWith({
      type: "INSERT_ANSWER", tabId: 7, field: "0:q1", text: "I'd love to join Acme Corp as a Senior Engineer.",
      question: "Why do you want to work at Acme?", savedAnswerId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("cycles variants and lets the user edit", async () => {
    await renderQuestions();
    await userEvent.click(screen.getByRole("button", { name: "Next variant" }));
    const box = screen.getByLabelText(/Why do you want to work at Acme\?/);
    expect(box).toHaveValue("Short: Acme Corp fits me.");
    await userEvent.clear(box);
    await userEvent.type(box, "My own words");
    expect(screen.getAllByRole("button", { name: "Save to library" }).length).toBeGreaterThan(0);
  });

  it("blocks inserting unfilled placeholders but only flags [brackets]", async () => {
    await renderQuestions();
    const box = screen.getByLabelText(/Why do you want to work at Acme\?/);
    await userEvent.clear(box);
    await userEvent.type(box, "My notice is {{notice_period}");
    expect(screen.getByText(/replace before inserting/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Insert" })[0]).toBeDisabled();
    await userEvent.clear(box);
    await userEvent.type(box, "I like it because [[your reason]");
    expect(screen.getByText(/Check the \[bracketed\] parts/)).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Insert" })[0]).toBeEnabled();
  });

  it("offers to save new answers when nothing matches", async () => {
    const fake = await renderQuestions();
    expect(screen.getByText("No saved answer matches. Write one and save it for next time.")).toBeInTheDocument();
    const box = screen.getByLabelText(/favourite data structure/);
    await userEvent.type(box, "A trie, because prefix search is elegant.");
    await userEvent.click(screen.getByRole("button", { name: "Save to library" }));
    expect(fake.sendMessage).toHaveBeenCalledWith({
      type: "SAVE_ANSWER", question: "Describe your favourite data structure and why.", answer: "A trie, because prefix search is elegant.", category: "other",
    });
  });
});

describe("application tracking", () => {
  it("shows the tracked status and lets the user mark it submitted", async () => {
    const fake = installFakeChrome({
      local: { auth: { status: "signed_in", user }, profile },
      session: {
        "tab:7": { url: job.url, job, analyzedAt: 1 },
        "app:7": { id: "a1", url: job.url, status: "in_progress" },
      },
    });
    render(<App />);
    expect(await screen.findByText("In progress")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open tracker/ })).toHaveAttribute("href", "http://localhost:5173/applications?id=a1");
    await userEvent.click(screen.getByRole("button", { name: /I submitted this application/ }));
    expect(fake.sendMessage).toHaveBeenCalledWith({ type: "SET_APPLICATION_STATUS", tabId: 7, status: "submitted" });
    await fake.set("session", { "app:7": { id: "a1", url: job.url, status: "submitted" } });
    expect(await screen.findByText("Marked as submitted")).toBeInTheDocument();
  });
});

describe("job description", () => {
  it("shows which of the user's skills the description mentions and uses them in answers", async () => {
    const withSkills = { ...profile, profile: { ...profile.profile, skills: { programming_languages: ["Python", "Go"], tools: ["Docker"] } } };
    const describedJob = { ...job, description: "You will write Python services and deploy them with Docker." };
    installFakeChrome({
      local: { auth: { status: "signed_in", user }, profile: withSkills },
      session: { "tab:7": { url: job.url, job: describedJob, analyzedAt: 1 } },
    });
    render(<App />);
    expect(await screen.findByText("The description mentions 2 of your skills")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Your skills mentioned in the job description" });
    expect(list).toHaveTextContent("Python");
    expect(list).toHaveTextContent("Docker");
    expect(list).not.toHaveTextContent("Go");
  });

  it("says when the page has no description", async () => {
    installFakeChrome({ local: { auth: { status: "signed_in", user }, profile }, session: { "tab:7": { url: job.url, job, analyzedAt: 1 } } });
    render(<App />);
    expect(await screen.findByText("No job description found on this page.")).toBeInTheDocument();
  });
});
