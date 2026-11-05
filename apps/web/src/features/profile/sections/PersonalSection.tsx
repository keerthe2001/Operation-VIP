import { useFormContext } from "react-hook-form";

import { Field } from "@/components/fields/Field";
import { SectionCard } from "@/features/profile/SectionCard";
import { useFieldReview } from "@/features/profile/useFieldReview";
import type { ProfileWrite } from "@/lib/profile/profile-service";

const FIELDS = [
  ["full_name", "Full name", "text", "name"],
  ["first_name", "First name", "text", "given-name"],
  ["last_name", "Last name", "text", "family-name"],
  ["email", "Email", "email", "email"],
  ["phone", "Phone", "tel", "tel"],
  ["location", "Location", "text", "address-level2"],
  ["linkedin", "LinkedIn", "url", "url"],
  ["github", "GitHub", "url", "url"],
  ["portfolio", "Portfolio / website", "url", "url"],
] as const;

export function PersonalSection() {
  const { register, formState } = useFormContext<ProfileWrite>();
  const review = useFieldReview();
  const errors = formState.errors.personal_information;
  return (
    <SectionCard id="personal" title="Personal & contact" description="Used for name, email, phone and link fields.">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FIELDS.map(([key, label, type, autoComplete]) => (
          <Field
            key={key}
            label={label}
            type={type}
            autoComplete={autoComplete}
            className={key === "full_name" ? "sm:col-span-2 lg:col-span-1" : undefined}
            error={errors?.[key]?.message}
            {...review(`personal_information.${key}`)}
            {...register(`personal_information.${key}`, {
              ...(key === "email" && {
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email address" },
              }),
            })}
          />
        ))}
      </div>
    </SectionCard>
  );
}
