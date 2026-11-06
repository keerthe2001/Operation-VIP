import { Button, Input, NativeSelect, cn } from "@copilot/ui";
import { useId, useState, type ReactNode } from "react";

import { send, useLocal, useSettings, useWidgetPrefs } from "@/sidepanel/chrome-state";
import { FIELD_GROUPS, type AutofillSettings as Settings } from "@/shared/settings";

const save = (settings: Partial<Settings>) => send({ type: "SET_SETTINGS", settings });

function Setting({ label, note, children }: { label: string; note: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children(id)}
      <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function Choice<T extends string>({ id, value, options, onChange }: { id: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </NativeSelect>
  );
}

const onOff = (value: boolean): "on" | "off" => (value ? "on" : "off");

/** Simplify-style autofill behaviour settings. */
export function AutofillSettings() {
  const settings = useSettings();
  const widget = useWidgetPrefs();
  const [email, setEmail] = useState<string | null>(null);
  return (
    <section className="grid gap-5">
      <h2 className="text-sm font-semibold">Autofill</h2>

      <Setting
        label="Apply mode"
        note={
          settings.applyMode === "auto"
            ? "Copilot fills each page as it opens, creates your job-site account (or signs in if you already have one) and continues to the next page. It stops for anything that needs you and asks before the final Submit."
            : "Copilot fills when you click Autofill. You press the page's Continue, Create Account and Submit buttons yourself."
        }
      >
        {(id) => (
          <Choice id={id} value={settings.applyMode} options={[["auto", "Auto"], ["manual", "Manual"]]} onChange={(v) => save({ applyMode: v })} />
        )}
      </Setting>

      <Setting
        label="Use a separate email for applications"
        note={settings.applicationEmail ? `Forms get ${settings.applicationEmail}.` : "Autofill uses the email on your profile."}
      >
        {(id) => (
          <div className="flex gap-2">
            <Input
              id={id}
              type="email"
              placeholder="Profile email"
              value={email ?? settings.applicationEmail ?? ""}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={email === null}
              onClick={async () => {
                await save({ applicationEmail: email?.trim() || null });
                setEmail(null);
              }}
            >
              Save
            </Button>
          </div>
        )}
      </Setting>

      <Setting
        label="Answer questions not in my profile"
        note="Required consent boxes are ticked, self-identification questions use your profile or the form's own “prefer not to say”, marketing opt-ins are answered no, and “worked here before?” comes from your work history."
      >
        {(id) => <Choice id={id} value={onOff(settings.bestGuessAnswers)} options={[["on", "On"], ["off", "Off"]]} onChange={(v) => save({ bestGuessAnswers: v === "on" })} />}
      </Setting>

      <Setting label="Match score on job pages" note="Your keyword match score with the job description, on the edge tab and job card.">
        {(id) => <Choice id={id} value={settings.showMatch ? "shown" : "hidden"} options={[["shown", "Shown"], ["hidden", "Hidden"]]} onChange={(v) => save({ showMatch: v === "shown" })} />}
      </Setting>

      <Setting
        label="Open the panel on job pages"
        note={widget.autoOpen ? "Copilot opens by itself when it finds an application form." : "Copilot stays minimized as the edge tab. Click it whenever you want to autofill."}
      >
        {(id) => (
          <Choice
            id={id}
            value={widget.autoOpen ? "open" : "minimized"}
            options={[["open", "Open automatically"], ["minimized", "Stay minimized"]]}
            onChange={(v) => send({ type: "SET_WIDGET_PREFS", prefs: { autoOpen: v === "open" } })}
          />
        )}
      </Setting>

      <Setting
        label="Applications you submit without autofill"
        note={settings.trackWithoutAutofill ? "Applications you fill yourself are still added to your tracker." : "Only applications you autofill are tracked."}
      >
        {(id) => (
          <Choice id={id} value={settings.trackWithoutAutofill ? "track" : "skip"} options={[["track", "Track them"], ["skip", "Don't track them"]]} onChange={(v) => save({ trackWithoutAutofill: v === "track" })} />
        )}
      </Setting>

      <Setting
        label="Name of the resume file you upload"
        note={settings.resumeFileName === "my_name" ? "Resumes are uploaded as your name followed by “Resume”." : "Resumes are uploaded with the file name you gave them."}
      >
        {(id) => (
          <Choice
            id={id}
            value={settings.resumeFileName}
            options={[["my_name", "Use my name"], ["original", "Use the resume's file name"]]}
            onChange={(v) => save({ resumeFileName: v })}
          />
        )}
      </Setting>

      <Setting
        label="Fill progress view"
        note={settings.fillProgress === "modal" ? "Progress is shown over a blurred page." : settings.fillProgress === "popup" ? "Progress is shown in a popup at the top right of the page." : "No progress on the page; see it here in the panel."}
      >
        {(id) => (
          <Choice
            id={id}
            value={settings.fillProgress}
            options={[["off", "In the panel"], ["popup", "Popup on the page (top right)"], ["modal", "Modal (blurred overlay)"]]}
            onChange={(v) => save({ fillProgress: v })}
          />
        )}
      </Setting>

      <Setting
        label="Submission view"
        note={settings.submissionPrompt ? "When a confirmation page appears, Copilot asks whether to mark the application submitted." : "Mark applications submitted yourself from the panel."}
      >
        {(id) => (
          <Choice id={id} value={settings.submissionPrompt ? "modal" : "off"} options={[["modal", "Modal"], ["off", "Off"]]} onChange={(v) => save({ submissionPrompt: v === "modal" })} />
        )}
      </Setting>

      <Setting label="The “What's new” notification" note="A short note in the panel after Copilot updates.">
        {(id) => (
          <Choice
            id={id}
            value={settings.whatsNew ? "shown" : "hidden"}
            options={[["shown", "Shown for every update"], ["hidden", "Hidden"]]}
            onChange={(v) => save({ whatsNew: v === "shown" })}
          />
        )}
      </Setting>

      <MemorySetting />

      <FieldToggles disabled={settings.disabledFields} />
    </section>
  );
}

function Switch({ checked, label, onChange, strong }: { checked: boolean; label: string; onChange: (v: boolean) => void; strong?: boolean }) {
  return (
    <label className={cn("flex cursor-pointer items-center justify-between gap-3 py-1 text-sm", strong ? "font-medium" : "pl-3 text-muted-foreground")}>
      {label}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-primary" : "bg-muted-foreground/30")}
      >
        <span className={cn("absolute top-0.5 size-4 rounded-full bg-background shadow transition-[left]", checked ? "left-[18px]" : "left-0.5")} />
      </button>
    </label>
  );
}

/** "Fields to autofill": switch off any field or whole group. */
function FieldToggles({ disabled }: { disabled: string[] }) {
  const off = new Set(disabled);
  const update = (keys: string[], enabled: boolean) => {
    const next = new Set(off);
    for (const key of keys) {
      if (enabled) next.delete(key);
      else next.add(key);
    }
    void save({ disabledFields: [...next] });
  };
  return (
    <div className="grid gap-3">
      <div>
        <h3 className="text-sm font-medium">Fields to autofill</h3>
        <p className="text-xs text-muted-foreground">Switch off any field you don't want filled.</p>
      </div>
      {FIELD_GROUPS.map((group) => {
        const keys = group.fields.map(([key]) => key);
        const groupOn = keys.some((k) => !off.has(k));
        return (
          <div key={group.title} className="grid">
            <Switch strong label={group.title} checked={groupOn} onChange={(v) => update(keys, v)} />
            {group.fields.map(([key, label]) => (
              <Switch key={key} label={label} checked={!off.has(key)} onChange={(v) => update([key], v)} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Answers Copilot learned from the user's own corrections (kept on this device). */
function MemorySetting() {
  const memory = useLocal("memory");
  const count = Object.keys(memory ?? {}).filter((k) => !k.startsWith("*|")).length;
  return (
    <div className="grid gap-1.5">
      <p className="text-sm font-medium">Remembered answers</p>
      <div className="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        <span>
          {count
            ? `${count} answer${count === 1 ? "" : "s"} you gave or corrected. Copilot reuses them next time.`
            : "When you correct a field or fill one Copilot missed, it remembers your answer."}
        </span>
        {count > 0 && (
          <Button size="sm" variant="outline" onClick={() => send({ type: "CLEAR_MEMORY" })}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
