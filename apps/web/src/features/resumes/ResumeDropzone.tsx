import { Alert, Button, Progress, cn } from "@copilot/ui";
import { FileUp, UploadCloud } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";

import { useUploadResume } from "@/features/resumes/queries";
import { ApiError } from "@/lib/api/errors";
import { ACCEPTED_TYPES, MAX_UPLOAD_MB, precheckFile, type Resume } from "@/lib/resumes/resume-service";

interface ResumeDropzoneProps {
  onUploaded?: (resume: Resume) => void;
  compact?: boolean;
}

function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "CONFLICT") return "You've already uploaded this exact file.";
    return error.message;
  }
  return "Upload failed. Please try again.";
}

export function ResumeDropzone({ onUploaded, compact = false }: ResumeDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const upload = useUploadResume();

  function start(file: File | undefined) {
    if (!file) return;
    setLocalError(null);
    const problem = precheckFile(file);
    if (problem) {
      setLocalError(problem);
      return;
    }
    setFileName(file.name);
    upload.mutate(file, { onSuccess: (resume) => onUploaded?.(resume) });
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    start(event.dataTransfer.files[0]);
  }

  const error = localError ?? (upload.isError ? describeError(upload.error) : null);

  return (
    <div className="grid gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors",
          compact ? "gap-2 px-4 py-6" : "gap-3 px-6 py-12",
          dragging ? "border-primary bg-primary/5" : "border-border bg-muted/30 hover:bg-muted/50",
        )}
        data-testid="resume-dropzone"
      >
        <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary">
          <UploadCloud className="size-5" aria-hidden="true" />
        </span>
        {upload.isPending ? (
          <div className="grid w-full max-w-xs gap-2">
            <p className="truncate text-sm font-medium">Uploading {fileName}</p>
            <Progress value={upload.progress} label="Upload progress" />
          </div>
        ) : (
          <>
            <div>
              <p className="text-sm font-medium">Drag and drop your resume here</p>
              <p className="mt-1 text-xs text-muted-foreground">
                PDF, DOC, DOCX, PNG or JPG · up to {MAX_UPLOAD_MB} MB
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
              <FileUp aria-hidden="true" />
              Browse files
            </Button>
          </>
        )}
        <label htmlFor={inputId} className="sr-only">
          Upload resume
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            start(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
    </div>
  );
}
