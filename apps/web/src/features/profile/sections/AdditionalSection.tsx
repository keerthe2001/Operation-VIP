import { Label, NativeSelect } from "@copilot/ui";
import { useId } from "react";
import { Controller, useFormContext } from "react-hook-form";

import { Field } from "@/components/fields/Field";
import { TagInput } from "@/components/fields/TagInput";
import { SectionCard } from "@/features/profile/SectionCard";
import type { ProfileWrite } from "@/lib/profile/profile-service";

const toBool = (v: string) => (v === "" ? null : v === "true");

function YesNo({ name, label }: { name: "additional_info.requires_sponsorship" | "additional_info.willing_to_relocate"; label: string }) {
  const { control } = useFormContext<ProfileWrite>();
  const id = useId();
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <NativeSelect id={id} value={field.value == null ? "" : String(field.value)} onChange={(e) => field.onChange(toBool(e.target.value))}>
            <option value="">Not specified</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </NativeSelect>
        )}
      />
    </div>
  );
}

type ChoiceName =
  | "additional_info.marital_status"
  | "additional_info.work_mode_preference"
  | "additional_info.veteran_status"
  | "additional_info.disability_status";

function ChoiceField({ name, label, options }: { name: ChoiceName; label: string; options: string[] }) {
  const { control } = useFormContext<ProfileWrite>();
  const id = useId();
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <NativeSelect id={id} value={field.value ?? ""} onChange={(e) => field.onChange(e.target.value || null)}>
            <option value="">Not specified</option>
            {/* Keep a custom value (e.g. typed on another device) selectable. */}
            {field.value && !options.includes(field.value) && <option value={field.value}>{field.value}</option>}
            {options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </NativeSelect>
        )}
      />
    </div>
  );
}

export function AdditionalSection() {
  const { register, control } = useFormContext<ProfileWrite>();
  return (
    <SectionCard
      id="additional"
      title="Application details"
      description="Common questions that resumes don't answer. Only shared when you choose to fill a form."
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Work authorization" placeholder="e.g. US citizen, H-1B, EU" {...register("additional_info.work_authorization")} />
        <YesNo name="additional_info.requires_sponsorship" label="Requires visa sponsorship" />
        <YesNo name="additional_info.willing_to_relocate" label="Willing to relocate" />
        <Field label="Notice period" placeholder="e.g. 30 days" {...register("additional_info.notice_period")} />
        <Field label="Current salary" {...register("additional_info.current_salary")} />
        <Field label="Expected salary" {...register("additional_info.expected_salary")} />
        <Controller
          control={control}
          name="additional_info.preferred_locations"
          render={({ field }) => (
            <TagInput className="sm:col-span-2 lg:col-span-3" label="Preferred locations" value={field.value ?? []} onChange={field.onChange} />
          )}
        />
        <Controller
          control={control}
          name="additional_info.languages"
          render={({ field }) => (
            <TagInput className="sm:col-span-2 lg:col-span-3" label="Languages spoken" value={field.value ?? []} onChange={field.onChange} />
          )}
        />
        <Field label="Date of birth" type="date" {...register("additional_info.date_of_birth")} />
        <ChoiceField name="additional_info.marital_status" label="Marital status" options={["Single", "Married", "Prefer not to say"]} />
        <Field label="Father's / guardian's name" hint="Some Indian application forms ask for it." {...register("additional_info.father_name")} />
        <Field label="Nationality" {...register("additional_info.nationality")} />
        <Field label="Pronouns" {...register("additional_info.pronouns")} />
        <Field label="Earliest start date" placeholder="e.g. Immediately, 1 Dec 2026" {...register("additional_info.earliest_start_date")} />
        <ChoiceField name="additional_info.work_mode_preference" label="Preferred work mode" options={["Remote", "Hybrid", "On-site", "Open to any"]} />
        <Field label="How you usually hear about jobs" placeholder="e.g. LinkedIn, Naukri, Referral" {...register("additional_info.referral_source")} />
      </div>
      <div className="mt-6 grid gap-1">
        <h3 className="text-sm font-medium">Voluntary self-identification</h3>
        <p className="text-xs text-muted-foreground">
          Some employers ask these optional equal-opportunity questions. Copilot never fills them without your review.
        </p>
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Gender" hint="Optional; some forms ask for it." {...register("additional_info.gender")} />
        <Field label="Race / ethnicity" placeholder="e.g. Asian, Decline to self-identify" {...register("additional_info.ethnicity")} />
        <ChoiceField
          name="additional_info.veteran_status"
          label="Veteran status"
          options={["I am not a protected veteran", "I identify as one or more of the classifications of protected veteran", "I don't wish to answer"]}
        />
        <ChoiceField
          name="additional_info.disability_status"
          label="Disability status"
          options={["No, I don't have a disability", "Yes, I have a disability (or previously had one)", "I don't wish to answer"]}
        />
      </div>
    </SectionCard>
  );
}
