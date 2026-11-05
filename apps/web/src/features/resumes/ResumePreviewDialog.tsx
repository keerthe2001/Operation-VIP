import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Skeleton,
} from "@copilot/ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import { useResumeDetail } from "@/features/resumes/queries";
import type { Resume } from "@/lib/resumes/resume-service";
import { useServices } from "@/lib/services";

export function ResumePreviewDialog({ resume, onClose }: { resume: Resume | null; onClose: () => void }) {
  const { resumes } = useServices();
  const previewable = !!resume && (resume.mime_type === "application/pdf" || resume.mime_type.startsWith("image/"));
  const file = useQuery({
    queryKey: ["resume-file", resume?.id],
    queryFn: () => resumes.file(resume!.id),
    enabled: previewable,
    staleTime: Infinity,
  });
  const detail = useResumeDetail(resume && !previewable ? resume.id : null);
  const url = useMemo(() => (file.data ? URL.createObjectURL(file.data) : null), [file.data]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );

  return (
    <Dialog open={!!resume} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="truncate">{resume?.file_name}</DialogTitle>
          <DialogDescription>
            {previewable ? "Original document" : "Text we extracted from this document"}
          </DialogDescription>
        </DialogHeader>
        {previewable ? (
          url ? (
            resume.mime_type === "application/pdf" ? (
              <iframe src={url} title={`Preview of ${resume.file_name}`} className="h-[70svh] w-full rounded-md border" />
            ) : (
              <img src={url} alt={`Resume ${resume.file_name}`} className="max-h-[70svh] w-full rounded-md border object-contain" />
            )
          ) : (
            <Skeleton className="h-[70svh] w-full" />
          )
        ) : detail.data ? (
          <pre className="max-h-[70svh] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-4 font-sans text-sm leading-relaxed">
            {detail.data.extracted_text || "No text has been extracted yet."}
          </pre>
        ) : (
          <Skeleton className="h-64 w-full" />
        )}
      </DialogContent>
    </Dialog>
  );
}
