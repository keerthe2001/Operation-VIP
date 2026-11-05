import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
  NativeSelect,
  Skeleton,
  Textarea,
} from "@copilot/ui";
import { ExternalLink, FileText, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";

import { useApplicationDetail, useDeleteApplication, useUpdateApplication } from "@/features/applications/queries";
import { STATUS_LABELS, STATUSES, type ApplicationDetail } from "@/lib/applications/application-service";
import { formatDate } from "@/lib/format";

export function ApplicationDetailDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const detail = useApplicationDetail(id);
  return (
    <Dialog open={!!id} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        {detail.data ? (
          <DetailBody key={detail.data.id} application={detail.data} onClose={onClose} />
        ) : detail.isError ? (
          <Alert variant="destructive">Couldn't load this application.</Alert>
        ) : (
          <Skeleton className="h-64" />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DetailBody({ application, onClose }: { application: ApplicationDetail; onClose: () => void }) {
  const statusId = useId();
  const notesId = useId();
  const [notes, setNotes] = useState(application.notes ?? "");
  const update = useUpdateApplication();
  const remove = useDeleteApplication();
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{application.job_title ?? "Untitled position"}</DialogTitle>
        <DialogDescription>
          {application.company_name ?? "Unknown company"} · added {formatDate(application.created_at)}
          {application.source === "extension" ? " by the extension" : ""}
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor={statusId}>Status</Label>
          <NativeSelect
            id={statusId}
            value={application.status}
            onChange={(e) =>
              update.mutate(
                { id: application.id, input: { status: e.target.value as ApplicationDetail["status"] } },
                { onSuccess: () => toast.success("Status updated") },
              )
            }
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid content-start gap-1.5 text-sm">
          <span className="font-medium">Job posting</span>
          <a className="inline-flex min-w-0 items-center gap-1 text-primary hover:underline" href={application.job_url} target="_blank" rel="noreferrer">
            <span className="truncate">{new URL(application.job_url).hostname}</span>
            <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
          </a>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted-foreground">Resume used</dt>
          <dd className="flex items-center gap-1 truncate">
            {application.resume_file_name ? (
              <>
                <FileText className="size-3.5 shrink-0" aria-hidden="true" /> {application.resume_file_name}
              </>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Fields filled</dt>
          <dd className="tabular-nums">
            {application.fields_filled} of {application.fields_detected || "?"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Applied</dt>
          <dd>{application.applied_at ? formatDate(application.applied_at) : "Not yet"}</dd>
        </div>
      </dl>

      <section aria-labelledby="timeline" className="grid gap-2">
        <h3 id="timeline" className="text-sm font-medium">Timeline</h3>
        <ol className="grid gap-2 border-l pl-4 text-sm">
          {application.status_history.map((event, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary" aria-hidden="true" />
              {STATUS_LABELS[event.status]}{" "}
              <span className="text-xs text-muted-foreground">
                · {new Date(event.at).toLocaleString()} · {event.by === "user" ? "by you" : "automatically"}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {application.answers.length > 0 && (
        <section aria-labelledby="answers-used" className="grid gap-2">
          <h3 id="answers-used" className="text-sm font-medium">Answers you inserted</h3>
          <ul className="grid gap-2">
            {application.answers.map((answer) => (
              <li key={answer.id} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{answer.question_text}</p>
                <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{answer.final_answer}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor={notesId}>Notes</Label>
        <Textarea id={notesId} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Recruiter, interview dates, follow-ups…" />
        <Button
          size="sm"
          variant="outline"
          className="justify-self-start"
          disabled={notes === (application.notes ?? "")}
          loading={update.isPending}
          onClick={() => update.mutate({ id: application.id, input: { notes } }, { onSuccess: () => toast.success("Notes saved") })}
        >
          Save notes
        </Button>
      </div>

      {application.job_description && (
        <details className="rounded-lg border p-3 text-sm">
          <summary className="cursor-pointer font-medium">Job description</summary>
          <p className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-muted-foreground">{application.job_description}</p>
        </details>
      )}

      <div className="flex justify-end border-t pt-4">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-sm">Remove from your tracker?</span>
            <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              loading={remove.isPending}
              onClick={() => remove.mutate(application.id, { onSuccess: onClose })}
            >
              Remove
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 aria-hidden="true" /> Remove application
          </Button>
        )}
      </div>
    </div>
  );
}
