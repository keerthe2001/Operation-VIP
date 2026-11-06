import { Alert, Button, cn } from "@copilot/ui";
import { AlertCircle, ArrowRight, CheckCircle2, Info, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { fieldLabel } from "@/mapping/engine";
import { hasValue, keyOf } from "@/sidepanel/autofill-model";
import { send, useActivity } from "@/sidepanel/chrome-state";
import type { FormState, MappedField } from "@/shared/fields";

/** Fields the user has to fill: required ones still empty, plus any the page wouldn't take. */
export function fieldsNeedingYou(form: FormState | null): MappedField[] {
  return (form?.fields ?? []).filter((f) => !hasValue(f) && (f.required || f.result === "failed"));
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

  return (
    <section aria-labelledby="flow-heading" className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <h2 id="flow-heading" className="text-sm font-semibold">
        {needs.length ? "Needs you" : readyToSubmit ? "Ready to submit" : "Progress"}
      </h2>
      {needs.length > 0 && (
        <div className="grid gap-1.5">
          <p className="text-xs text-muted-foreground">{needs.length} field{needs.length === 1 ? "" : "s"} · click to go there</p>
          <ul className="grid gap-1">
            {needs.map((f) => (
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
                    "flex w-full items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs hover:bg-muted",
                    current === keyOf(f) && "border-primary bg-primary/5",
                  )}
                >
                  <AlertCircle className="size-3.5 shrink-0 text-warning" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{fieldLabel(f)}</span>
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {readyToSubmit && (
        <div className="grid gap-2">
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
      <h3 className="border-t pt-3 text-xs font-semibold text-muted-foreground">Activity</h3>
      {activity.length > 0 ? (
        <ol className="grid max-h-40 gap-1.5 overflow-y-auto text-xs">
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
      ) : (
        <p className="text-xs text-muted-foreground">Nothing yet.</p>
      )}

    </section>
  );
}
