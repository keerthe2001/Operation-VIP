import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { readyKeys, widgetState } from "@/background/widget";
import type { MappedField } from "@/shared/fields";
import { memoryArea, type LocalStore, type SessionStore } from "@/shared/storage";
import type { DetectedJob, WidgetState } from "@/shared/types";
import { makeProfile } from "@/test/profile-fixture";
import { clampY, panelTop, snap } from "@/widget/position";
import { Widget } from "@/widget/Widget";

const job: DetectedJob = {
  portal: "generic", company: "Acme Corp", title: "Data Engineer", url: "https://acme.example/careers/1",
  isApplicationPage: true, confidence: 0.8, signals: [], fieldCount: 3,
  description: "Location: Bengaluru\n3+ years of experience with Python, Go, Docker and Kubernetes.",
};

function mapped(id: string, status: MappedField["status"], extra: Partial<MappedField> = {}): MappedField {
  return {
    id, frameId: 0, kind: "text", label: id, name: id, htmlId: "", placeholder: "", autocomplete: "", helpText: "", required: false,
    options: [], currentValue: "", accept: "", maxLength: null, key: null, confidence: 0.9, status, value: "x", optionValue: null, ...extra,
  };
}

describe("bubble position", () => {
  it("snaps to the nearest side and stays on screen", () => {
    expect(snap(100, 300, 1200, 800)).toEqual({ side: "left", y: 300 });
    expect(snap(900, -50, 1200, 800)).toEqual({ side: "right", y: 12 });
    expect(clampY(5000, 800)).toBe(736);
    expect(panelTop(700, 500, 800)).toBe(288);
  });
});

describe("widgetState", () => {
  it("summarises the form, match and quick-copy profile for the tab", async () => {
    const local = memoryArea<LocalStore>({
      auth: { status: "signed_in", user: null },
      profile: { profile: makeProfile(), primary_resume: { status: "ready", file_name: "priya.pdf" } } as unknown as LocalStore["profile"],
    });
    const fields = [
      mapped("email", "auto"),
      mapped("name", "auto", { currentValue: "Priya" }),
      mapped("cover", "question", { label: "Cover letter" }),
      mapped("cv", "auto", { kind: "file", key: "resume" }),
      mapped("salary", "review"),
    ];
    const session = memoryArea<SessionStore>({
      "tab:3": { url: job.url, job, analyzedAt: 1 },
      "form:3": { url: job.url, fields, updatedAt: 1 },
    } as Partial<SessionStore>);
    expect(readyKeys(fields)).toEqual(["0:email", "0:cv"]);
    const state = await widgetState(3, job.url, local, session);
    expect(state.form).toMatchObject({ detected: 5, ready: 2, filled: 1, review: 1, questions: 1, hasCoverLetterField: true, hasResumeField: true });
    expect(state.resumeName).toBe("priya.pdf");
    expect(state.match).toMatchObject({ matched: ["Python", "Go"], missing: ["Docker", "Kubernetes"], requiredYears: 3, experienceOk: true, locationOk: true });
    expect(state.profile.find((r) => r.label === "Email")?.value).toBe("priya.raman@example.com");
    expect(state.prefs).toMatchObject({ mode: "job_pages", side: "right", hidden: false });
  });
});

function makeState(overrides: Partial<WidgetState> = {}): WidgetState {
  return {
    signedIn: true, firstName: "Priya", job, tracked: null,
    form: { detected: 4, ready: 3, review: 1, missing: 0, questions: 0, filled: 0, hasCoverLetterField: false, hasResumeField: true },
    resumeName: "priya.pdf",
    match: { score: 72, matched: ["Python"], missing: ["Docker"], requiredYears: 3, haveYears: 7, experienceOk: true, location: "Bengaluru", locationOk: true },
    profile: [{ label: "Email", value: "priya.raman@example.com" }],
    prefs: { mode: "job_pages", autoOpen: true, side: "right", y: 160, hidden: false },
    ...overrides,
  };
}

function setup(state: WidgetState) {
  const send = vi.fn(async (message: Record<string, unknown>) => {
    if (message.type === "WIDGET_STATE") return { ok: true as const, data: state };
    if (message.type === "WIDGET_FILL") return { ok: true as const, data: { filled: 3, skipped: 0, failed: 0 } };
    return { ok: true as const };
  });
  render(<Widget send={send as never} url={() => job.url} />);
  return send;
}

describe("floating assistant", () => {
  it("opens by itself on an application and autofills in one click", async () => {
    const send = setup(makeState());
    await userEvent.click(await screen.findByRole("button", { name: "Autofill 3 fields" }));
    expect(send).toHaveBeenCalledWith({ type: "WIDGET_FILL" });
    expect(await screen.findByText(/Filled 3 fields/)).toBeInTheDocument();
    expect(screen.getByText("No field found")).toBeInTheDocument();
  });

  it("shows the job match and copies profile values", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    setup(makeState());
    await userEvent.click(await screen.findByRole("tab", { name: /Match/ }));
    expect(screen.getByText("Strong match")).toBeInTheDocument();
    expect(screen.getByText("Docker")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: /Profile/ }));
    await userEvent.click(screen.getByRole("button", { name: "Copy Email" }));
    expect(writeText).toHaveBeenCalledWith("priya.raman@example.com");
  });

  it("starts as a bubble on job postings and can be hidden on the site", async () => {
    const send = setup(makeState({ job: { ...job, isApplicationPage: false } }));
    const bubble = await screen.findByRole("button", { name: "Open Copilot" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => {
      bubble.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
      bubble.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
    });
    expect(await screen.findByText("This is a job posting")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Minimise" }));
    await userEvent.click(screen.getByRole("button", { name: "Hide Copilot on this site" }));
    expect(send).toHaveBeenCalledWith({ type: "WIDGET_PREFS", prefs: { hideOnHost: location.hostname } });
    expect(screen.queryByRole("button", { name: "Open Copilot" })).not.toBeInTheDocument();
  });

  it("stays out of the way on pages without a job", async () => {
    const send = setup(makeState({ job: null }));
    await vi.waitFor(() => expect(send).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /Copilot/ })).not.toBeInTheDocument();
  });
});
