import { Controller, useFormContext, useWatch } from "react-hook-form";

import { Field } from "@/components/fields/Field";
import { LinesField } from "@/components/fields/LinesField";
import { TagInput } from "@/components/fields/TagInput";
import { ListSection } from "@/features/profile/sections/ListSection";
import type { ProfileWrite } from "@/lib/profile/profile-service";
import { Label, Textarea } from "@copilot/ui";

export function ProjectsSection() {
  const { register, control } = useFormContext<ProfileWrite>();
  const items = useWatch({ control, name: "projects" }) ?? [];
  return (
    <ListSection
      section="projects"
      title="Projects"
      addLabel="Add project"
      summarize={(i) => ({ title: items[i]?.project_name ?? "", subtitle: items[i]?.technologies?.join(", ") })}
      renderItem={(i) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Project name" {...register(`projects.${i}.project_name`)} />
          <Field label="Your role" {...register(`projects.${i}.role`)} />
          <Field label="Link" type="url" className="sm:col-span-2" {...register(`projects.${i}.url`)} />
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor={`project-desc-${i}`}>Description</Label>
            <Textarea id={`project-desc-${i}`} rows={3} {...register(`projects.${i}.description`)} />
          </div>
          <div className="sm:col-span-2">
            <Controller
              control={control}
              name={`projects.${i}.outcomes`}
              render={({ field }) => <LinesField label="Outcomes" value={field.value ?? []} onChange={field.onChange} />}
            />
          </div>
          <Controller
            control={control}
            name={`projects.${i}.technologies`}
            render={({ field }) => (
              <TagInput className="sm:col-span-2" label="Technologies" value={field.value ?? []} onChange={field.onChange} />
            )}
          />
        </div>
      )}
    />
  );
}
