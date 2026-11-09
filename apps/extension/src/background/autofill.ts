import type { Api } from "@/background/api";
import { bestOption } from "@/content/autofill/writer";
import { bestGuess } from "@/mapping/best-guess";
import { fieldLabel, mapFields } from "@/mapping/engine";
import { DEFAULT_SETTINGS } from "@/shared/settings";
import type { ActionKind, FieldDescriptor, FillInstruction, FillResult, FormState, MappedField } from "@/shared/fields";
import type { KeyValueArea, LocalStore, SessionStore } from "@/shared/storage";
import { formEntry, formKey, tabKey } from "@/shared/storage";

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

  /** Hooks for the on-page progress view. */
  onStart?: (tabId: number, items: ReturnType<AutofillCoordinator["progressItems"]>) => void;
  onDone?: (tabId: number, items: ReturnType<AutofillCoordinator["progressItems"]>) => void;

  async state(tabId: number): Promise<FormState | null> {
    return (await this.session.get(formKey(tabId))) ?? null;
  }

  private async profileContext() {
    const [data, password, settings] = await Promise.all([
      this.local.get("profile"),
      this.local.get("accountPassword"),
      this.local.get("settings"),
    ]);
    return {
      profile: data?.profile ?? null,
      resumeName: data?.primary_resume?.status === "ready" ? data.primary_resume.file_name : null,
      hasPassword: !!password,
      settings: { ...DEFAULT_SETTINGS, ...settings },
    };
  }

  /** Applies the user's settings and rule-based answers on top of the profile mapping. */
  /**
   * Memory: when the user changes a value Copilot filled, or fills a field Copilot left, the
   * answer is remembered for that site and question (and for the question anywhere).
   */
  private async learn(url: string, fields: FieldDescriptor[], before: Map<string, MappedField>) {
    const host = hostOf(url);
    const learned: Record<string, { value: string; at: number }> = {};
    for (const field of fields) {
      const previous = [...before.values()].find((f) => f.id === field.id);
      const value = field.currentValue.trim();
      if (!previous || !value || !rememberable(field) || value === previous.currentValue.trim()) continue;
      const ours = previous.result === "filled" && squash(previous.value ?? "") === squash(value);
      if (ours) continue; // what Copilot itself put in
      const corrected = previous.result === "filled" && !!previous.value;
      const filledByUser = !previous.currentValue.trim() && previous.status !== "auto";
      if (!corrected && !filledByUser) continue;
      const question = memoryKey(field);
      if (!question) continue;
      learned[`${host}|${question}`] = { value, at: Date.now() };
      learned[`*|${question}`] = { value, at: Date.now() };
    }
    if (Object.keys(learned).length === 0) return;
    const memory = { ...((await this.local.get("memory")) ?? {}), ...learned };
    // Keep the most recent 500 answers.
    const entries = Object.entries(memory).sort((a, b) => b[1].at - a[1].at).slice(0, 500);
    await this.local.set({ memory: Object.fromEntries(entries) });
  }

  private async adjust(tabId: number, fields: MappedField[], context: Awaited<ReturnType<AutofillCoordinator["profileContext"]>>, url?: string) {
    const { hasPassword, settings, profile } = context;
    const memory = (await this.local.get("memory")) ?? {};
    const host = url ? hostOf(url) : "";
    const off = new Set(settings.disabledFields);
    let adjusted = fields.map((f): MappedField => {
      // Password boxes are ready only when the user saved an account password.
      if (f.key === "account_password" && !hasPassword) return { ...f, status: "missing", value: null };
      if (f.key === "email" && settings.applicationEmail && f.value) return { ...f, value: settings.applicationEmail };
      // The user's own earlier answer: on this site it wins over the profile; elsewhere it
      // fills only what the profile couldn't.
      const question = rememberable(f) ? memoryKey(f) : "";
      const remembered = question ? (memory[`${host}|${question}`] ?? (f.value ? undefined : memory[`*|${question}`])) : undefined;
      if (remembered) {
        const option = f.options.length ? bestOption(f.options.map((o) => ({ ...o, text: o.label })), remembered.value) : null;
        if (f.options.length && !option) return f;
        return { ...f, key: f.key ?? "remembered", status: "auto", value: option?.label ?? remembered.value, optionValue: option?.value ?? null };
      }
      return f;
    });
    if (settings.bestGuessAnswers) {
      const job = (await this.session.get(tabKey(tabId)))?.job;
      adjusted = bestGuess(adjusted, {
        company: job?.company ?? null,
        employers: profile?.experience.map((e) => e.company_name).filter((c): c is string => !!c) ?? [],
      });
    }
    // Fields switched off in Settings are left alone.
    return adjusted.map((f): MappedField => (f.key && off.has(f.key) ? { ...f, status: "unmapped", value: null, optionValue: null } : f));
  }

  async onFieldsScanned(
    tabId: number,
    frameId: number,
    url: string,
    fields: FieldDescriptor[],
    action?: string | null,
    actionKind?: ActionKind | null,
    accountExists?: boolean,
    pageErrors?: string[],
  ): Promise<FormState> {
    const previous = await this.state(tabId);
    // A new top-level page starts a new form; other frames keep their fields.
    const keep = previous && !(frameId === 0 && previous.url !== url)
      ? previous.fields.filter((f) => f.frameId !== frameId)
      : [];
    const results = new Map(previous?.fields.map((f) => [fieldKey(f), f]) ?? []);
    const context = await this.profileContext();
    await this.learn(url, fields, results);
    const adjusted = await this.adjust(tabId, mapFields(fields, frameId, context.profile, context.resumeName), context, url);
    const mapped = adjusted.map((next) => {
      const before = results.get(fieldKey(next));
      return before?.result ? { ...next, result: before.result, resultMessage: before.resultMessage } : next;
    });
    const state: FormState = {
      url: frameId === 0 ? url : (previous?.url ?? url),
      fields: [...keep, ...mapped],
      updatedAt: Date.now(),
      lastFill: previous && previous.url === url ? previous.lastFill : undefined,
      action: action !== undefined && (frameId === 0 || action) ? action : previous?.action,
      actionKind: action !== undefined && (frameId === 0 || action) ? (actionKind ?? null) : previous?.actionKind,
      accountExists: frameId === 0 ? !!accountExists : previous?.accountExists,
      pageErrors: frameId === 0 ? (pageErrors ?? []) : previous?.pageErrors,
    };
    await this.session.set(formEntry(tabId, state));
    return state;
  }

  /** Re-map every tab after the profile changed. */
  async remapAll(tabIds: number[]): Promise<void> {
    const context = await this.profileContext();
    const { profile, resumeName } = context;
    for (const tabId of tabIds) {
      const state = await this.state(tabId);
      if (!state) continue;
      const frames = [...new Set(state.fields.map((f) => f.frameId))];
      const remapped = await this.adjust(
        tabId,
        frames.flatMap((frameId) => mapFields(state.fields.filter((f) => f.frameId === frameId), frameId, profile, resumeName)),
        context,
        state.url,
      );
      const before = new Map(state.fields.map((f) => [fieldKey(f), f]));
      state.fields = remapped.map((f) => ({ ...f, result: before.get(fieldKey(f))?.result, resultMessage: before.get(fieldKey(f))?.resultMessage }));
      await this.session.set(formEntry(tabId, state));
    }
  }

  private async resumeFile(): Promise<FillInstruction["file"] | undefined> {
    const data = await this.local.get("profile");
    const resume = data?.primary_resume;
    if (!data || !resume || resume.status !== "ready") return undefined;
    let file = this.resumeCache?.id === resume.id ? this.resumeCache.file : undefined;
    if (!file) {
      const response = await this.api(`/api/v1/resumes/${resume.id}/file`);
      if (!response.ok) return undefined;
      file = { name: resume.file_name, type: resume.mime_type, base64: toBase64(await response.arrayBuffer()) };
      this.resumeCache = { id: resume.id, file };
    }
    // "Use my name": upload as First_Last_Resume.pdf whatever the file was called.
    const settings = { ...DEFAULT_SETTINGS, ...(await this.local.get("settings")) };
    const name = data.profile.personal_information.full_name?.trim();
    if (settings.resumeFileName === "my_name" && name) {
      const extension = resume.file_name.includes(".") ? resume.file_name.slice(resume.file_name.lastIndexOf(".")) : "";
      return { ...file, name: `${name.split(/\s+/).join("_").replace(/[^\w.-]/g, "")}_Resume${extension}` };
    }
    return file;
  }

  /** One field finished while filling one by one; returns the progress list for the page. */
  async onProgress(tabId: number, frameId: number, id: string, status: "filling" | FillResult["status"], message?: string) {
    const state = await this.state(tabId);
    if (!state) return null;
    const key = `${frameId}:${id}`;
    if (status !== "filling") {
      state.fields = state.fields.map((f) => (fieldKey(f) === key ? { ...f, result: status, resultMessage: message } : f));
      await this.session.set(formEntry(tabId, state));
    }
    return this.progressItems(state, key, status);
  }

  progressItems(state: FormState, current?: string, currentStatus?: string) {
    const byKey = new Map(state.fields.map((f) => [fieldKey(f), f]));
    return (state.filling ?? []).flatMap((key) => {
      const f = byKey.get(key);
      if (!f) return [];
      const status = key === current && currentStatus === "filling" ? "filling" : (f.result ?? "pending");
      return [{ id: key, label: (fieldLabel(f) || "Field").slice(0, 200), status: status as "pending" | "filling" | FillResult["status"] }];
    });
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

  /** Fields that were filled but don't hold the value (or show an error): candidates for a retry. */
  async unverified(tabId: number, keys: string[]): Promise<string[]> {
    const state = await this.state(tabId);
    const wanted = new Set(keys);
    return (state?.fields ?? []).filter((f) => wanted.has(fieldKey(f)) && f.result === "filled" && (!!activeError(f) || !holdsValue(f))).map(fieldKey);
  }

  /** Marks fields as not filled, with the reason shown to the user. */
  async markFailed(tabId: number, keys: string[], fallback: string) {
    const state = await this.state(tabId);
    if (!state || keys.length === 0) return;
    const bad = new Set(keys);
    state.fields = state.fields.map((f) => (bad.has(fieldKey(f)) ? { ...f, result: "failed", resultMessage: f.error || fallback } : f));
    await this.session.set(formEntry(tabId, state));
  }

  async fill(tabId: number, keys: string[], overwrite: boolean, options: { typing?: boolean } = {}): Promise<FillSummary> {
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
      if (field.key === "skills" && field.kind === "combobox") instruction.multi = true;
      if (field.kind === "text" && ["location", "city", "job_location", "preferred_location"].includes(field.key ?? "")) instruction.suggest = true;
      if (options.typing) instruction.typing = true;
      if (field.key === "account_password") {
        const password = await this.local.get("accountPassword");
        if (!password) continue;
        instruction.value = password;
      }
      if (field.kind === "file") {
        instruction.file = await this.resumeFile();
        if (!instruction.file) continue;
      }
      byFrame.set(field.frameId, [...(byFrame.get(field.frameId) ?? []), instruction]);
    }

    // Fields in page order, for the live progress list.
    const order = [...byFrame].flatMap(([frameId, list]) => list.map((i) => `${frameId}:${i.id}`));
    const before = (await this.state(tabId)) ?? state;
    await this.session.set(formEntry(tabId, { ...before, filling: order }));
    this.onStart?.(tabId, this.progressItems({ ...before, filling: order }));

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
      if (!result) return f;
      const readBack = result.current !== undefined ? { currentValue: result.current, error: result.error || undefined } : {};
      return { ...f, ...readBack, result: result.status, resultMessage: result.message };
    });
    const summary: FillSummary = { filled: 0, skipped: 0, failed: 0 };
    for (const result of results.values()) summary[result.status] += 1;
    // Fields we couldn't even attempt (e.g. resume file unavailable).
    summary.failed += chosen.length - results.size;
    latest.lastFill = { at: Date.now(), ...summary };
    const items = this.progressItems({ ...latest, filling: order });
    latest.filling = undefined;
    await this.session.set(formEntry(tabId, latest));
    this.onDone?.(tabId, items);
    return summary;
  }
}

const squash = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** The field's error, ignoring a stale "required" message once it holds a value. */
export function activeError(field: MappedField): string {
  if (!field.error) return "";
  if (field.currentValue.trim() && /required|must have a value|can'?t be (blank|empty)|please (fill|enter)/i.test(field.error)) return "";
  return field.error;
}

/** Does the control now hold what Copilot put in (allowing for the page's own formatting)? */
export function holdsValue(field: MappedField): boolean {
  const current = field.currentValue.trim();
  const value = (field.value ?? "").trim();
  if (field.kind === "checkbox") return true;
  // A multi-entry search box (Workday skills) empties itself after each pick; the picks are chips.
  if (field.key === "skills" && field.kind === "combobox") return true;
  if (!current) return false;
  if (["file", "password", "combobox"].includes(field.kind) || !value) return true;
  const a = squash(current);
  const b = squash(value);
  if (!a || !b) return true;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  // A place chosen from the site's suggestions: "Bengaluru, Karnataka, IND" for "Bengaluru, India".
  const place = squash(value.split(",")[0] ?? "");
  if (place.length >= 3 && a.startsWith(place)) return true;
  // Dates and numbers: same digits ("07/2024" vs "2024-07", "+91 98765" vs "98765").
  const digits = (t: string) => t.replace(/\D/g, "");
  if (digits(current) && (digits(current) === digits(value) || digits(value).endsWith(digits(current)))) return true;
  // Choices: the chosen option shares a word with the intended answer ("India (+91)" vs "India").
  // Radios, selects and checkbox groups were filled with one of their own option labels, so the
  // checked option must be that label (checked above). Only dropdowns whose options load on
  // open get a looser test: most of the answer's words in what they show.
  if (field.kind === "listbox" || field.kind === "combobox") {
    const words = new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2));
    const shown = new Set(current.toLowerCase().split(/[^a-z0-9]+/));
    const shared = [...words].filter((w) => shown.has(w)).length;
    return words.size > 0 && shared / words.size >= 0.5;
  }
  return false;
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

/** Which fields' answers are worth remembering: short, typed or chosen, never secrets or files. */
function rememberable(field: FieldDescriptor): boolean {
  if (["password", "file", "contenteditable"].includes(field.kind)) return false;
  if (field.kind === "textarea" && field.currentValue.length > 300) return false;
  return field.currentValue.length <= 300;
}

/** The question a field asks, normalised so the same question matches across visits. */
function memoryKey(field: FieldDescriptor): string {
  const label = (field.label || field.placeholder || field.name).toLowerCase().replace(/[*✱]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  return label.length >= 2 ? `${field.section ? field.section.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() + "/" : ""}${label}`.slice(0, 160) : "";
}
