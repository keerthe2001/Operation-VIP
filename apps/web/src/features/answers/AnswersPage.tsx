import { CATEGORY_LABELS, type AnswerCategory } from "@copilot/shared";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@copilot/ui";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AnswerEditor, type EditorState } from "@/features/answers/AnswerEditor";
import { useAnswers, useDeleteAnswer, useSaveAnswer, useTemplates } from "@/features/answers/queries";
import type { AnswerTemplate, SavedAnswer } from "@/lib/answers/answer-service";

const EMPTY: EditorState = { input: { category: "other", question_text: "", answer_template: "", variants: [] } };

function TemplateGallery({ onCustomize, existing }: { onCustomize: (t: AnswerTemplate) => void; existing: SavedAnswer[] }) {
  const templates = useTemplates();
  const save = useSaveAnswer();
  const used = new Set(existing.map((a) => a.question_text));
  const available = (templates.data ?? []).filter((t) => !used.has(t.question_text));
  if (templates.isPending) return <Skeleton className="h-40" />;
  if (available.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Start from a template</CardTitle>
        <CardDescription>
          Templates fill themselves in for each application from your profile and the job description on the page,
          so they're ready to use as they are. Edit them any time to sound more like you.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 md:grid-cols-2">
          {available.map((template) => (
            <li key={template.question_text} className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium">{template.question_text}</p>
                <Badge variant="secondary">{CATEGORY_LABELS[template.category as AnswerCategory]}</Badge>
              </div>
              <p className="line-clamp-3 text-xs text-muted-foreground">{template.answer_template}</p>
              <div className="mt-auto flex gap-2">
                <Button size="sm" onClick={() => onCustomize(template)}>
                  <Pencil aria-hidden="true" /> Customize
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  loading={save.isPending && save.variables?.input.question_text === template.question_text}
                  onClick={() =>
                    save.mutate(
                      { input: template },
                      { onSuccess: () => toast.success("Added to your library. It fills in automatically for each job.") },
                    )
                  }
                >
                  <Plus aria-hidden="true" /> Add as is
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function AnswersPage() {
  const answers = useAnswers();
  const remove = useDeleteAnswer();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SavedAnswer | null>(null);

  const grouped = new Map<string, SavedAnswer[]>();
  for (const answer of answers.data ?? []) grouped.set(answer.category, [...(grouped.get(answer.category) ?? []), answer]);

  return (
    <div className="grid grid-cols-1 gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Answer library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Answers to common application questions. The extension suggests them when a form asks something similar.
          </p>
        </div>
        <Button onClick={() => setEditor(EMPTY)}>
          <Plus aria-hidden="true" /> New answer
        </Button>
      </div>

      {answers.isPending ? (
        <Skeleton className="h-40" />
      ) : answers.isError ? (
        <Alert variant="destructive">Couldn't load your answers.</Alert>
      ) : (
        <>
          {[...grouped.entries()].map(([category, items]) => (
            <section key={category} aria-labelledby={`cat-${category}`} className="grid gap-3">
              <h2 id={`cat-${category}`} className="text-sm font-semibold text-muted-foreground">
                {CATEGORY_LABELS[category as AnswerCategory] ?? category}
              </h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {items.map((answer) => (
                  <li key={answer.id} className="flex flex-col gap-2 rounded-xl border bg-card p-4 shadow-sm">
                    <p className="text-sm font-medium">{answer.question_text}</p>
                    <p className="line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">{answer.answer_template}</p>
                    <div className="mt-auto flex items-center gap-2 pt-1">
                      <span className="text-xs text-muted-foreground">
                        Used {answer.usage_count} time{answer.usage_count === 1 ? "" : "s"}
                        {answer.variants?.length ? ` · ${answer.variants.length} variant${answer.variants.length === 1 ? "" : "s"}` : ""}
                      </span>
                      {/\[[^\]]+\]/.test(answer.answer_template) && <Badge variant="warning">Needs personalizing</Badge>}
                      <span className="ml-auto flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditor({ id: answer.id, input: answer })}
                          aria-label={`Edit answer to “${answer.question_text}”`}
                        >
                          <Pencil aria-hidden="true" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setPendingDelete(answer)}
                          aria-label={`Delete answer to “${answer.question_text}”`}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {grouped.size === 0 && (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No saved answers yet. Start from a template below or write your own.
            </p>
          )}
          <TemplateGallery existing={answers.data} onCustomize={(t) => setEditor({ input: t })} />
        </>
      )}

      <AnswerEditor state={editor} onClose={() => setEditor(null)} />

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this answer?</DialogTitle>
            <DialogDescription>“{pendingDelete?.question_text}” will be removed from your library.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              loading={remove.isPending}
              onClick={() => pendingDelete && remove.mutate(pendingDelete.id, { onSuccess: () => setPendingDelete(null) })}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
