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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, FileText, RefreshCw, Trash2, UserRoundCheck } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { useDeleteResume, useReprocessResume, useResumes } from "@/features/resumes/queries";
import { ResumeDropzone } from "@/features/resumes/ResumeDropzone";
import { ResumePreviewDialog } from "@/features/resumes/ResumePreviewDialog";
import { ResumeStatusBadge } from "@/features/resumes/ResumeStatusBadge";
import { formatBytes, formatDate } from "@/lib/format";
import type { Resume, ResumeService } from "@/lib/resumes/resume-service";
import { useServices } from "@/lib/services";

export function ResumesPage() {
  const resumes = useResumes();
  const [preview, setPreview] = useState<Resume | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Resume | null>(null);
  const [pendingImport, setPendingImport] = useState<Resume | null>(null);
  const reprocess = useReprocessResume();
  const remove = useDeleteResume();
  const { profile, resumes: resumeService } = useServices();
  const client = useQueryClient();
  const navigate = useNavigate();
  const importResume = useMutation({
    mutationFn: async (resume: Resume) => {
      // Resumes read by an older parser are re-read first so the profile gets the latest fixes.
      if (resume.parser_outdated) await rereadResume(resumeService, resume.id);
      return profile.importResume(resume.id);
    },
    onSuccess: (data) => {
      client.setQueryData(["profile"], data);
      toast.success("Profile updated from this resume");
      navigate("/profile");
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="grid grid-cols-1 gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Resumes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a new version any time. The newest upload becomes your primary resume.
        </p>
      </div>

      <ResumeDropzone compact onUploaded={() => toast.success("Resume uploaded. We're reading it now.")} />

      <Card>
        <CardHeader>
          <CardTitle>Your files</CardTitle>
          <CardDescription>Only you can access these files.</CardDescription>
        </CardHeader>
        <CardContent>
          {resumes.isPending ? (
            <div className="grid gap-3">
              <Skeleton className="h-14" />
              <Skeleton className="h-14" />
            </div>
          ) : resumes.isError ? (
            <Alert variant="destructive">
              Couldn't load your resumes.{" "}
              <button className="underline" onClick={() => resumes.refetch()}>
                Try again
              </button>
            </Alert>
          ) : resumes.data.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No resumes yet.</p>
          ) : (
            <ul className="divide-y">
              {resumes.data.map((resume) => (
                <li key={resume.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-muted text-muted-foreground">
                      <FileText className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <span className="truncate">{resume.file_name}</span>
                        <ResumeStatusBadge status={resume.status} />
                        {resume.is_primary && <Badge variant="outline">Primary</Badge>}
                        {resume.ocr_confidence != null && (
                          <Badge variant="outline" title={`Text recognition confidence: ${Math.round(resume.ocr_confidence)}%`}>
                            Read with OCR
                          </Badge>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatBytes(resume.size_bytes)} · uploaded {formatDate(resume.created_at)}
                        {resume.page_count ? ` · ${resume.page_count} page${resume.page_count > 1 ? "s" : ""}` : ""}
                      </p>
                      {resume.status === "failed" && resume.error_message && (
                        <p className="mt-1 text-xs text-destructive">{resume.error_message}</p>
                      )}
                      {resume.parser_outdated && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Read with an older version of our resume reader. “Use for profile” re-reads it first.
                        </p>
                      )}
                      {resume.status === "ready" &&
                        resume.warnings.map((warning) => (
                          <p key={warning} className="mt-1 text-xs text-warning-foreground">
                            {warning}
                          </p>
                        ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 sm:justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setPreview(resume)}>
                      <Eye aria-hidden="true" /> Preview
                    </Button>
                    {resume.status === "ready" && (
                      <Button variant="ghost" size="sm" onClick={() => setPendingImport(resume)}>
                        <UserRoundCheck aria-hidden="true" /> Use for profile
                      </Button>
                    )}
                    {(resume.status === "failed" || resume.parser_outdated) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={reprocess.isPending && reprocess.variables === resume.id}
                        onClick={() => reprocess.mutate(resume.id)}
                      >
                        <RefreshCw aria-hidden="true" /> {resume.status === "failed" ? "Retry" : "Re-read"}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setPendingDelete(resume)}
                      aria-label={`Delete ${resume.file_name}`}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ResumePreviewDialog resume={preview} onClose={() => setPreview(null)} />

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this resume?</DialogTitle>
            <DialogDescription>
              “{pendingDelete?.file_name}” will be permanently deleted. Your profile stays as it is.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              variant="destructive"
              loading={remove.isPending}
              onClick={() =>
                pendingDelete &&
                remove.mutate(pendingDelete.id, {
                  onSuccess: () => {
                    toast.success("Resume deleted");
                    setPendingDelete(null);
                  },
                  onError: (error) => toast.error(error.message),
                })
              }
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingImport} onOpenChange={(open) => !open && setPendingImport(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace your profile with this resume?</DialogTitle>
            <DialogDescription>
              Your profile will be rebuilt from “{pendingImport?.file_name}”. Edits you made to the current profile
              will be replaced. Additional application details are kept.
              {pendingImport?.parser_outdated && " We'll re-read the file with the latest resume reader first."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button
              loading={importResume.isPending}
              onClick={() => pendingImport && importResume.mutate(pendingImport)}
            >
              Replace profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Re-processes a resume and waits until it's ready again. */
async function rereadResume(service: Pick<ResumeService, "reprocess" | "get">, id: string, timeoutMs = 90_000): Promise<void> {
  await service.reprocess(id);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const resume = await service.get(id);
    if (resume.status === "ready") return;
    if (resume.status === "failed") throw new Error(resume.error_message ?? "We couldn't re-read this resume.");
  }
  throw new Error("Re-reading the resume is taking longer than expected. Try again in a minute.");
}
