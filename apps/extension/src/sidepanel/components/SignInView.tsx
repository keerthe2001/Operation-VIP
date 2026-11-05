import { Alert, Button, Input, Label } from "@copilot/ui";
import { ExternalLink } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import { send } from "@/sidepanel/chrome-state";
import { Logo } from "@/sidepanel/components/Logo";
import { WEB_URL } from "@/shared/config";

export function SignInView({ expired }: { expired: boolean }) {
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError(null);
    const reply = await send({ type: "SIGN_IN", email, password });
    setBusy(false);
    if (!reply.ok) setError(reply.error);
  }

  return (
    <div className="flex min-h-svh flex-col justify-center gap-6 p-5">
      <div className="text-center">
        <div className="flex justify-center">
          <Logo />
        </div>
        <h1 className="mt-5 text-lg font-semibold tracking-tight">Your job application copilot</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sign in to autofill applications from your profile.</p>
      </div>
      {expired && <Alert>Your session expired. Sign in again to continue.</Alert>}
      <Button asChild>
        <a href={`${WEB_URL}/extension/connect`} target="_blank" rel="noreferrer">
          Connect with your Copilot account <ExternalLink aria-hidden="true" />
        </a>
      </Button>
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> or sign in here <span className="h-px flex-1 bg-border" />
      </div>
      <form onSubmit={submit} className="grid gap-3" noValidate>
        {error && <Alert variant="destructive">{error}</Alert>}
        <div className="grid gap-1.5">
          <Label htmlFor={emailId}>Email</Label>
          <Input id={emailId} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={passwordId}>Password</Label>
          <Input
            id={passwordId}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" variant="outline" loading={busy}>
          Sign in
        </Button>
      </form>
      <p className="text-center text-xs text-muted-foreground">
        No account?{" "}
        <a className="underline underline-offset-4" href={`${WEB_URL}/register`} target="_blank" rel="noreferrer">
          Create one
        </a>
      </p>
    </div>
  );
}
