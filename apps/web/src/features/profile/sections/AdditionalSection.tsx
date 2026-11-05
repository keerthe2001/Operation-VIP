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
        <Field label="Nationality" {...register("additional_info.nationality")} />
        <Field label="Pronouns" {...register("additional_info.pronouns")} />
        <Field label="Gender" hint="Optional; some forms ask for it." {...register("additional_info.gender")} />
      </div>
    </SectionCard>
  );
}
