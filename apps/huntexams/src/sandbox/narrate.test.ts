import { describe, expect, it } from "vitest";

import { buildFrames, explainError } from "./narrate";
import type { TraceStep } from "./runner";

const v = (x: string, t = "int") => ({ v: x, t });
const main = (vars: Record<string, ReturnType<typeof v>>) => ({ name: "main", vars });

describe("buildFrames", () => {
  it("narrates created and changed variables and printed output", () => {
    const src = "x = 1\nx = 2\nprint(x)\n";
    const steps: TraceStep[] = [
      { event: "line", line: 1, stack: [main({})], out: "" },
      { event: "line", line: 2, stack: [main({ x: v("1") })], out: "" },
      { event: "line", line: 3, stack: [main({ x: v("2") })], out: "" },
      { event: "return", line: 3, stack: [main({ x: v("2") })], out: "2\n" },
    ];
    const frames = buildFrames(steps, src, null);
    expect(frames).toHaveLength(3);
    expect(frames[0]!.says).toBe("Creates x = 1.");
    expect(frames[0]!.changed).toEqual(["x"]);
    expect(frames[1]!.says).toBe("x changes from 1 to 2.");
    expect(frames[2]!.says).toBe('Prints "2".');
    expect(frames[2]!.newOut).toBe("2\n");
  });

  it("describes function calls and loops", () => {
    const src = "def f(a):\n    return a * 2\nfor i in [1]:\n    y = f(i)\n";
    const fn = (vars: Record<string, ReturnType<typeof v>>) => ({ name: "f", vars });
    const steps: TraceStep[] = [
      { event: "line", line: 1, stack: [main({})], out: "" },
      { event: "line", line: 3, stack: [main({ f: v("function f()", "function") })], out: "" },
      { event: "line", line: 4, stack: [main({ f: v("function f()", "function"), i: v("1") })], out: "" },
      { event: "line", line: 2, stack: [main({ i: v("1") }), fn({ a: v("1") })], out: "" },
      { event: "return", line: 2, stack: [main({ i: v("1") }), fn({ a: v("1") })], out: "", ret: "2" },
    ];
    const frames = buildFrames(steps, src, null);
    expect(frames[0]!.says).toMatch(/Defines f/);
    expect(frames[1]!.says).toBe("The loop takes the next item: i = 1.");
    expect(frames[2]!.says).toMatch(/Calls f\(\) with a = 1/);
    expect(frames[3]!.says).toMatch(/Returns 2/);
  });

  it("adds a final frame for errors", () => {
    const frames = buildFrames([{ event: "line", line: 1, stack: [main({})], out: "" }], "print(z)", {
      type: "NameError", message: "name 'z' is not defined", line: 1,
    });
    expect(frames.at(-1)!.error?.type).toBe("NameError");
  });
});

describe("explainError", () => {
  it("rewrites common errors in plain words", () => {
    expect(explainError({ type: "NameError", message: "name 'totl' is not defined", line: 3 })).toMatch(/doesn't know anything called totl/);
    expect(explainError({ type: "IndexError", message: "list index out of range", line: 1 })).toMatch(/Positions start at 0/);
  });
});
