import { Alert, Button, cn } from "@copilot/ui";
import { AlertCircle, ArrowRight, CheckCircle2, ChevronDown, Info, Send } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { activeError } from "@/background/autofill";
import { fieldLabel } from "@/mapping/engine";
import { hasValue, keyOf } from "@/sidepanel/autofill-model";
import { send, useActivity } from "@/sidepanel/chrome-state";
import type { FormState, MappedField } from "@/shared/fields";

/** Fields the user has to fill: required ones still empty, plus any the page wouldn't take. */
export function fieldsNeedingYou(form: FormState | null): MappedField[] {
  return (form?.fields ?? []).filter((f) => (!hasValue(f) && (f.required || f.result === "failed")) || !!activeError(f));
}

/**
 * The panel's log of what Copilot did, the fields that need you (click one to jump to it;
 * when it's filled the next one is shown), and the final "Submit?" confirmation.
 */
export function GuidedFlow({ tabId, form }: { tabId: number; form: FormState | null }) {
  const activity = useActivity(tabId);
  const needs = fieldsNeedingYou(form);
  const [chosen, setChosen] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const focused = useRef<string | null>(null);

  // Once the user starts with a field, the "current" one moves on to the next field that
  // still needs them as soon as it's filled.
  const keys = needs.map(keyOf);
  const current = chosen ? (keys.includes(chosen) ? chosen : (keys[0] ?? null)) : null;
  useEffect(() => {
    if (current && current !== focused.current) {
      focused.current = current;
      void send({ type: "FOCUS_FIELD", tabId, key: current });
    }
  }, [current, tabId]);

  const focus = (field: MappedField) => {
    focused.current = null; // a second click on the same field jumps there again
    setChosen(keyOf(field));
    if (chosen === keyOf(field)) void send({ type: "FOCUS_FIELD", tabId, key: keyOf(field) });
  };

  const readyToSubmit = !!form && needs.length === 0 && form.actionKind === "submit" && !!form.action;

  const lastActivity = activity.at(-1);
  if (!needs.length && !readyToSubmit && !activity.length) return null;

  return (
    <section aria-label="Guided apply" className="grid gap-2">
      {readyToSubmit && (
        <div className="grid gap-2 rounded-xl border border-primary/40 bg-primary/5 p-4">
          <p className="text-sm font-semibold">Everything is filled. Submit the application?</p>
          <Button
            loading={submitting}
            onClick={async () => {
              setSubmitting(true);
              setError(null);
              const reply = await send({ type: "SUBMIT_APPLICATION", tabId });
              setSubmitting(false);
              if (!reply.ok) setError(reply.error);
            }}
          >
            <Send aria-hidden="true" /> {form?.action ?? "Submit"}
          </Button>
          {error && <Alert variant="destructive">{error}</Alert>}
        </div>
      )}

      {needs.length > 0 && (
        <Collapsible
          title="Needs you"
          count={needs.length}
          tone="warning"
          hint={`${needs.length} field${needs.length === 1 ? "" : "s"} · click to go there`}
        >
          <ul className="grid gap-1">
            {needs.map((f) => {
              const problem = activeError(f);
              return (
                <li key={keyOf(f)}>
                  <button
                    type="button"
                    // On press, so the page keeps focus (the panel would otherwise take it on click).
                    onMouseDown={(e) => {
                      e.preventDefault();
                      focus(f);
                    }}
                    onClick={(e) => {
                      if (e.detail === 0) focus(f); // keyboard
                    }}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs hover:bg-muted",
                      current === keyOf(f) && "border-primary bg-primary/5",
                    )}
                  >
                    <AlertCircle className="mt-px size-3.5 shrink-0 text-warning" aria-hidden="true" />
                    <span className="grid min-w-0 flex-1">
                      <span className="truncate">{fieldLabel(f)}</span>
                      {problem && <span className="truncate text-destructive">{problem}</span>}
                    </span>
                    <ArrowRight className="mt-px size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Collapsible>
      )}

      {activity.length > 0 && (
        <Collapsible title="Activity" count={activity.length} summary={lastActivity?.text}>
          <ol className="grid gap-1.5 text-xs">
            {activity.slice(-12).map((entry) => (
              <li key={entry.at} className="flex items-start gap-2">
                {entry.kind === "done" ? (
                  <CheckCircle2 className="mt-px size-3.5 shrink-0 text-success" aria-hidden="true" />
                ) : entry.kind === "need" ? (
                  <AlertCircle className="mt-px size-3.5 shrink-0 text-warning" aria-hidden="true" />
                ) : (
                  <Info className="mt-px size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <span>{entry.text}</span>
              </li>
            ))}
          </ol>
        </Collapsible>
      )}
    </section>
  );
}

/** A one-line row that opens only when the user wants the details. */
function Collapsible({
  title,
  count,
  summary,
  hint,
  tone,
  children,
}: {
  title: string;
  count: number;
  summary?: string;
  hint?: string;
  tone?: "warning";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="rounded-xl border bg-card shadow-sm">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
      >
        <span className="font-semibold">{title}</span>
        <span
          className={cn(
            "rounded-full px-1.5 text-xs font-medium",
            tone === "warning" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground",
          )}
        >
          {count}
        </span>
        {!open && summary && <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{summary}</span>}
        <ChevronDown className={cn("ml-auto size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden="true" />
      </button>
      {open && (
        <div id={id} className="grid gap-1.5 border-t px-3 py-2">
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          {children}
        </div>
      )}
    </div>
  );
}
