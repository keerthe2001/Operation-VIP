// Serves the Pyodide runtime from our own origin (public/pyodide), so the code sandbox
// doesn't depend on a third-party CDN at runtime.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const src = dirname(require.resolve("pyodide/package.json"));
const dest = join(process.cwd(), "public", "pyodide");
const files = ["pyodide.mjs", "pyodide.asm.mjs", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];
mkdirSync(dest, { recursive: true });
for (const f of files) {
  if (!existsSync(join(src, f))) throw new Error(`pyodide file missing: ${f}`);
  cpSync(join(src, f), join(dest, f));
}
console.log(`pyodide copied to ${dest}`);
