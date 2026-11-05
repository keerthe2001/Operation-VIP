import { useFormContext, useWatch } from "react-hook-form";

import { Field } from "@/components/fields/Field";
import { ListSection } from "@/features/profile/sections/ListSection";
import type { ProfileWrite } from "@/lib/profile/profile-service";

const YEAR = { valueAsNumber: true, min: { value: 1900, message: "Invalid year" }, max: { value: 2100, message: "Invalid year" } } as const;

export function EducationSection() {
  const { register, control, formState } = useFormContext<ProfileWrite>();
  const items = useWatch({ control, name: "education" }) ?? [];
  return (
    <ListSection
      section="education"
      title="Education"
      addLabel="Add education"
      summarize={(i) => ({
        title: [items[i]?.degree, items[i]?.specialization].filter(Boolean).join(", "),
        subtitle: [items[i]?.institution, items[i]?.graduation_year].filter(Boolean).join(" · "),
      })}
      renderItem={(i) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Degree" {...register(`education.${i}.degree`)} />
          <Field label="Specialization" {...register(`education.${i}.specialization`)} />
          <Field label="Institution" className="sm:col-span-2" {...register(`education.${i}.institution`)} />
          <Field label="Start year" type="number" error={formState.errors.education?.[i]?.start_year?.message} {...register(`education.${i}.start_year`, YEAR)} />
          <Field label="Graduation year" type="number" error={formState.errors.education?.[i]?.graduation_year?.message} {...register(`education.${i}.graduation_year`, YEAR)} />
          <Field label="Grade / CGPA" {...register(`education.${i}.grade`)} />
        </div>
      )}
    />
  );
}
