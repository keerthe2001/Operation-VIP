import { Controller, useFormContext } from "react-hook-form";

import { TagInput } from "@/components/fields/TagInput";
import { SectionCard } from "@/features/profile/SectionCard";
import { useFieldReview } from "@/features/profile/useFieldReview";
import { SKILL_CATEGORIES } from "@/lib/profile/form";
import type { ProfileWrite } from "@/lib/profile/profile-service";

export function SkillsSection() {
  const { control } = useFormContext<ProfileWrite>();
  const { review } = useFieldReview()("skills");
  return (
    <SectionCard id="skills" title="Skills" description="Press Enter or comma to add a skill.">
      <div className="grid gap-4 sm:grid-cols-2">
        {SKILL_CATEGORIES.map(([key, label], index) => (
          <Controller
            key={key}
            control={control}
            name={`skills.${key}`}
            render={({ field }) => (
              <TagInput label={label} value={field.value ?? []} onChange={field.onChange} review={review && index === 0} />
            )}
          />
        ))}
      </div>
    </SectionCard>
  );
}
