import { act, render, screen } from "@testing-library/react";
import { createRef } from "react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { readyKeys, widgetState } from "@/background/widget";
import type { MappedField } from "@/shared/fields";
import { memoryArea, type LocalStore, type SessionStore } from "@/shared/storage";
import type { DetectedJob, WidgetState } from "@/shared/types";
import { makeProfile } from "@/test/profile-fixture";
import { clampY } from "@/widget/position";
import { Widget, type WidgetHandle } from "@/widget/Widget";

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

describe("edge tab position", () => {
  it("stays on screen", () => {
    expect(clampY(-50, 800)).toBe(12);
    expect(clampY(5000, 800)).toBe(732);
    expect(clampY(300, 800)).toBe(300);
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
    expect(state.prefs).toMatchObject({ mode: "job_pages", hidden: false, theme: "system" });
  });
});

function makeState(overrides: Partial<WidgetState> = {}): WidgetState {
  return {
    signedIn: true, firstName: "Priya", job, tracked: null,
    form: { detected: 4, ready: 3, review: 1, missing: 0, questions: 0, filled: 0, hasCoverLetterField: false, hasResumeField: true, needsPassword: false },
    resumeName: "priya.pdf", match: null, profile: [],
    prefs: { mode: "job_pages", autoOpen: true, y: 160, hidden: false, theme: "light", showMatch: true },
    ...overrides,
  };
}

function setup(state: WidgetState) {
  const send = vi.fn(async (message: Record<string, unknown>) => {
    if (message.type === "WIDGET_STATE") return { ok: true as const, data: state };
    if (message.type === "WIDGET_EMBED") return { ok: true as const, data: { tabId: 7, nonce: "n1" } };
    return { ok: true as const };
  });
  const handle = createRef<WidgetHandle>();
  render(<Widget send={send as never} url={() => job.url} panelUrl={(tab, nonce) => `chrome-extension://x/sidepanel/index.html?tab=${tab}&embed=1&nonce=${nonce}`} handle={handle} />);
  return { send, handle };
}

const drawerOpen = () => document.querySelector(".drawer.open") !== null;

describe("in-page drawer", () => {
  it("opens by itself on an application and shows the Copilot panel", async () => {
    setup(makeState());
    const frame = await screen.findByTitle("Copilot panel");
    expect(frame).toHaveAttribute("src", "chrome-extension://x/sidepanel/index.html?tab=7&embed=1&nonce=n1");
    expect(drawerOpen()).toBe(true);
    expect(screen.queryByRole("button", { name: "Open Copilot" })).not.toBeInTheDocument();
  });

  it("starts as an edge tab on job posts and opens on a click", async () => {
    setup(makeState({ job: { ...job, isApplicationPage: false } }));
    const tab = await screen.findByRole("button", { name: "Open Copilot" });
    expect(drawerOpen()).toBe(false);
    await act(async () => {
      tab.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, button: 0, clientX: 10, clientY: 200 }));
      tab.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, button: 0, clientX: 10, clientY: 200 }));
    });
    expect(drawerOpen()).toBe(true);
  });

  it("toolbar icon opens it anywhere and closes it on the next click", async () => {
    const { send, handle } = setup(makeState({ job: null }));
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith({ type: "WIDGET_STATE" }));
    expect(screen.queryByRole("button", { name: "Open Copilot" })).not.toBeInTheDocument();
    act(() => handle.current!.toggle());
    expect(await screen.findByTitle("Copilot panel")).toBeInTheDocument();
    expect(drawerOpen()).toBe(true);
    act(() => handle.current!.toggle());
    expect(drawerOpen()).toBe(false);
    act(() => handle.current!.toggle());
    act(() => handle.current!.collapse());
    expect(drawerOpen()).toBe(false);
  });

  it("can be hidden on a site", async () => {
    const { send } = setup(makeState({ job: { ...job, isApplicationPage: false } }));
    await userEvent.click(await screen.findByRole("button", { name: "Hide Copilot on this site" }));
    expect(send).toHaveBeenCalledWith({ type: "WIDGET_PREFS", prefs: { hideOnHost: location.hostname } });
    expect(screen.queryByRole("button", { name: "Open Copilot" })).not.toBeInTheDocument();
  });
});
