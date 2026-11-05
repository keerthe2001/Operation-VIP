import { Badge, Button, cn } from "@copilot/ui";
import { ChevronDown, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useFieldArray, useFormContext, type ArrayPath, type FieldArray } from "react-hook-form";

import { SectionCard } from "@/features/profile/SectionCard";
import { emptyItem, type ListSection as Section } from "@/lib/profile/form";
import type { ProfileWrite } from "@/lib/profile/profile-service";

interface ListSectionProps {
  section: Section;
  title: string;
  description?: string;
  addLabel: string;
  summarize: (index: number) => { title: string; subtitle?: string };
  renderItem: (index: number) => ReactNode;
}

/** Generic editor for experience/education/projects/certifications lists. */
export function ListSection({ section, title, description, addLabel, summarize, renderItem }: ListSectionProps) {
  const { control, getValues, getFieldState, formState } = useFormContext<ProfileWrite>();
  const { fields, append, remove } = useFieldArray({ control, name: section as ArrayPath<ProfileWrite> });
  const [open, setOpen] = useState<Set<string>>(new Set());
  // Index of a just-added item, which starts expanded.
  const [newIndex, setNewIndex] = useState<number | null>(null);

  const toggle = (id: string, index: number) => {
    if (index === newIndex) {
      setNewIndex(null);
      return;
    }
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <SectionCard
      id={section}
      title={title}
      description={description}
      action={
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setNewIndex(fields.length);
            append(emptyItem(section) as FieldArray<ProfileWrite, ArrayPath<ProfileWrite>>);
          }}
        >
          <Plus aria-hidden="true" /> {addLabel}
        </Button>
      }
    >
      {fields.length === 0 ? (
        <p className="rounded-lg border border-dashed py-6 text-center text-sm text-muted-foreground">
          Nothing here yet.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3">
          {fields.map((field, index) => {
            const item = getValues(`${section}.${index}` as const) as { is_confirmed?: boolean };
            const edited = getFieldState(`${section}.${index}` as never, formState).isDirty;
            const unconfirmed = !item?.is_confirmed && !edited;
            const isOpen = open.has(field.id) || index === newIndex;
            const { title: itemTitle, subtitle } = summarize(index);
            return (
              <li
                key={field.id}
                className={cn("min-w-0 rounded-lg border", unconfirmed && "border-warning/60")}
              >
                <div className="flex items-center gap-2 p-3">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                    onClick={() => toggle(field.id, index)}
                    aria-expanded={isOpen}
                  >
                    <ChevronDown
                      className={cn("size-4 shrink-0 text-muted-foreground transition-transform", !isOpen && "-rotate-90")}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{itemTitle || "Untitled"}</span>
                      {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
                    </span>
                  </button>
                  {unconfirmed && (
                    <Badge variant="warning" title="Extracted automatically. Open it to check the details.">
                      <Sparkles aria-hidden="true" /> Review
                    </Badge>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      setNewIndex(null);
                      remove(index);
                    }}
                    aria-label={`Remove ${itemTitle || "item"}`}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                </div>
                {isOpen && <div className="border-t p-4">{renderItem(index)}</div>}
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
