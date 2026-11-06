/**
 * Every message between extension contexts is validated with these schemas.
 * Anything that doesn't parse is dropped, so a compromised page can't drive the
 * background worker with arbitrary payloads.
 */
import { z } from "zod";

import { fieldDescriptorSchema, FIELD_KINDS } from "@/shared/fields";

const portal = z.enum(["greenhouse", "lever", "workday", "ashby", "linkedin", "generic"]);

export const detectedJobSchema = z.object({
  portal,
  company: z.string().max(200).nullable(),
  title: z.string().max(300).nullable(),
  url: z.string().url().max(2048),
  isApplicationPage: z.boolean(),
  confidence: z.number().min(0).max(1),
  signals: z.array(z.string().max(80)).max(30),
  fieldCount: z.number().int().min(0).max(5000),
  description: z.string().max(20_000).nullable().optional(),
});

/** Messages sent by content scripts (sender.tab is required). */
export const contentMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("PAGE_ANALYZED"),
    job: detectedJobSchema.nullable(),
    url: z.string().max(2048),
    /** The page looks like an application confirmation ("Thank you for applying"). */
    submitted: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("FIELDS_SCANNED"),
    url: z.string().max(2048),
    fields: z.array(fieldDescriptorSchema).max(300),
    /** Text of the page's main button (Continue, Create Account…). */
    action: z.string().max(80).nullable().optional(),
    actionKind: z.enum(["continue", "account", "submit"]).nullable().optional(),
    accountExists: z.boolean().optional(),
  }),
  /** One field done while filling one by one. */
  z.object({ type: z.literal("FILL_PROGRESS"), id: z.string().max(40), status: z.enum(["filling", "filled", "skipped", "failed"]), message: z.string().max(300).optional() }),
]);

/** Requests from the floating in-page assistant (a content script); each gets a reply. */
export const widgetMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("WIDGET_STATE") }),
  z.object({ type: z.literal("WIDGET_FILL") }),
  z.object({ type: z.literal("WIDGET_FORCE") }),
  z.object({ type: z.literal("WIDGET_SAVE_JOB") }),
  /** The drawer asks which tab it is in and for a one-time code for the embedded panel. */
  z.object({ type: z.literal("WIDGET_EMBED") }),
  z.object({ type: z.literal("WIDGET_THEME"), theme: z.enum(["light", "dark"]) }),
  z.object({ type: z.literal("WIDGET_MARK_SUBMITTED") }),
  z.object({
    type: z.literal("WIDGET_PREFS"),
    prefs: z
      .object({
        side: z.enum(["left", "right"]),
        y: z.number().min(0).max(10_000),
        hideOnHost: z.string().max(253),
      })
      .partial(),
  }),
]);

/** Messages sent by the side panel (an extension page). */
export const panelMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SIGN_IN"), email: z.string().email().max(320), password: z.string().min(1).max(128) }),
  z.object({ type: z.literal("SIGN_OUT") }),
  z.object({ type: z.literal("SYNC_PROFILE"), force: z.boolean().optional() }),
  z.object({ type: z.literal("RESCAN_TAB"), tabId: z.number().int() }),
  z.object({ type: z.literal("FORCE_SCAN"), tabId: z.number().int() }),
  z.object({ type: z.literal("ENABLE_ALL_SITES") }),
  z.object({ type: z.literal("SET_THEME"), theme: z.enum(["system", "light", "dark"]) }),
  z.object({ type: z.literal("VERIFY_EMBED"), tabId: z.number().int(), nonce: z.string().max(100) }),
  z.object({ type: z.literal("COLLAPSE_EMBED"), tabId: z.number().int() }),
  z.object({ type: z.literal("SAVE_JOB"), tabId: z.number().int() }),
  /** The user clicked the panel's copy of the page's main button. */
  z.object({ type: z.literal("CLICK_ACTION"), tabId: z.number().int() }),
  /** Final OK: press Submit, then mark the application submitted. */
  z.object({ type: z.literal("SUBMIT_APPLICATION"), tabId: z.number().int() }),
  z.object({ type: z.literal("FOCUS_FIELD"), tabId: z.number().int(), key: z.string().max(60) }),
  z.object({ type: z.literal("SET_SETTINGS"), settings: z.record(z.string(), z.unknown()) }),
  z.object({ type: z.literal("DISMISS_WHATS_NEW") }),
  z.object({ type: z.literal("SET_ACCOUNT_PASSWORD"), password: z.string().max(128).nullable() }),
  z.object({
    type: z.literal("SET_WIDGET_PREFS"),
    prefs: z.object({ mode: z.enum(["job_pages", "always", "off"]), autoOpen: z.boolean(), showOnAllHosts: z.literal(true) }).partial(),
  }),
  z.object({
    type: z.literal("FILL_FIELDS"),
    tabId: z.number().int(),
    /** Field keys ("frameId:fieldId") to fill. */
    fields: z.array(z.string().max(60)).max(300),
    overwrite: z.boolean(),
  }),
  z.object({
    type: z.literal("INSERT_ANSWER"),
    tabId: z.number().int(),
    field: z.string().max(60),
    text: z.string().min(1).max(20_000),
    question: z.string().max(500),
    savedAnswerId: z.string().uuid().nullable(),
  }),
  z.object({
    type: z.literal("SET_APPLICATION_STATUS"),
    tabId: z.number().int(),
    status: z.enum(["detected", "in_progress", "ready_to_submit", "submitted", "interview", "offer", "rejected"]),
  }),
  z.object({
    type: z.literal("SAVE_ANSWER"),
    question: z.string().min(3).max(500),
    answer: z.string().min(1).max(10_000),
    category: z.string().max(50),
  }),
]);

/** Messages accepted from the web app (externally_connectable). */
export const externalMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("PING") }),
  z.object({ type: z.literal("AUTH_HANDOFF"), refreshToken: z.string().min(20).max(256) }),
]);

/** Messages the background sends to content scripts. */
const fillInstructionSchema = z.object({
  id: z.string().max(40),
  kind: z.enum(FIELD_KINDS),
  value: z.string().max(20_000).nullable(),
  optionValue: z.string().max(300).nullable(),
  checked: z.boolean().optional(),
  file: z.object({ name: z.string().max(255), type: z.string().max(127), base64: z.string().max(20_000_000) }).optional(),
  overwrite: z.boolean(),
});

export const toContentSchema = z.discriminatedUnion("type", [
  /** `force`: the user asked to fill this page, so treat any form on it as an application. */
  z.object({ type: z.literal("ANALYZE_PAGE"), force: z.boolean().optional() }),
  /** `interactive`: scroll to each field and fill it one by one, reporting progress. */
  z.object({ type: z.literal("FILL"), instructions: z.array(fillInstructionSchema).max(300), interactive: z.boolean().optional() }),
  /** Press the page's main button, only if it does one of `kinds`. */
  z.object({ type: z.literal("CLICK_ACTION"), kinds: z.array(z.enum(["continue", "account", "submit"])).max(3) }),
  /** The account exists: go to the site's Sign In form. */
  z.object({ type: z.literal("CLICK_SIGN_IN") }),
  /** Scroll to a field and put the cursor in it. */
  z.object({ type: z.literal("FOCUS_FIELD"), id: z.string().max(40) }),
]);

export type ContentMessage = z.infer<typeof contentMessageSchema>;
export type PanelMessage = z.infer<typeof panelMessageSchema>;
export type ExternalMessage = z.infer<typeof externalMessageSchema>;
export type ToContentMessage = z.infer<typeof toContentSchema>;
export type WidgetMessage = z.infer<typeof widgetMessageSchema>;

export type Reply<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; code?: string };

/** Background → drawer script in the page's top frame. */
export const toWidgetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("WIDGET_TOGGLE") }),
  z.object({ type: z.literal("WIDGET_COLLAPSE") }),
  z.object({
    type: z.literal("WIDGET_PROGRESS"),
    phase: z.enum(["start", "field", "done"]),
    view: z.enum(["popup", "modal"]),
    items: z.array(z.object({ id: z.string().max(60), label: z.string().max(200), status: z.enum(["pending", "filling", "filled", "skipped", "failed"]) })).max(300),
  }),
  z.object({ type: z.literal("WIDGET_SUBMITTED") }),
]);
