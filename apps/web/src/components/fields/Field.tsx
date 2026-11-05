import { Input, Label, cn } from "@copilot/ui";
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

import { ReviewBadge } from "@/components/fields/ReviewBadge";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: ReactNode;
  review?: boolean;
  reviewSource?: string | null;
  className?: string;
}

/** Labeled input with optional "needs review" marker and error text. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ label, error, hint, review, reviewSource, className, ...props }, ref) => {
    const id = useId();
    const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
    return (
      <div className={cn("grid content-start gap-1.5", className)}>
        <div className="flex min-h-5 items-center justify-between gap-2">
          <Label htmlFor={id}>{label}</Label>
          {review && <ReviewBadge source={reviewSource} />}
        </div>
        <Input
          id={id}
          ref={ref}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(review && "border-warning/60")}
          {...props}
        />
        {error ? (
          <p id={`${id}-error`} className="text-xs text-destructive">
            {error}
          </p>
        ) : hint ? (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
Field.displayName = "Field";
