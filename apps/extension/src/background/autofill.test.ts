import { describe, expect, it, vi } from "vitest";

import { AutofillCoordinator, fieldKey } from "@/background/autofill";
import type { FieldDescriptor, FillInstruction, FillResult } from "@/shared/fields";
import { memoryArea, type LocalStore, type SessionStore } from "@/shared/storage";
import type { ExtensionProfile } from "@/shared/types";
import { makeProfile } from "@/test/profile-fixture";

function field(id: string, label: string, extra: Partial<FieldDescriptor> = {}): FieldDescriptor {
  return {
    id, kind: "text", label, name: "", htmlId: "", placeholder: "", autocomplete: "", helpText: "",
    required: false, options: [], currentValue: "", accept: "", maxLength: null, ...extra,
  };
}

function setup() {
  const data: ExtensionProfile = {
    profile: makeProfile(),
    primary_resume: { id: "r1", file_name: "priya.pdf", mime_type: "application/pdf", status: "ready" } as ExtensionProfile["primary_resume"],
    synced_at: "2026-01-01T00:00:00Z",
    answers: [],
  };
  const local = memoryArea<LocalStore>({ profile: data });
  const session = memoryArea<SessionStore>();
  const api = vi.fn(async () => new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 }));
  const sent: [number, FillInstruction[]][] = [];
  const sendToFrame = vi.fn(async (_tab: number, frameId: number, instructions: FillInstruction[]): Promise<FillResult[]> => {
    sent.push([frameId, instructions]);
    return instructions.map((i) => ({ id: i.id, status: i.id === "f3" ? "skipped" : "filled" }));
  });
  const coordinator = new AutofillCoordinator(local, session, api, sendToFrame);
  return { coordinator, local, session, api, sent };
}

describe("AutofillCoordinator", () => {
  it("maps scanned fields per frame and keeps other frames", async () => {
    const { coordinator } = setup();
    await coordinator.onFieldsScanned(1, 0, "https://x.test/apply", [field("f1", "First name"), field("f2", "Why us?", { kind: "textarea" })]);
    const state = await coordinator.onFieldsScanned(1, 5, "https://x.test/frame", [field("f1", "Email", { kind: "email" })]);
    expect(state.fields.map((f) => [fieldKey(f), f.status, f.value])).toEqual([
      ["0:f1", "auto", "Priya"],
      ["0:f2", "question", null],
      ["5:f1", "auto", "priya.raman@example.com"],
    ]);
    // A new top-level page resets the form.
    const next = await coordinator.onFieldsScanned(1, 0, "https://x.test/other", [field("f9", "Last name")]);
    expect(next.fields.map(fieldKey)).toEqual(["0:f9"]);
  });

  it("fills selected fields per frame, attaches the resume and records results", async () => {
    const { coordinator, sent, api } = setup();
    await coordinator.onFieldsScanned(1, 0, "https://x.test", [
      field("f1", "First name"),
      field("f2", "Resume/CV", { kind: "file" }),
      field("f3", "Last name"),
      field("f4", "Mystery field"),
    ]);
    await coordinator.onFieldsScanned(1, 2, "https://x.test", [field("f1", "Email", { kind: "email" })]);
    const summary = await coordinator.fill(1, ["0:f1", "0:f2", "0:f3", "0:f4", "2:f1"], false);
    expect(summary).toEqual({ filled: 3, skipped: 1, failed: 0 });
    expect(sent.map(([frame, list]) => [frame, list.map((i) => i.id)])).toEqual([
      [0, ["f1", "f2", "f3"]],
      [2, ["f1"]],
    ]);
    const file = sent[0]![1][1]!.file!;
    // Uploaded under the user's name by default ("Name of the resume file you upload").
    expect(file).toMatchObject({ name: "Priya_Raman_Resume.pdf", type: "application/pdf", base64: btoa("%PDF") });
    expect(api).toHaveBeenCalledWith("/api/v1/resumes/r1/file");
    const state = await coordinator.state(1);
    expect(state!.fields.find((f) => f.id === "f3" && f.frameId === 0)!.result).toBe("skipped");
    expect(state!.lastFill).toMatchObject({ filled: 3, skipped: 1, failed: 0 });
  });

  it("re-maps forms when the profile changes", async () => {
    const { coordinator, local } = setup();
    await coordinator.onFieldsScanned(1, 0, "https://x.test", [field("f1", "Phone", { kind: "tel" })]);
    const profile = makeProfile({ personal_information: {} });
    await local.set({ profile: { profile, primary_resume: null, synced_at: "", answers: [] } });
    await coordinator.remapAll([1]);
    expect((await coordinator.state(1))!.fields[0]).toMatchObject({ status: "missing", value: null });
  });
});

describe("memory", () => {
  it("remembers answers the user gives or corrects, and reuses them next time", async () => {
    const { coordinator, local } = setup();
    const url = "https://acme.wd1.myworkdayjobs.com/apply/step1";
    await coordinator.onFieldsScanned(1, 0, url, [field("f1", "City"), field("f2", "Board of 12th standard")]);
    await coordinator.fill(1, ["0:f1"], false);
    // The user changes Copilot's city and fills the question Copilot didn't know.
    await coordinator.onFieldsScanned(1, 0, url, [field("f1", "City", { currentValue: "Bangalore Urban" }), field("f2", "Board of 12th standard", { currentValue: "CBSE" })]);
    const memory = (await local.get("memory")) ?? {};
    expect(memory["acme.wd1.myworkdayjobs.com|city"]?.value).toBe("Bangalore Urban");
    expect(memory["*|board of 12th standard"]?.value).toBe("CBSE");

    // Next application on the same site: both come back filled from memory.
    const next = await coordinator.onFieldsScanned(2, 0, "https://acme.wd1.myworkdayjobs.com/apply/other", [field("g1", "City"), field("g2", "Board of 12th standard")]);
    expect(next.fields.map((f) => [f.value, f.status])).toEqual([["Bangalore Urban", "auto"], ["CBSE", "auto"]]);
    // On another site the profile still wins where it has an answer; memory fills the gap.
    const other = await coordinator.onFieldsScanned(3, 0, "https://jobs.lever.co/x", [field("h1", "City"), field("h2", "Board of 12th standard")]);
    expect(other.fields.map((f) => f.value)).toEqual(["Bengaluru", "CBSE"]);
  });

  it("never remembers passwords or what Copilot itself filled", async () => {
    const { coordinator, local } = setup();
    const url = "https://x.test/apply";
    await coordinator.onFieldsScanned(1, 0, url, [field("f1", "First name"), field("p", "Password", { kind: "password" })]);
    await coordinator.fill(1, ["0:f1"], false);
    await coordinator.onFieldsScanned(1, 0, url, [field("f1", "First name", { currentValue: "Priya" }), field("p", "Password", { kind: "password", currentValue: "••••••••" })]);
    expect(Object.keys((await local.get("memory")) ?? {})).toEqual([]);
  });
});
