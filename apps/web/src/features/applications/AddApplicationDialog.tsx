import { Alert, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, NativeSelect } from "@copilot/ui";
import { useId, useState, type FormEvent } from "react";

import { useCreateApplication } from "@/features/applications/queries";
import { ApiError } from "@/lib/api/errors";
import { STATUS_LABELS, STATUSES, type ApplicationStatus } from "@/lib/applications/application-service";

export function AddApplicationDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ids = { url: useId(), company: useId(), title: useId(), status: useId() };
  const [url, setUrl] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<ApplicationStatus>("submitted");
  const create = useCreateApplication();

  function submit(event: FormEvent) {
    event.preventDefault();
    create.mutate(
      { job_url: url.trim(), company_name: company.trim() || null, job_title: title.trim() || null, status },
      {
        onSuccess: () => {
          setUrl("");
          setCompany("");
          setTitle("");
          onClose();
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Add an application</DialogTitle>
            <DialogDescription>For applications you made without the extension.</DialogDescription>
          </DialogHeader>
          {create.isError && (
            <Alert variant="destructive">
              {create.error instanceof ApiError && create.error.code === "VALIDATION_ERROR"
                ? "Enter the full job link, starting with https://"
                : create.error.message}
            </Alert>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor={ids.url}>Job link</Label>
            <Input id={ids.url} type="url" required placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={ids.company}>Company</Label>
              <Input id={ids.company} value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={ids.title}>Job title</Label>
              <Input id={ids.title} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={ids.status}>Status</Label>
            <NativeSelect id={ids.status} value={status} onChange={(e) => setStatus(e.target.value as ApplicationStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Add application
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
