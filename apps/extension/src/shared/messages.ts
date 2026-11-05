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
  z.object({ type: z.literal("PAGE_ANALYZED"), job: detectedJobSchema.nullable(), url: z.string().max(2048) }),
  z.object({ type: z.literal("FIELDS_SCANNED"), url: z.string().max(2048), fields: z.array(fieldDescriptorSchema).max(300) }),
]);

/** Messages sent by the side panel (an extension page). */
export const panelMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SIGN_IN"), email: z.string().email().max(320), password: z.string().min(1).max(128) }),
  z.object({ type: z.literal("SIGN_OUT") }),
  z.object({ type: z.literal("SYNC_PROFILE"), force: z.boolean().optional() }),
  z.object({ type: z.literal("RESCAN_TAB"), tabId: z.number().int() }),
  z.object({ type: z.literal("ENABLE_ALL_SITES") }),
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
  z.object({ type: z.literal("ANALYZE_PAGE") }),
  z.object({ type: z.literal("FILL"), instructions: z.array(fillInstructionSchema).max(300) }),
]);

export type ContentMessage = z.infer<typeof contentMessageSchema>;
export type PanelMessage = z.infer<typeof panelMessageSchema>;
export type ExternalMessage = z.infer<typeof externalMessageSchema>;
export type ToContentMessage = z.infer<typeof toContentSchema>;

export type Reply<T = undefined> = { ok: true; data?: T } | { ok: false; error: string; code?: string };
