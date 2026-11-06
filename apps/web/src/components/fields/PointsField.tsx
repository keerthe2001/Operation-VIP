import { Button, Label } from "@copilot/ui";
import { Plus, X } from "lucide-react";
import { useId, useLayoutEffect, useRef, type KeyboardEvent } from "react";

interface PointsFieldProps {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  addLabel?: string;
  placeholder?: string;
}

/**
 * Edits a list of bullet points, one field per point. Enter adds a point below,
 * Backspace on an empty point removes it.
 */
export function PointsField({ label, value, onChange, addLabel = "Add point", placeholder }: PointsFieldProps) {
  const id = useId();
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const pendingFocus = useRef<number | null>(null);
  // Move focus right after React renders the new list, before the next keystroke
  // arrives; otherwise fast typing lands in the previous point.
  useLayoutEffect(() => {
    if (pendingFocus.current === null) return;
    refs.current[pendingFocus.current]?.focus();
    pendingFocus.current = null;
  });
  const focus = (index: number) => {
    pendingFocus.current = index;
  };

  function update(index: number, text: string) {
    onChange(value.map((v, i) => (i === index ? text : v)));
  }

  function insertAfter(index: number) {
    const next = [...value];
    next.splice(index + 1, 0, "");
    onChange(next);
    focus(index + 1);
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index));
    focus(Math.max(0, index - 1));
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, index: number) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      insertAfter(index);
    } else if (event.key === "Backspace" && value[index] === "" && value.length > 0) {
      event.preventDefault();
      remove(index);
    }
  }

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-medium">{label}</legend>
      {value.length === 0 && <p className="text-xs text-muted-foreground">No points yet.</p>}
      <ol className="grid gap-1.5">
        {value.map((point, index) => (
          <li key={index} className="flex items-start gap-2">
            <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden="true" />
            <Label htmlFor={`${id}-${index}`} className="sr-only">
              {label} point {index + 1}
            </Label>
            <textarea
              id={`${id}-${index}`}
              ref={(el) => {
                refs.current[index] = el;
              }}
              rows={1}
              value={point}
              placeholder={placeholder}
              onChange={(e) => update(index, e.target.value.replace(/\n/g, " "))}
              onKeyDown={(e) => onKeyDown(e, index)}
              className="field-sizing-content min-h-9 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mt-0.5 size-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => remove(index)}
              aria-label={`Delete ${label.toLowerCase()} point ${index + 1}`}
            >
              <X aria-hidden="true" />
            </Button>
          </li>
        ))}
      </ol>
      <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => insertAfter(value.length - 1)}>
        <Plus aria-hidden="true" /> {addLabel}
      </Button>
    </fieldset>
  );
}
