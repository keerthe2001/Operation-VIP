import { Label, Textarea } from "@copilot/ui";
import { useId, useState } from "react";

interface LinesFieldProps {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  rows?: number;
}

/** Edits a list of strings as one item per line. */
export function LinesField({ label, value, onChange, placeholder, rows = 3 }: LinesFieldProps) {
  const id = useId();
  const [text, setText] = useState(value.join("\n"));
  const [synced, setSynced] = useState(value);

  // Re-sync when the value changes from outside (e.g. form reset), keeping the
  // user's in-progress blank lines when the content is otherwise identical.
  if (value !== synced) {
    setSynced(value);
    const normalized = text.split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
    if (normalized !== value.join("\n")) setText(value.join("\n"));
  }

  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        rows={rows}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          onChange(e.target.value.split("\n").map((l) => l.trim()).filter(Boolean));
        }}
      />
      <p className="text-xs text-muted-foreground">One item per line.</p>
    </div>
  );
}
