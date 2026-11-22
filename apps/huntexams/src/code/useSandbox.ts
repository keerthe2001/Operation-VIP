import { useEffect, useState } from "react";

import { sandbox, type SandboxStatus } from "@/sandbox/runner";

export function useSandboxStatus(): SandboxStatus {
  const [s, setS] = useState<SandboxStatus>(sandbox.status);
  useEffect(() => sandbox.onStatus(setS), []);
  return s;
}

export const STATUS_TEXT: Record<SandboxStatus, string> = {
  idle: "Python sandbox: runs in your browser",
  loading: "Starting Python… (first time takes a few seconds)",
  ready: "Python ready · runs in your browser",
  running: "Running…",
  failed: "Python couldn't start. Reload the page to try again.",
};
