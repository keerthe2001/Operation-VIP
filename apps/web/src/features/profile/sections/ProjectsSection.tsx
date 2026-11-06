import { Controller, useFormContext, useWatch } from "react-hook-form";

import { Field } from "@/components/fields/Field";
import { PointsField } from "@/components/fields/PointsField";
import { ListSection } from "@/features/profile/sections/ListSection";
import type { ProfileWrite } from "@/lib/profile/profile-service";

export function ProjectsSection() {
  const { register, control } = useFormContext<ProfileWrite>();
  const items = useWatch({ control, name: "projects" }) ?? [];
  return (
    <ListSection
      section="projects"
      title="Projects"
      addLabel="Add project"
      summarize={(i) => ({
        title: items[i]?.project_name ?? "",
        subtitle: items[i]?.points?.length ? `${items[i]!.points.length} point${items[i]!.points.length === 1 ? "" : "s"}` : undefined,
      })}
      renderItem={(i) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project name" {...register(`projects.${i}.project_name`)} />
          <Field label="Your role" placeholder="Optional" {...register(`projects.${i}.role`)} />
          <Field label="Link" type="url" placeholder="Optional" className="sm:col-span-2" {...register(`projects.${i}.url`)} />
          <div className="sm:col-span-2">
            <Controller
              control={control}
              name={`projects.${i}.points`}
              render={({ field }) => (
                <PointsField label="Description" value={field.value ?? []} onChange={field.onChange} placeholder="What you built or did" />
              )}
            />
          </div>
        </div>
      )}
    />
  );
}
