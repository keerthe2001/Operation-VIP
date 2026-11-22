import type { Frame, RunError, TraceStep, VarInfo } from "./runner";

/** One executed line, with the state right after it ran and a plain-English description. */
export type VisualFrame = {
  line: number;
  stack: Frame[];
  out: string;
  newOut: string;
  changed: string[];
  says: string;
  error?: RunError;
};

const fmt = (v: VarInfo | undefined) => (v ? v.v : "nothing");

function lineKind(src: string): "for" | "while" | "if" | "def" | "return" | "import" | "other" {
  const s = src.trim();
  if (s.startsWith("for ")) return "for";
  if (s.startsWith("while ")) return "while";
  if (s.startsWith("if ") || s.startsWith("elif ") || s === "else:") return "if";
  if (s.startsWith("def ") || s.startsWith("class ")) return "def";
  if (s.startsWith("return")) return "return";
  if (s.startsWith("import ") || s.startsWith("from ")) return "import";
  return "other";
}

function diffVars(before: Record<string, VarInfo>, after: Record<string, VarInfo>) {
  const created: string[] = [];
  const changed: string[] = [];
  for (const [k, v] of Object.entries(after)) {
    if (!(k in before)) created.push(k);
    else if (before[k]!.v !== v.v) changed.push(k);
  }
  return { created, changed };
}

/**
 * Turn a raw trace (state *before* each line) into frames that show the state *after* each
 * executed line, which is easier to follow for beginners.
 */
export function buildFrames(steps: TraceStep[], source: string, error: RunError | null): VisualFrame[] {
  const lines = source.split("\n");
  const frames: VisualFrame[] = [];
  for (let i = 0; i < steps.length; i++) {
    const cur = steps[i]!;
    if (cur.event !== "line") continue;
    const next = steps[i + 1];
    const depth = cur.stack.length;
    const after = next ?? cur;
    const beforeTop = cur.stack[depth - 1]?.vars ?? {};
    const text = lines[cur.line - 1] ?? "";
    const kind = lineKind(text);
    const newOut = after.out.slice(cur.out.length);
    const parts: string[] = [];
    let changedNames: string[] = [];

    if (next && next.stack.length > depth && next.event === "line") {
      const callee = next.stack[next.stack.length - 1]!;
      const args = Object.entries(callee.vars).map(([k, v]) => `${k} = ${v.v}`).join(", ");
      parts.push(`Calls ${callee.name}()${args ? ` with ${args}` : ""}. Python jumps into the function.`);
    } else {
      const afterTop = after.stack.length >= depth ? after.stack[depth - 1]?.vars ?? {} : {};
      const { created, changed } = diffVars(beforeTop, afterTop);
      changedNames = [...created, ...changed];
      if (kind === "def") parts.push(`Defines ${text.trim().split(/[\s(:]/)[1]}. Nothing inside it runs yet.`);
      else if (kind === "import") parts.push("Brings in a module so its tools can be used.");
      else if (kind === "for") {
        const loopVar = created.concat(changed)[0];
        parts.push(loopVar ? `The loop takes the next item: ${loopVar} = ${fmt(afterTop[loopVar])}.` : "The loop has no items left, so it ends.");
      } else if (kind === "while") parts.push("Checks the loop condition.");
      else if (kind === "if") parts.push("Checks the condition to decide which lines run next.");
      else {
        for (const k of created) parts.push(`Creates ${k} = ${fmt(afterTop[k])}.`);
        for (const k of changed) parts.push(`${k} changes from ${fmt(beforeTop[k])} to ${fmt(afterTop[k])}.`);
      }
      if (kind === "return" || (next?.event === "return" && next.ret !== undefined && next.stack.length === depth)) {
        const ret = next?.ret ?? steps.slice(i + 1).find((s) => s.event === "return")?.ret;
        if (ret !== undefined && cur.stack[depth - 1]?.name !== "main") parts.push(`Returns ${ret} to whoever called ${cur.stack[depth - 1]!.name}().`);
      }
    }
    if (newOut) parts.push(`Prints ${JSON.stringify(newOut.replace(/\n$/, ""))}.`);
    if (!parts.length) parts.push(kind === "other" ? "Runs. No variables change." : "Runs.");

    frames.push({ line: cur.line, stack: after.stack.length ? after.stack : cur.stack, out: after.out,
      newOut, changed: changedNames, says: parts.join(" ") });
  }
  if (error) {
    const last = frames[frames.length - 1];
    frames.push({ line: error.line ?? last?.line ?? 1, stack: last?.stack ?? [], out: last?.out ?? "",
      newOut: "", changed: [], error, says: `Stops with ${error.type}: ${error.message}` });
  }
  return frames;
}

/** Friendlier wording for the errors beginners hit most. */
export function explainError(e: RunError): string {
  const m = e.message;
  switch (e.type) {
    case "NameError": {
      const name = /name '([^']+)'/.exec(m)?.[1];
      return name ? `Python doesn't know anything called ${name}. Check the spelling, or create it before this line.` : m;
    }
    case "SyntaxError":
      return `Python couldn't read this line (${m}). Look for a missing bracket, quote or colon.`;
    case "IndentationError":
      return "The spaces at the start of a line don't line up. Lines inside a loop or function need 4 spaces.";
    case "TypeError":
      return `A value was used the wrong way: ${m}.`;
    case "KeyError":
      return `That key isn't in the dictionary: ${m}. Use .get() if it might be missing.`;
    case "IndexError":
      return "You asked for a position that doesn't exist in the list. Positions start at 0.";
    case "ZeroDivisionError":
      return "Something was divided by zero.";
    default:
      return m;
  }
}
