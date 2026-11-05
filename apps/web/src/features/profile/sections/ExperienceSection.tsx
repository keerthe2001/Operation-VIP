import { Label } from "@copilot/ui";
import { Controller, useFormContext, useWatch } from "react-hook-form";

import { Field } from "@/components/fields/Field";
import { LinesField } from "@/components/fields/LinesField";
import { TagInput } from "@/components/fields/TagInput";
import { ListSection } from "@/features/profile/sections/ListSection";
import type { ProfileWrite } from "@/lib/profile/profile-service";

const PARTIAL_DATE = { value: /^\d{4}(-(0[1-9]|1[0-2]))?$/, message: "Use YYYY or YYYY-MM" };

function formatRange(start?: string | null, end?: string | null, current?: boolean) {
  if (!start && !end && !current) return undefined;
  return `${start ?? "?"} – ${current ? "Present" : (end ?? "?")}`;
}

export function ExperienceSection() {
  const { register, control, formState } = useFormContext<ProfileWrite>();
  const items = useWatch({ control, name: "experience" }) ?? [];
  return (
    <ListSection
      section="experience"
      title="Work experience"
      addLabel="Add role"
      summarize={(i) => {
        const e = items[i];
        return {
          title: [e?.designation, e?.company_name].filter(Boolean).join(" · "),
          subtitle: formatRange(e?.start_date, e?.end_date, e?.is_current),
        };
      }}
      renderItem={(i) => {
        const errors = formState.errors.experience?.[i];
        const current = items[i]?.is_current;
        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Job title" {...register(`experience.${i}.designation`)} />
            <Field label="Company" {...register(`experience.${i}.company_name`)} />
            <Field label="Location" {...register(`experience.${i}.location`)} />
            <Field label="Employment type" placeholder="Full-time, Contract…" {...register(`experience.${i}.employment_type`)} />
            <Field
              label="Start"
              placeholder="YYYY-MM"
              error={errors?.start_date?.message}
              {...register(`experience.${i}.start_date`, { pattern: PARTIAL_DATE, setValueAs: (v) => v || null })}
            />
            <Field
              label="End"
              placeholder={current ? "Present" : "YYYY-MM"}
              disabled={current}
              error={errors?.end_date?.message}
              {...register(`experience.${i}.end_date`, { pattern: PARTIAL_DATE, setValueAs: (v) => v || null })}
            />
            <div className="flex items-center gap-2 sm:col-span-2">
              <input
                id={`exp-current-${i}`}
                type="checkbox"
                className="size-4 accent-primary"
                {...register(`experience.${i}.is_current`)}
              />
              <Label htmlFor={`exp-current-${i}`}>I currently work here</Label>
            </div>
            <div className="sm:col-span-2">
              <Controller
                control={control}
                name={`experience.${i}.responsibilities`}
                render={({ field }) => (
                  <LinesField label="Responsibilities" rows={4} value={field.value ?? []} onChange={field.onChange} />
                )}
              />
            </div>
            <div className="sm:col-span-2">
              <Controller
                control={control}
                name={`experience.${i}.achievements`}
                render={({ field }) => (
                  <LinesField label="Achievements" value={field.value ?? []} onChange={field.onChange} />
                )}
              />
            </div>
            <Controller
              control={control}
              name={`experience.${i}.technologies`}
              render={({ field }) => (
                <TagInput
                  className="sm:col-span-2"
                  label="Technologies"
                  value={field.value ?? []}
                  onChange={field.onChange}
                  placeholder="Type and press Enter"
                />
              )}
            />
          </div>
        );
      }}
    />
  );
}
