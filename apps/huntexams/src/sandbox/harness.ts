// Python that runs inside Pyodide (in a Web Worker) to execute and trace learner code.
// Kept as a string so it ships with the worker bundle.
export const HARNESS = String.raw`
import sys, io, json, types, traceback, contextlib, builtins

MAX_OUT = 20000

class StepLimit(Exception):
    pass

def _short(v):
    try:
        if isinstance(v, types.ModuleType):
            return None
        if isinstance(v, types.FunctionType):
            return "function " + v.__name__ + "()"
        if isinstance(v, type):
            return "class " + v.__name__
        r = repr(v)
    except Exception:
        r = "<?>"
    return r if len(r) <= 140 else r[:137] + "..."

def _scope(d):
    out = {}
    for k, v in list(d.items()):
        if k.startswith("__") or k in ("input",):
            continue
        s = _short(v)
        if s is not None:
            out[k] = {"v": s, "t": type(v).__name__}
    return out

def _no_input(*a, **k):
    raise RuntimeError("input() isn't available in the sandbox. Put the value in a variable instead.")

def _none(x):
    # Pyodide passes JavaScript null as a JsNull object, not None.
    return None if x is None or type(x).__name__ in ("JsNull", "JsUndefined") else x

def run_user(src, trace=False, tests=None, check=None, max_steps=2500):
    tests, check = _none(tests), _none(check)
    if check is not None and not isinstance(check, dict):
        check = check.to_py()
    out = io.StringIO()
    ns = {"__name__": "__main__", "input": _no_input}
    steps = []
    err = None

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != "<lesson>":
            return None
        if event in ("line", "return", "exception"):
            if len(steps) >= max_steps:
                raise StepLimit()
            stack = []
            f = frame
            while f is not None and f.f_code.co_filename == "<lesson>":
                name = f.f_code.co_name
                stack.append({"name": "main" if name == "<module>" else name,
                              "vars": _scope(f.f_locals if name != "<module>" else f.f_globals)})
                f = f.f_back
            step = {"event": event, "line": frame.f_lineno, "stack": stack[::-1],
                    "out": out.getvalue()[-MAX_OUT:]}
            if event == "return" and frame.f_code.co_name != "<module>":
                step["ret"] = _short(arg)
            steps.append(step)
        return tracer

    try:
        code = compile(src, "<lesson>", "exec")
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
            if trace:
                sys.settrace(tracer)
            try:
                exec(code, ns)
            finally:
                sys.settrace(None)
    except StepLimit:
        err = {"type": "StepLimit", "line": steps[-1]["line"] if steps else None,
               "message": "Stopped after %d steps. Is there a loop that never ends?" % max_steps}
    except SyntaxError as e:
        err = {"type": "SyntaxError", "message": e.msg or "invalid syntax", "line": e.lineno}
    except BaseException as e:
        tb = traceback.extract_tb(e.__traceback__)
        line = next((fr.lineno for fr in reversed(tb) if fr.filename == "<lesson>"), None)
        err = {"type": type(e).__name__, "message": str(e), "line": line}

    stdout = out.getvalue()[-MAX_OUT:]
    result = {"stdout": stdout, "error": err, "steps": steps if trace else None,
              "vars": _scope(ns), "test": None, "check": None}

    ns["__stdout__"] = stdout
    if tests is not None:
        if err is not None:
            result["test"] = {"passed": False, "message": "Fix the error first: " + err["type"]}
        else:
            try:
                with contextlib.redirect_stdout(io.StringIO()):
                    exec(compile(tests, "<tests>", "exec"), ns)
                result["test"] = {"passed": True, "message": "All checks passed."}
            except AssertionError as e:
                result["test"] = {"passed": False, "message": str(e) or "A check failed."}
            except BaseException as e:
                result["test"] = {"passed": False, "message": "%s: %s" % (type(e).__name__, e)}

    if check is not None:
        ok, message = True, ""
        if err is not None and check.get("expr") is not None:
            ok, message = False, "Your code stopped with an error. Fix it first."
        if ok and check.get("stdout") is not None and check["stdout"] not in stdout:
            ok = False
        if ok and check.get("expr"):
            try:
                ok = bool(eval(check["expr"], ns))
            except BaseException:
                ok = False
        result["check"] = {"passed": ok, "message": message or ("" if ok else check.get("fail", ""))}

    return json.dumps(result)
`;
