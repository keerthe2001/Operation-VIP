import { python } from "@codemirror/lang-python";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { basicSetup } from "codemirror";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

const style = HighlightStyle.define([
  { tag: t.keyword, color: "#f5c451" },
  { tag: [t.string, t.special(t.string)], color: "#86efac" },
  { tag: t.comment, color: "#6b7f74", fontStyle: "italic" },
  { tag: [t.number, t.bool, t.null], color: "#fda4af" },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: "#7dd3fc" },
  { tag: t.definition(t.variableName), color: "#e5eee8" },
  { tag: t.operator, color: "#c7d5cc" },
]);

export type EditorHandle = {
  setValue: (v: string) => void;
  getValue: () => string;
  /** Types text at the end of the document, character by character, so learners see it being written. */
  typeAppend: (text: string, opts?: { replaceAll?: boolean }) => Promise<void>;
  focus: () => void;
};

type Props = { value: string; onChange?: (v: string) => void; onRun?: () => void; readOnly?: boolean; label?: string; minHeight?: number };

export const CodeEditor = forwardRef<EditorHandle, Props>(function CodeEditor({ value, onChange, onRun, readOnly, label = "Python code editor", minHeight = 160 }, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onRunRef = useRef(onRun);
  onChangeRef.current = onChange;
  onRunRef.current = onRun;
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  useEffect(() => {
    if (!host.current) return;
    const v = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          python(),
          syntaxHighlighting(style),
          EditorView.lineWrapping,
          EditorState.tabSize.of(4),
          EditorState.readOnly.of(Boolean(readOnly)),
          EditorView.contentAttributes.of({ "aria-label": label }),
          EditorView.theme({ "&": { minHeight: `${minHeight}px` }, ".cm-scroller": { minHeight: `${minHeight}px` } }),
          keymap.of([{ key: "Mod-Enter", run: () => { onRunRef.current?.(); return true; } }]),
          EditorView.updateListener.of((u) => { if (u.docChanged) onChangeRef.current?.(u.state.doc.toString()); }),
        ],
      }),
    });
    view.current = v;
    return () => { v.destroy(); view.current = null; };
    // The editor owns its document after mount; setValue updates it imperatively.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    setValue: (text: string) => {
      const v = view.current;
      if (!v) return;
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } });
    },
    getValue: () => view.current?.state.doc.toString() ?? "",
    focus: () => view.current?.focus(),
    typeAppend: async (text: string, opts?: { replaceAll?: boolean }) => {
      const v = view.current;
      if (!v) return;
      if (opts?.replaceAll) v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: "" } });
      if (reduce || text.length > 400) {
        const end = v.state.doc.length;
        v.dispatch({ changes: { from: end, insert: text }, selection: { anchor: end + text.length } });
        return;
      }
      for (const ch of text) {
        const end = v.state.doc.length;
        v.dispatch({ changes: { from: end, insert: ch }, selection: { anchor: end + 1 }, scrollIntoView: true });
        await new Promise((r) => setTimeout(r, ch === "\n" ? 60 : 18));
      }
    },
  }), [reduce]);

  return <div className="cm-host codebox" ref={host} />;
});
