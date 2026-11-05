import { Badge } from "@copilot/ui";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

import type { ResumeStatus } from "@/lib/resumes/resume-service";

const LABELS: Record<ResumeStatus, string> = {
  uploaded: "Queued",
  scanning: "Scanning",
  extracting: "Reading",
  parsing: "Building profile",
  ready: "Ready",
  failed: "Failed",
};

export function ResumeStatusBadge({ status }: { status: ResumeStatus }) {
  if (status === "ready") {
    return (
      <Badge variant="success">
        <CheckCircle2 aria-hidden="true" /> {LABELS[status]}
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive">
        <AlertCircle aria-hidden="true" /> {LABELS[status]}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary">
      <Loader2 className="animate-spin" aria-hidden="true" /> {LABELS[status]}
    </Badge>
  );
}
