import { Badge } from "@copilot/ui";
import { Sparkles } from "lucide-react";

export function ReviewBadge({ source }: { source?: string | null }) {
  return (
    <Badge variant="warning" title={source ? `Found in your resume: “${source}”` : "Extracted automatically"}>
      <Sparkles aria-hidden="true" />
      Review
    </Badge>
  );
}
