import { Fragment, type ReactNode } from "react";

/** Tiny, safe inline markdown: **bold** and `code`. Never renders raw HTML. */
export function Md({ text }: { text: string }) {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(<Fragment key={i++}>{text.slice(last, m.index)}</Fragment>);
    const tok = m[0];
    out.push(tok.startsWith("**") ? <strong key={i++}>{tok.slice(2, -2)}</strong> : <code key={i++} className="inline">{tok.slice(1, -1)}</code>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(<Fragment key={i++}>{text.slice(last)}</Fragment>);
  return <>{out}</>;
}

const KW = new Set(["def", "return", "if", "elif", "else", "for", "while", "in", "import", "from", "as", "and", "or",
  "not", "is", "None", "True", "False", "try", "except", "finally", "with", "class", "lambda", "pass", "break",
  "continue", "raise", "yield", "global", "assert", "async", "await"]);
const BI = new Set(["print", "len", "range", "sum", "max", "min", "sorted", "list", "dict", "set", "str", "int",
  "float", "round", "abs", "enumerate", "zip", "isinstance", "type", "open", "reversed", "any", "all"]);

/** Lightweight Python highlighter for read-only code (the editor uses CodeMirror). */
export function highlight(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(#.*$)|("""[\s\S]*?"""|'''[\s\S]*?'''|f?"(?:\\.|[^"\\])*"|f?'(?:\\.|[^'\\])*')|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const [tok, com, str, num, word] = m;
    if (com) out.push(<span key={k++} className="tk-com">{tok}</span>);
    else if (str) out.push(<span key={k++} className="tk-str">{tok}</span>);
    else if (num) out.push(<span key={k++} className="tk-num">{tok}</span>);
    else if (word && KW.has(word)) out.push(<span key={k++} className="tk-kw">{tok}</span>);
    else if (word && BI.has(word)) out.push(<span key={k++} className="tk-bi">{tok}</span>);
    else if (word && line.slice(m.index + tok.length).startsWith("(")) out.push(<span key={k++} className="tk-fn">{tok}</span>);
    else out.push(tok);
    last = m.index + tok.length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

export const LEVEL_COLOR = (n: number) => `var(--l${Math.max(0, Math.min(8, n))})`;

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function useTitle(title: string) {
  if (typeof document !== "undefined") document.title = title ? `${title} · HuntExams` : "HuntExams";
}

export const ENGINE_META: Record<string, { name: string; color: string }> = {
  flow: { name: "Flow", color: "var(--l4)" }, tokens: { name: "Tokens", color: "var(--l5)" },
  bars: { name: "Bars", color: "var(--l2)" }, space: { name: "Space", color: "var(--l3)" },
  slicer: { name: "Slicer", color: "var(--l6)" }, graph: { name: "Graph", color: "var(--l7)" },
  meter: { name: "Meter", color: "var(--l1)" }, code: { name: "Code", color: "var(--l0)" },
};
