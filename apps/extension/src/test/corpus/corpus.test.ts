import { describe, expect, it } from "vitest";

import { scanFields } from "@/content/forms/scanner";
import { mapFields } from "@/mapping/engine";
import { makeProfile } from "@/test/profile-fixture";

import { SAMPLES } from "./samples";

const outcome = (f: { key: string | null; status: string }) => (f.status === "question" ? "question" : f.key);

describe("recognition across ATS and career-page samples", () => {
  const results: { sample: string; total: number; wrong: string[] }[] = [];

  it.each(SAMPLES.map((s) => [s.name, s] as const))("%s", (_name, sample) => {
    document.body.innerHTML = sample.html;
    const mapped = mapFields(scanFields(), 0, makeProfile(), "priya.pdf");
    expect(mapped.length, `${sample.name}: fields found`).toBe(sample.expect.length);
    const wrong = sample.expect
      .map(([label, key], i) => ({ label, key, got: outcome(mapped[i]!) }))
      .filter((r) => r.got !== r.key)
      .map((r) => `${r.label}: expected ${r.key}, got ${r.got}`);
    results.push({ sample: sample.name, total: sample.expect.length, wrong });
    expect(wrong, sample.name).toEqual([]);
  });

  it("reports overall accuracy", () => {
    const total = results.reduce((sum, r) => sum + r.total, 0);
    const wrong = results.reduce((sum, r) => sum + r.wrong.length, 0);
    console.info(`Field recognition: ${total - wrong}/${total} across ${results.length} samples`);
    expect(total).toBeGreaterThan(100);
  });
});

describe("Workday validation errors", () => {
  it("reads the error under a date and the page's error banner", async () => {
    const { pageErrors } = await import("@/content/forms/scanner");
    const sample = SAMPLES.find((s) => s.name.startsWith("Workday · My Experience"))!;
    document.body.innerHTML = `<div data-automation-id="errorBanner"><h2 data-automation-id="errorHeading">Errors Found</h2></div>${sample.html}`;
    const from = scanFields().find((f) => f.automationId?.includes("dateSectionMonth") && f.error);
    expect(from?.error).toContain("month must be between 1 and 12");
    expect(pageErrors().join(" ")).toContain("Errors Found");
  });
});

describe("live-site details", () => {
  it("names Workday's account buttons by the real button behind the click overlay", async () => {
    const { actionKind, actionText, findAction, findCreateAccount, findSignIn } = await import("@/content/forms/scanner");
    const signIn = SAMPLES.find((s) => s.name.startsWith("Workday · Sign In"))!;
    document.body.innerHTML = `<header data-automation-id="utilityButtonBar"><button data-automation-id="utilityButtonSignIn">Sign In</button></header>${signIn.html}`;
    const action = findAction()!;
    expect(action.getAttribute("data-automation-id")).toBe("click_filter");
    expect(actionText(action)).toBe("Sign In");
    expect(actionKind(actionText(action))).toBe("account"); // never mistaken for the final Submit
    expect(findCreateAccount()?.getAttribute("data-automation-id")).toBe("createAccountLink");

    const create = SAMPLES.find((s) => s.name === "Workday · Create Account")!;
    document.body.innerHTML = `<header data-automation-id="utilityButtonBar"><button data-automation-id="utilityButtonSignIn">Sign In</button></header>${create.html}`;
    expect(actionText(findAction()!)).toBe("Create Account");
    expect(findSignIn()?.getAttribute("data-automation-id")).toBe("signInLink"); // not the header's
  });

  it("starts Workday's application from its dialog and offers email sign-in over SSO", async () => {
    const { actionKind, actionText, findAction } = await import("@/content/forms/scanner");
    document.body.innerHTML = `<div role="dialog"><h2>Start Your Application</h2><a data-automation-id="autofillWithResume">Autofill with Resume</a><a data-automation-id="applyManually">Apply Manually</a></div>`;
    expect(actionKind(actionText(findAction()!))).toBe("start");
    document.body.innerHTML = `<button data-automation-id="GoogleSignInButton">Sign in with Google</button><button data-automation-id="SignInWithEmailButton">Sign in with email</button>`;
    expect(actionText(findAction()!)).toBe("Sign in with email");
  });

  it("reads what a react-select shows as chosen", () => {
    document.body.innerHTML = `<label id="g-label" for="g">Gender</label><div class="select__control"><div class="select__value-container"><div class="select__single-value">Decline To Self Identify</div><div class="select__input-container"><input id="g" role="combobox" aria-labelledby="g-label" value=""></div></div></div>`;
    expect(scanFields()[0]).toMatchObject({ kind: "combobox", currentValue: "Decline To Self Identify" });
  });
});
