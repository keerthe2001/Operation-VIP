import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from "@copilot/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, PlugZap, Puzzle } from "lucide-react";

import { useExtensionStatus } from "@/features/extension/queries";
import { useServices } from "@/lib/services";

export function ConnectExtensionPage() {
  const { extension, extensionBridge } = useServices();
  const status = useExtensionStatus();
  const client = useQueryClient();
  const connect = useMutation({
    mutationFn: async () => {
      const token = await extension.handoffToken();
      const result = await extensionBridge.connect(token);
      if (!result.ok) throw new Error(result.error ?? "Couldn't connect the extension.");
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["extension-status"] }),
  });

  return (
    <div className="mx-auto grid max-w-lg gap-6 py-6">
      <Card>
        <CardHeader>
          <span className="mb-2 grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
            <Puzzle className="size-5" aria-hidden="true" />
          </span>
          <CardTitle>Connect the browser extension</CardTitle>
          <CardDescription>
            The extension uses your profile to fill job applications. Connecting signs it in to this account; you can sign it
            out from its settings at any time.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {status.isPending ? (
            <Skeleton className="h-10" />
          ) : connect.isSuccess || (status.data?.signedIn && !connect.isPending) ? (
            <Alert className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-success" aria-hidden="true" />
              {connect.isSuccess ? "Connected. Open the Copilot side panel to start." : "The extension is already signed in."}
            </Alert>
          ) : !status.data?.installed ? (
            <Alert>
              We couldn't find the extension in this browser. Install it, then{" "}
              <button className="font-medium underline underline-offset-4" onClick={() => status.refetch()}>
                check again
              </button>
              .
            </Alert>
          ) : null}
          {connect.isError && <Alert variant="destructive">{connect.error.message}</Alert>}
          {status.data?.installed && !connect.isSuccess && (
            <Button onClick={() => connect.mutate()} loading={connect.isPending} className="justify-self-start">
              <PlugZap aria-hidden="true" /> {status.data.signedIn ? "Reconnect to this account" : "Connect extension"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
