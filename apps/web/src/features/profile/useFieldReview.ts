import { useFormContext, useWatch } from "react-hook-form";

import { needsReview } from "@/lib/profile/form";
import type { ProfileWrite } from "@/lib/profile/profile-service";

/** Returns props that mark a scalar field as "needs review" until the user edits it. */
export function useFieldReview() {
  const { control, getFieldState, formState } = useFormContext<ProfileWrite>();
  const meta = useWatch({ control, name: "field_meta" });
  return (path: `personal_information.${string}` | `professional_summary.${string}` | "skills") => {
    const dirty = getFieldState(path as never, formState).isDirty;
    return {
      review: !dirty && needsReview(meta ?? undefined, path),
      reviewSource: meta?.[path]?.source ?? null,
    };
  };
}
