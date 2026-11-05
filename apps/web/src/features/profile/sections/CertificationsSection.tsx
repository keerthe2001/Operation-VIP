import { useFormContext, useWatch } from "react-hook-form";

import { Field } from "@/components/fields/Field";
import { ListSection } from "@/features/profile/sections/ListSection";
import type { ProfileWrite } from "@/lib/profile/profile-service";

export function CertificationsSection() {
  const { register, control, formState } = useFormContext<ProfileWrite>();
  const items = useWatch({ control, name: "certifications" }) ?? [];
  return (
    <ListSection
      section="certifications"
      title="Certifications"
      addLabel="Add certification"
      summarize={(i) => ({
        title: items[i]?.certification_name ?? "",
        subtitle: [items[i]?.issuing_organization, items[i]?.issue_date].filter(Boolean).join(" · "),
      })}
      renderItem={(i) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2" {...register(`certifications.${i}.certification_name`)} />
          <Field label="Issuing organization" {...register(`certifications.${i}.issuing_organization`)} />
          <Field
            label="Issued"
            placeholder="YYYY-MM"
            error={formState.errors.certifications?.[i]?.issue_date?.message}
            {...register(`certifications.${i}.issue_date`, {
              pattern: { value: /^\d{4}(-(0[1-9]|1[0-2]))?$/, message: "Use YYYY or YYYY-MM" },
              setValueAs: (v) => v || null,
            })}
          />
          <Field label="Credential URL" type="url" className="sm:col-span-2" {...register(`certifications.${i}.credential_url`)} />
        </div>
      )}
    />
  );
}
