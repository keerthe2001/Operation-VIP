import { Alert, Badge, Button, cn } from "@copilot/ui";
import { AlertTriangle, Check, CheckCircle2, ChevronDown, ChevronRight, Copy, Sparkles, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";

import { fieldLabel } from "@/mapping/engine";
import { send } from "@/sidepanel/chrome-state";
import { hasValue, keyOf, summarize } from "@/sidepanel/autofill-model";
import { WEB_URL } from "@/shared/config";
import type { FormState, MappedField } from "@/shared/fields";

interface Props {
  tabId: number;
  form: FormState | null;
}

const RESULT_BADGE = {
  filled: { variant: "success", text: "Filled" },
  skipped: { variant: "secondary", text: "Already filled" },
  failed: { variant: "destructive", text: "Failed" },
} as const;

function FieldRow({ field, checked, onToggle }: { field: MappedField; checked?: boolean; onToggle?: () => void }) {
  const id = `field-${keyOf(field)}`;
  const result = field.result ? RESULT_BADGE[field.result] : null;
  return (
    <li className="flex items-start gap-2 py-2">
      {onToggle && (
        <input id={id} type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={checked} onChange={onToggle} />
      )}
      <label htmlFor={onToggle ? id : undefined} className="min-w-0 flex-1">
        <span className="block truncate text-sm">
          {fieldLabel(field)}
          {field.required && <span className="text-destructive"> *</span>}
        </span>
        {field.value && (
          <span className="block truncate text-xs text-muted-foreground" title={field.value}>
            {field.kind === "file" ? `📎 ${field.value}` : field.value}
          </span>
        )}
        {field.resultMessage && field.result === "failed" && (
          <span className="block text-xs text-destructive">{field.resultMessage}</span>
        )}
      </label>
      {result ? (
        <Badge variant={result.variant}>{result.text}</Badge>
      ) : field.status === "review" ? (
        <Badge variant="warning" title={`Match confidence ${Math.round(field.confidence * 100)}%`}>
          Check
        </Badge>
      ) : null}
    </li>
  );
}

function Group({ title, hint, children, defaultOpen = true, count }: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  count: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (count === 0) return null;
  return (
    <div className="border-t pt-2">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} aria-hidden="true" />
        {title} <span className="tabular-nums">({count})</span>
      </button>
      {open && (
        <>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
          <ul className="divide-y">{children}</ul>
        </>
      )}
    </div>
  );
}

export function AutofillSection({ tabId, form }: Props) {
  const summary = useMemo(() => summarize(form), [form]);
  const [reviewing, setReviewing] = useState(false);
  const [overwrite, setOverwrite] = useState(false);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pendingReady = summary.ready.filter((f) => overwrite || !hasValue(f));
  // Only fields that would actually change (filled ones are skipped unless overwriting).
  const selected = [
    ...summary.ready.filter((f) => !excluded.has(keyOf(f))),
    ...summary.review.filter((f) => approved.has(keyOf(f))),
  ].filter((f) => overwrite || !hasValue(f));

  const toggle = (set: Set<string>, update: (next: Set<string>) => void, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    update(next);
  };

  async function fill(fields: MappedField[]) {
    setBusy(true);
    setError(null);
    const reply = await send({ type: "FILL_FIELDS", tabId, fields: fields.map(keyOf), overwrite });
    setBusy(false);
    if (!reply.ok) setError(reply.error);
    else setReviewing(false);
  }

  // A last "Review → Submit" page has no fields: the Submit step above is all there is.
  if (form && summary.detected === 0 && form.action) return null;
  if (!form || summary.detected === 0) {
    return (
      <section className="rounded-xl border bg-card p-4 text-sm text-muted-foreground shadow-sm">
        No fillable fields found yet. If the form is on another step, open it; if this site can't be filled, copy your
        details from the Profile tab.
      </section>
    );
  }

  const last = form.lastFill;
  const required = form.fields.filter((f) => f.required);
  const requiredDone = required.filter(hasValue).length;
  // Fields the page wouldn't take: offer their values to copy. If nothing could be filled,
  // offer every value Copilot has for this form.
  const notFillable = !!last && last.filled === 0 && last.failed > 0;
  const copyable = form.fields.filter((f) => f.value && f.key !== "account_password" && (notFillable ? !hasValue(f) : f.result === "failed"));
  return (
    <section aria-labelledby="autofill-heading" className="grid gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 id="autofill-heading" className="flex items-center gap-1.5 text-sm font-semibold">
          <Sparkles className="size-4 text-primary" aria-hidden="true" /> Smart autofill
        </h2>
      </div>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          ["Detected", summary.detected],
          ["Ready", summary.ready.length + summary.review.length],
          ["Need you", summary.attention],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-muted/60 py-2">
            <dt className="text-[11px] text-muted-foreground">{label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      {required.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Required <span className="font-semibold text-foreground">{requiredDone} of {required.length}</span> filled
        </p>
      )}

      {form.filling && <FillChecklist form={form} />}

      {last && !form.filling && (
        <Alert className="flex items-start gap-2 text-xs">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          <span>
            Filled {last.filled} field{last.filled === 1 ? "" : "s"}
            {last.skipped ? `, skipped ${last.skipped} already filled` : ""}
            {last.failed ? `, ${last.failed} couldn't be filled` : ""}.
          </span>
        </Alert>
      )}
      {error && <Alert variant="destructive">{error}</Alert>}
      {notFillable && (
        <Alert variant="destructive" className="text-xs">
          This page can't be filled automatically. Copy the values below into the form.
        </Alert>
      )}
      {copyable.length > 0 && <CopyList fields={copyable} />}

      {!reviewing ? (
        <div className="grid gap-2">
          <Button onClick={() => fill(pendingReady)} disabled={pendingReady.length === 0} loading={busy}>
            <Wand2 aria-hidden="true" />
            {pendingReady.length ? `Autofill ${pendingReady.length} field${pendingReady.length === 1 ? "" : "s"}` : "Everything ready is filled"}
          </Button>
          <Button variant="outline" onClick={() => setReviewing(true)}>
            Review &amp; fill
          </Button>
        </div>
      ) : (
        <div className="grid gap-2">
          <Group title="Ready to fill" count={summary.ready.length}>
            {summary.ready.map((f) => (
              <FieldRow key={keyOf(f)} field={f} checked={!excluded.has(keyOf(f))} onToggle={() => toggle(excluded, setExcluded, keyOf(f))} />
            ))}
          </Group>
          <Group title="Check before filling" hint="Probable matches. Tick the ones that look right." count={summary.review.length}>
            {summary.review.map((f) => (
              <FieldRow key={keyOf(f)} field={f} checked={approved.has(keyOf(f))} onToggle={() => toggle(approved, setApproved, keyOf(f))} />
            ))}
          </Group>
          <Group title="Missing from your profile" count={summary.missing.length}>
            {summary.missing.map((f) => <FieldRow key={keyOf(f)} field={f} />)}
            <li className="py-2 text-xs">
              <a className="font-medium text-primary hover:underline" href={`${WEB_URL}/profile`} target="_blank" rel="noreferrer">
                Add these to your profile
              </a>
            </li>
          </Group>
          <Group title="Questions to answer" hint="Free-text questions are answered by you." count={summary.questions.length}>
            {summary.questions.map((f) => <FieldRow key={keyOf(f)} field={f} />)}
          </Group>
          <Group title="Not recognized" count={summary.unmapped.length} defaultOpen={false}>
            {summary.unmapped.map((f) => <FieldRow key={keyOf(f)} field={f} />)}
          </Group>
          <label className="flex items-center gap-2 border-t pt-3 text-xs">
            <input type="checkbox" className="size-4 accent-primary" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            Replace values already on the page
          </label>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setReviewing(false)}>
              Cancel
            </Button>
            <Button className="flex-1" onClick={() => fill(selected)} disabled={selected.length === 0} loading={busy}>
              Fill selected ({selected.length})
            </Button>
          </div>
        </div>
      )}
      {summary.attention > 0 && !reviewing && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning-foreground" aria-hidden="true" />
          {summary.attention} field{summary.attention === 1 ? " needs" : "s need"} your input. Open “Review &amp; fill” to see
          which.
        </p>
      )}
    </section>
  );
}

const STATUS_ICON: Record<string, string> = { pending: "○", filling: "◌", filled: "✓", skipped: "–", failed: "!" };

/** Live list while Copilot fills the form one field at a time. */
function FillChecklist({ form }: { form: FormState }) {
  const byKey = new Map(form.fields.map((f) => [keyOf(f), f]));
  const items = (form.filling ?? []).flatMap((key) => (byKey.has(key) ? [byKey.get(key)!] : []));
  const done = items.filter((f) => f.result).length;
  return (
    <div className="grid gap-1.5 rounded-lg border p-3" role="status" aria-live="polite">
      <p className="text-sm font-semibold">
        Filling {Math.min(done + 1, items.length)} of {items.length}…
      </p>
      <ul className="grid gap-1 text-xs">
        {items.map((f) => (
          <li key={keyOf(f)} className={cn("flex items-center gap-2", f.result === "filled" ? "text-foreground" : "text-muted-foreground")}>
            <span
              className={cn(
                "grid size-4 place-items-center rounded-full border text-[10px]",
                f.result === "filled" && "border-primary bg-primary text-primary-foreground",
                f.result === "failed" && "border-warning text-warning-foreground",
              )}
              aria-hidden="true"
            >
              {STATUS_ICON[f.result ?? "pending"]}
            </span>
            <span className="truncate">{fieldLabel(f)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Values to paste by hand where filling didn't work. */
function CopyList({ fields }: { fields: MappedField[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className="grid gap-1 rounded-lg border p-3">
      <p className="text-xs font-semibold">Copy & paste</p>
      <ul className="grid">
        {fields.map((f) => (
          <li key={keyOf(f)}>
            <button
              type="button"
              aria-label={`Copy ${fieldLabel(f)}`}
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-left hover:bg-muted"
              onClick={async () => {
                await navigator.clipboard.writeText(f.value ?? "").catch(() => undefined);
                setCopied(keyOf(f));
                setTimeout(() => setCopied((c) => (c === keyOf(f) ? null : c)), 1500);
              }}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-medium">{fieldLabel(f)}</span>
                <span className="block truncate text-xs text-muted-foreground">{f.value}</span>
              </span>
              {copied === keyOf(f) ? <Check className="size-3.5 text-success" aria-hidden="true" /> : <Copy className="size-3.5 text-muted-foreground" aria-hidden="true" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The page's own main button (Continue, Create Account…), pressed on the user's click. */
export function PageAction({ tabId, label }: { tabId: number; label: string }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="grid gap-1">
      <Button
        className="w-full"
        onClick={async () => {
          setError(null);
          const reply = await send({ type: "CLICK_ACTION", tabId });
          if (!reply.ok) setError(reply.error);
        }}
      >
        {label} <ChevronRight aria-hidden="true" />
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
