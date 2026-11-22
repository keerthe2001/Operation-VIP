// Page-side client for the Python sandbox worker: start-up, timeouts and restarts.

export type VarInfo = { v: string; t: string };
export type Frame = { name: string; vars: Record<string, VarInfo> };
export type TraceStep = { event: "line" | "return" | "exception"; line: number; stack: Frame[]; out: string; ret?: string };
export type RunError = { type: string; message: string; line: number | null };
export type RunResult = {
  stdout: string;
  error: RunError | null;
  steps: TraceStep[] | null;
  vars: Record<string, VarInfo>;
  test: { passed: boolean; message: string } | null;
  check: { passed: boolean; message: string } | null;
};
export type SandboxStatus = "idle" | "loading" | "ready" | "running" | "failed";

type Pending = { resolve: (v: RunResult | null) => void; reject: (e: Error) => void; timer: number };

class Sandbox {
  private worker: Worker | null = null;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private ready: Promise<void> | null = null;
  status: SandboxStatus = "idle";
  private listeners = new Set<(s: SandboxStatus) => void>();

  onStatus(fn: (s: SandboxStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  private setStatus(s: SandboxStatus) {
    this.status = s;
    this.listeners.forEach((fn) => fn(s));
  }

  private spawn() {
    this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent) => {
      const { id, ok, result, error } = e.data as { id: number; ok: boolean; result?: RunResult; error?: string };
      const p = this.pending.get(id);
      if (!p) return;
      window.clearTimeout(p.timer);
      this.pending.delete(id);
      if (ok) p.resolve(result ?? null);
      else p.reject(new Error(error ?? "Python failed"));
    };
    this.worker.onerror = () => this.reset("failed");
  }

  private send(msg: Record<string, unknown>, timeoutMs: number): Promise<RunResult | null> {
    if (!this.worker) this.spawn();
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        this.reset("idle");
        reject(new TimeoutError());
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.worker!.postMessage({ id, ...msg });
    });
  }

  private reset(status: SandboxStatus) {
    this.worker?.terminate();
    this.worker = null;
    this.ready = null;
    this.pending.forEach((p) => { window.clearTimeout(p.timer); p.reject(new Error("Sandbox restarted")); });
    this.pending.clear();
    this.setStatus(status);
  }

  /** Load Python. The first load downloads about 13 MB, then it's cached by the browser. */
  start(): Promise<void> {
    if (!this.ready) {
      this.setStatus("loading");
      this.ready = this.send({ type: "init" }, 60000).then(
        () => this.setStatus("ready"),
        (e: Error) => { this.ready = null; this.setStatus("failed"); throw e; },
      );
    }
    return this.ready;
  }

  async run(opts: { src: string; trace?: boolean; tests?: string | null;
    check?: Record<string, unknown> | null; timeoutMs?: number }): Promise<RunResult> {
    await this.start();
    this.setStatus("running");
    try {
      const res = await this.send({ type: "run", src: opts.src, trace: opts.trace ?? true,
        tests: opts.tests ?? null, check: opts.check ?? null }, opts.timeoutMs ?? 7000);
      this.setStatus("ready");
      if (!res) throw new Error("No result");
      return res;
    } catch (e) {
      if (e instanceof TimeoutError) {
        return { stdout: "", steps: null, vars: {}, test: opts.tests ? { passed: false, message: "Timed out." } : null,
          check: opts.check ? { passed: false, message: "Your code ran too long and was stopped." } : null,
          error: { type: "Timeout", line: null,
            message: "Your code ran for more than 7 seconds and was stopped. Check for a loop that never ends." } };
      }
      if (this.status !== "failed") this.setStatus("ready");
      throw e;
    }
  }
}

export class TimeoutError extends Error {}

export const sandbox = new Sandbox();
