/// <reference lib="webworker" />
// Runs learner Python with Pyodide (CPython compiled to WebAssembly) inside this worker.
// The page terminates the worker on timeout, so an infinite loop can't freeze the tab, and
// nothing runs on our servers.
import { HARNESS } from "./harness";

type PyodideLike = {
  runPython: (code: string) => unknown;
  globals: { get: (name: string) => (...args: unknown[]) => string };
  toPy: (v: unknown) => unknown;
};

let py: PyodideLike | null = null;

async function boot(): Promise<PyodideLike> {
  if (py) return py;
  const url = new URL("/pyodide/pyodide.mjs", self.location.origin).href;
  const mod = (await import(/* @vite-ignore */ url)) as {
    loadPyodide: (o: { indexURL: string }) => Promise<PyodideLike>;
  };
  py = await mod.loadPyodide({ indexURL: new URL("/pyodide/", self.location.origin).href });
  py.runPython(HARNESS);
  return py;
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as { id: number; type: "init" | "run"; src?: string; trace?: boolean;
    tests?: string | null; check?: Record<string, unknown> | null; maxSteps?: number };
  try {
    const p = await boot();
    if (msg.type === "init") {
      self.postMessage({ id: msg.id, ok: true, ready: true });
      return;
    }
    const run = p.globals.get("run_user");
    const check = msg.check ? p.toPy(msg.check) : undefined;
    const json = run(msg.src ?? "", Boolean(msg.trace), msg.tests ?? undefined, check, msg.maxSteps ?? 2500);
    self.postMessage({ id: msg.id, ok: true, result: JSON.parse(json) });
  } catch (err) {
    self.postMessage({ id: msg.id, ok: false, error: String(err) });
  }
};
