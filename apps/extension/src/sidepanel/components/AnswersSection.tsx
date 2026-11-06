import { classifyIntent, matchAnswers, placeholderValues, renderTemplate, type SavedAnswer } from "@copilot/shared";
import { Alert, Badge, Button, Textarea } from "@copilot/ui";
import { BookmarkPlus, Check, ClipboardCopy, MessageSquareText, RefreshCw, TextCursorInput } from "lucide-react";
import { useId, useMemo, useState } from "react";

import { fieldLabel } from "@/mapping/engine";
import { keyOf } from "@/sidepanel/autofill-model";
import { send } from "@/sidepanel/chrome-state";
import { WEB_URL } from "@/shared/config";
import type { MappedField } from "@/shared/fields";
import type { DetectedJob, ExtensionProfile } from "@/shared/types";

interface Candidate {
  answerId: string;
  template: string;
}

function candidatesFor(question: string, answers: SavedAnswer[]): Candidate[] {
  return matchAnswers(question, answers).flatMap(({ answer }) =>
    [answer.answer_template, ...(answer.variants ?? [])].map((template) => ({ answerId: answer.id, template })),
  );
}

function QuestionCard({ field, tabId, job, data }: { field: MappedField; tabId: number; job: DetectedJob; data: ExtensionProfile }) {
  const textareaId = useId();
  const question = fieldLabel(field);
  const candidates = useMemo(() => candidatesFor(question, data.answers), [question, data.answers]);
  const values = useMemo(() => placeholderValues(data.profile, { company: job.company, title: job.title, description: job.description }), [data.profile, job]);
  const [index, setIndex] = useState(0);
  const [edited, setEdited] = useState<string | null>(null);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const candidate = candidates[index] ?? null;
  const rendered = candidate ? renderTemplate(candidate.template, values) : null;
  const text = edited ?? rendered?.text ?? "";
  // A literal {placeholder} would look broken in an application, so it blocks inserting;
  // [brackets] might be intentional, so they only get a hint.
  const unresolved = [...text.matchAll(/\{(\w+)(?:\|[^{}]*)?\}/g)].map((m) => m[1]!);
  const prompts = [...text.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]!);

  async function insert() {
    setBusy(true);
    const reply = await send({
      type: "INSERT_ANSWER",
      tabId,
      field: keyOf(field),
      text,
      question,
      savedAnswerId: candidate?.answerId ?? null,
    });
    setBusy(false);
    setStatus(reply.ok ? { kind: "ok", text: "Inserted into the form." } : { kind: "error", text: reply.error });
  }

  async function save() {
    setBusy(true);
    const reply = await send({ type: "SAVE_ANSWER", question, answer: text, category: classifyIntent(question) ?? "other" });
    setBusy(false);
    setStatus(reply.ok ? { kind: "ok", text: "Saved to your answer library." } : { kind: "error", text: reply.error });
  }

  return (
    <li className="grid gap-2 border-t pt-3 first:border-t-0 first:pt-0">
      <label htmlFor={textareaId} className="text-sm font-medium leading-snug">
        {question}
        {field.required && <span className="text-destructive"> *</span>}
      </label>
      {candidate ? (
        <p className="text-xs text-muted-foreground">
          From your library{candidates.length > 1 ? ` · ${index + 1} of ${candidates.length}` : ""}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">No saved answer matches. Write one and save it for next time.</p>
      )}
      <Textarea
        id={textareaId}
        rows={5}
        value={text}
        placeholder="Write your answer…"
        onChange={(e) => {
          setEdited(e.target.value);
          setStatus(null);
        }}
      />
      {unresolved.length > 0 && (
        <p className="text-xs text-warning-foreground">
          Not in your profile yet, replace before inserting: {unresolved.map((u) => `“${u.replace(/_/g, " ")}”`).join(", ")}
        </p>
      )}
      {unresolved.length === 0 && prompts.length > 0 && (
        <p className="text-xs text-muted-foreground">Check the [bracketed] parts before inserting.</p>
      )}
      {field.maxLength && text.length > field.maxLength && (
        <p className="text-xs text-destructive">This field allows {field.maxLength} characters; the answer has {text.length}.</p>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" onClick={insert} disabled={!text.trim() || unresolved.length > 0} loading={busy}>
          <TextCursorInput aria-hidden="true" /> Insert
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!text.trim()}
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setStatus({ kind: "ok", text: "Copied to clipboard." });
          }}
        >
          <ClipboardCopy aria-hidden="true" /> Copy
        </Button>
        {candidates.length > 1 && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setIndex((index + 1) % candidates.length);
              setEdited(null);
              setStatus(null);
            }}
          >
            <RefreshCw aria-hidden="true" /> Next variant
          </Button>
        )}
        {(!candidate || edited !== null) && text.trim().length > 0 && unresolved.length === 0 && (
          <Button size="sm" variant="ghost" onClick={save} disabled={busy}>
            <BookmarkPlus aria-hidden="true" /> Save to library
          </Button>
        )}
      </div>
      {status && (
        <p className={status.kind === "ok" ? "flex items-center gap-1 text-xs text-success" : "text-xs text-destructive"} role="status">
          {status.kind === "ok" && <Check className="size-3.5" aria-hidden="true" />}
          {status.text}
        </p>
      )}
    </li>
  );
}

export function AnswersSection({ questions, tabId, job, data }: {
  questions: MappedField[];
  tabId: number;
  job: DetectedJob;
  data: ExtensionProfile | null;
}) {
  if (questions.length === 0 || !data) return null;
  return (
    <section aria-labelledby="answers-heading" className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 id="answers-heading" className="flex items-center gap-1.5 text-sm font-semibold">
          <MessageSquareText className="size-4 text-primary" aria-hidden="true" /> Answer suggestions
        </h2>
        <Badge variant="secondary">{questions.length}</Badge>
      </div>
      {data.answers.length === 0 && (
        <Alert className="text-xs">
          Your answer library is empty.{" "}
          <a className="font-medium text-primary hover:underline" href={`${WEB_URL}/answers`} target="_blank" rel="noreferrer">
            Add answers from templates
          </a>{" "}
          to get suggestions here.
        </Alert>
      )}
      <ul className="grid gap-3">
        {questions.map((field) => (
          <QuestionCard key={keyOf(field)} field={field} tabId={tabId} job={job} data={data} />
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Suggestions come only from answers you wrote. Check each one before inserting.
      </p>
    </section>
  );
}
