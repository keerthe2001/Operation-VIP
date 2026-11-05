import type { Api } from "@/background/api";
import { mapField } from "@/mapping/engine";
import type { FieldDescriptor, FillInstruction, FillResult, FormState, MappedField } from "@/shared/fields";
import type { KeyValueArea, LocalStore, SessionStore } from "@/shared/storage";
import { formEntry, formKey } from "@/shared/storage";

export const fieldKey = (field: Pick<MappedField, "frameId" | "id">) => `${field.frameId}:${field.id}`;

type SendToFrame = (tabId: number, frameId: number, instructions: FillInstruction[]) => Promise<FillResult[]>;

export interface FillSummary {
  filled: number;
  skipped: number;
  failed: number;
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/**
 * Keeps each tab's mapped form in storage.session (so it survives the service worker
 * being suspended) and turns user decisions into fill instructions per frame.
 */
export class AutofillCoordinator {
  private resumeCache: { id: string; file: NonNullable<FillInstruction["file"]> } | null = null;

  constructor(
    private readonly local: KeyValueArea<LocalStore>,
    private readonly session: KeyValueArea<SessionStore>,
    private readonly api: Api,
    private readonly sendToFrame: SendToFrame,
  ) {}

  async state(tabId: number): Promise<FormState | null> {
    return (await this.session.get(formKey(tabId))) ?? null;
  }

  private async profileContext() {
    const data = await this.local.get("profile");
    return { profile: data?.profile ?? null, resumeName: data?.primary_resume?.status === "ready" ? data.primary_resume.file_name : null };
  }

  async onFieldsScanned(tabId: number, frameId: number, url: string, fields: FieldDescriptor[]): Promise<FormState> {
    const previous = await this.state(tabId);
    // A new top-level page starts a new form; other frames keep their fields.
    const keep = previous && !(frameId === 0 && previous.url !== url)
      ? previous.fields.filter((f) => f.frameId !== frameId)
      : [];
    const results = new Map(previous?.fields.map((f) => [fieldKey(f), f]) ?? []);
    const { profile, resumeName } = await this.profileContext();
    const mapped = fields.map((field) => {
      const next = mapField(field, frameId, profile, resumeName);
      const before = results.get(fieldKey(next));
      return before?.result ? { ...next, result: before.result, resultMessage: before.resultMessage } : next;
    });
    const state: FormState = {
      url: frameId === 0 ? url : (previous?.url ?? url),
      fields: [...keep, ...mapped],
      updatedAt: Date.now(),
      lastFill: previous?.lastFill,
    };
    await this.session.set(formEntry(tabId, state));
    return state;
  }

  /** Re-map every tab after the profile changed. */
  async remapAll(tabIds: number[]): Promise<void> {
    const { profile, resumeName } = await this.profileContext();
    for (const tabId of tabIds) {
      const state = await this.state(tabId);
      if (!state) continue;
      state.fields = state.fields.map((f) => ({ ...mapField(f, f.frameId, profile, resumeName), result: f.result, resultMessage: f.resultMessage }));
      await this.session.set(formEntry(tabId, state));
    }
  }

  private async resumeFile(): Promise<FillInstruction["file"] | undefined> {
    const resume = (await this.local.get("profile"))?.primary_resume;
    if (!resume || resume.status !== "ready") return undefined;
    if (this.resumeCache?.id === resume.id) return this.resumeCache.file;
    const response = await this.api(`/api/v1/resumes/${resume.id}/file`);
    if (!response.ok) return undefined;
    const file = { name: resume.file_name, type: resume.mime_type, base64: toBase64(await response.arrayBuffer()) };
    this.resumeCache = { id: resume.id, file };
    return file;
  }

  /** Inserts an answer the user chose (explicit action, so existing text is replaced). */
  async insertText(tabId: number, key: string, text: string): Promise<FillResult> {
    const state = await this.state(tabId);
    const field = state?.fields.find((f) => fieldKey(f) === key);
    if (!state || !field) return { id: key, status: "failed", message: "That field is no longer on the page." };
    let result: FillResult;
    try {
      [result = { id: field.id, status: "failed" }] = await this.sendToFrame(tabId, field.frameId, [
        { id: field.id, kind: field.kind, value: text, optionValue: null, overwrite: true },
      ]);
    } catch {
      result = { id: field.id, status: "failed", message: "The page didn't respond. Reload it and try again." };
    }
    const latest = (await this.state(tabId)) ?? state;
    latest.fields = latest.fields.map((f) =>
      fieldKey(f) === key ? { ...f, result: result.status, resultMessage: result.message, currentValue: result.status === "filled" ? text : f.currentValue } : f,
    );
    await this.session.set(formEntry(tabId, latest));
    return result;
  }

  async fill(tabId: number, keys: string[], overwrite: boolean): Promise<FillSummary> {
    const state = await this.state(tabId);
    if (!state) return { filled: 0, skipped: 0, failed: 0 };
    const wanted = new Set(keys);
    const chosen = state.fields.filter((f) => wanted.has(fieldKey(f)) && f.value !== null);

    const byFrame = new Map<number, FillInstruction[]>();
    for (const field of chosen) {
      const instruction: FillInstruction = {
        id: field.id,
        kind: field.kind,
        value: field.value,
        optionValue: field.optionValue,
        overwrite,
      };
      if (field.kind === "checkbox") instruction.checked = field.optionValue === "true";
      if (field.kind === "file") {
        instruction.file = await this.resumeFile();
        if (!instruction.file) continue;
      }
      byFrame.set(field.frameId, [...(byFrame.get(field.frameId) ?? []), instruction]);
    }

    const results = new Map<string, FillResult>();
    for (const [frameId, instructions] of byFrame) {
      let frameResults: FillResult[];
      try {
        frameResults = await this.sendToFrame(tabId, frameId, instructions);
      } catch {
        frameResults = instructions.map((i) => ({ id: i.id, status: "failed", message: "The page didn't respond. Reload it and try again." }));
      }
      for (const result of frameResults) results.set(`${frameId}:${result.id}`, result);
    }

    const latest = (await this.state(tabId)) ?? state;
    latest.fields = latest.fields.map((f) => {
      const result = results.get(fieldKey(f));
      return result ? { ...f, result: result.status, resultMessage: result.message } : f;
    });
    const summary: FillSummary = { filled: 0, skipped: 0, failed: 0 };
    for (const result of results.values()) summary[result.status] += 1;
    // Fields we couldn't even attempt (e.g. resume file unavailable).
    summary.failed += chosen.length - results.size;
    latest.lastFill = { at: Date.now(), ...summary };
    await this.session.set(formEntry(tabId, latest));
    return summary;
  }
}
