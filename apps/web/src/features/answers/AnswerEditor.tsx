import { CATEGORY_LABELS, placeholderValues, renderTemplate, type AnswerCategory } from "@copilot/shared";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  NativeSelect,
  Textarea,
} from "@copilot/ui";
import { Plus, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";

import { usePlaceholders, useSaveAnswer } from "@/features/answers/queries";
import { useProfile } from "@/features/profile/queries";
import type { SavedAnswerInput } from "@/lib/answers/answer-service";
import { ApiError } from "@/lib/api/errors";

// A sample posting so the job-description placeholders show realistic output in the preview.
const SAMPLE_JOB = {
  company: "Acme Corp",
  title: "Software Engineer",
  description: [
    "Acme Corp helps small businesses get paid faster with simple online invoicing.",
    "What you'll do",
    "• Build data pipelines and APIs that power our analytics platform",
    "• Work with Python, SQL, React, AWS and Docker",
  ].join("\n"),
};

export interface EditorState {
  id?: string;
  input: SavedAnswerInput;
}

function Preview({ template }: { template: string }) {
  const profile = useProfile();
  const descriptionId = useId();
  const [pasted, setPasted] = useState("");
  const job = pasted.trim()
    ? { company: guessCompany(pasted), title: null, description: pasted }
    : SAMPLE_JOB;
  const rendered = renderTemplate(template, placeholderValues(profile.data ?? null, job));
  return (
    <div className="grid gap-1.5">
      <p className="text-xs font-medium text-muted-foreground">
        {pasted.trim() ? "Preview for the job description you pasted" : `Preview for a sample “${SAMPLE_JOB.title}” job at “${SAMPLE_JOB.company}”`}
      </p>
      <p className="whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">{rendered.text || "…"}</p>
      {rendered.missing.length > 0 && (
        <p className="text-xs text-warning-foreground">
          Not in your profile yet: {rendered.missing.map((m) => `{${m}}`).join(", ")}. Add them to your profile, or write a
          fallback like {"{notice_period|soon}"}.
        </p>
      )}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer select-none">Try it with a real job description</summary>
        <label htmlFor={descriptionId} className="mt-2 block">
          Paste a job posting. On job sites the extension reads it for you.
        </label>
        <Textarea
          id={descriptionId}
          rows={4}
          className="mt-1"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder="About us… What you'll do…"
        />
      </details>
    </div>
  );
}

/** The company name from a pasted posting's "About <Company>" line or first sentence, if obvious. */
function guessCompany(description: string): string | null {
  const about = description.match(/^about ([A-Z][\w&.-]*(?: [A-Z][\w&.-]*){0,3})\s*$/m);
  if (about) return about[1]!;
  const first = description.match(/^([A-Z][\w&.-]*(?: [A-Z][\w&.-]*){0,3}) (?:is|helps|builds|makes|provides|powers)\b/m);
  return first?.[1] ?? null;
}

export function AnswerEditor({ state, onClose }: { state: EditorState | null; onClose: () => void }) {
  return (
    <Dialog open={!!state} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">{state && <EditorForm key={state.id ?? state.input.question_text} state={state} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function EditorForm({ state, onClose }: { state: EditorState; onClose: () => void }) {
  const ids = { category: useId(), question: useId(), template: useId() };
  const [input, setInput] = useState<SavedAnswerInput>({ ...state.input, variants: [...(state.input.variants ?? [])] });
  const templateRef = useRef<HTMLTextAreaElement>(null);
  const placeholders = usePlaceholders();
  const save = useSaveAnswer();
  const set = (patch: Partial<SavedAnswerInput>) => setInput((current) => ({ ...current, ...patch }));
  const variants = input.variants ?? [];

  function insertPlaceholder(name: string) {
    const el = templateRef.current;
    const token = `{${name}}`;
    if (!el) return set({ answer_template: `${input.answer_template}${token}` });
    const start = el.selectionStart ?? input.answer_template.length;
    const end = el.selectionEnd ?? start;
    set({ answer_template: input.answer_template.slice(0, start) + token + input.answer_template.slice(end) });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ id: state.id, input: { ...input, variants: variants.filter((v) => v.trim()) } }, { onSuccess: onClose });
      }}
    >
      <DialogHeader>
        <DialogTitle>{state.id ? "Edit answer" : "New answer"}</DialogTitle>
        <DialogDescription>
          Write it once. Placeholders are filled in for each application from your profile and the job description.
          Use {"{placeholder|fallback}"} to choose the words used when a value isn't available.
        </DialogDescription>
      </DialogHeader>
      {save.isError && (
        <Alert variant="destructive">{save.error instanceof ApiError ? save.error.message : "Couldn't save the answer."}</Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <div className="grid gap-1.5">
          <Label htmlFor={ids.category}>Type of question</Label>
          <NativeSelect id={ids.category} value={input.category} onChange={(e) => set({ category: e.target.value as AnswerCategory })}>
            {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={ids.question}>Question</Label>
          <Input id={ids.question} required minLength={3} value={input.question_text} onChange={(e) => set({ question_text: e.target.value })} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={ids.template}>Answer</Label>
        <Textarea
          id={ids.template}
          ref={templateRef}
          rows={6}
          required
          value={input.answer_template}
          onChange={(e) => set({ answer_template: e.target.value })}
        />
        <div className="flex flex-wrap gap-1.5" aria-label="Insert a placeholder">
          {Object.entries(placeholders.data ?? {}).map(([name, description]) => (
            <button
              key={name}
              type="button"
              title={description}
              onClick={() => insertPlaceholder(name)}
              className="rounded-md border bg-muted/50 px-2 py-0.5 font-mono text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {`{${name}}`}
            </button>
          ))}
        </div>
      </div>
      <Preview template={input.answer_template} />
      <div className="grid gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Variants</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => set({ variants: [...variants, ""] })} disabled={variants.length >= 10}>
            <Plus aria-hidden="true" /> Add variant
          </Button>
        </div>
        {variants.length === 0 && <p className="text-xs text-muted-foreground">Optional: a shorter or differently worded version.</p>}
        {variants.map((variant, index) => (
          <div key={index} className="flex gap-2">
            <Textarea
              aria-label={`Variant ${index + 1}`}
              rows={2}
              value={variant}
              onChange={(e) => set({ variants: variants.map((v, i) => (i === index ? e.target.value : v)) })}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove variant ${index + 1}`}
              onClick={() => set({ variants: variants.filter((_, i) => i !== index) })}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" loading={save.isPending}>
          Save answer
        </Button>
      </DialogFooter>
    </form>
  );
}
