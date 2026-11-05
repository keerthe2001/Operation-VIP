import { Label, NativeSelect, Textarea } from "@copilot/ui";
import { useId } from "react";
import { useFormContext } from "react-hook-form";

import { Field } from "@/components/fields/Field";
import { ReviewBadge } from "@/components/fields/ReviewBadge";
import { SectionCard } from "@/features/profile/SectionCard";
import { useFieldReview } from "@/features/profile/useFieldReview";
import type { ProfileWrite } from "@/lib/profile/profile-service";

export function SummarySection() {
  const { register } = useFormContext<ProfileWrite>();
  const review = useFieldReview();
  const summaryId = useId();
  const statusId = useId();
  const summaryReview = review("professional_summary.summary");
  return (
    <SectionCard id="summary" title="Professional summary">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="Current designation"
          className="sm:col-span-2"
          {...review("professional_summary.current_designation")}
          {...register("professional_summary.current_designation")}
        />
        <Field
          label="Total experience (years)"
          type="number"
          step="0.5"
          min="0"
          {...review("professional_summary.total_experience_years")}
          {...register("professional_summary.total_experience_years", { valueAsNumber: true })}
        />
        <div className="grid gap-1.5 sm:col-span-3">
          <div className="flex min-h-5 items-center justify-between">
            <Label htmlFor={summaryId}>Summary</Label>
            {summaryReview.review && <ReviewBadge source={summaryReview.reviewSource} />}
          </div>
          <Textarea id={summaryId} rows={4} {...register("professional_summary.summary")} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={statusId}>Employment status</Label>
          <NativeSelect
            id={statusId}
            {...register("professional_summary.employment_status", { setValueAs: (v) => v || null })}
          >
            <option value="">Not specified</option>
            <option value="employed">Currently employed</option>
            <option value="not_employed">Not currently employed</option>
          </NativeSelect>
        </div>
      </div>
    </SectionCard>
  );
}
