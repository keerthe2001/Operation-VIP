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

describe("Ashby choices", () => {
  it("tells value-less radios apart and fills the intended one", async () => {
    const { fillField } = await import("@/content/autofill/writer");
    const sample = SAMPLES.find((s) => s.name.startsWith("Ashby"))!;
    document.body.innerHTML = sample.html;
    const gender = scanFields().find((f) => f.label === "Gender")!;
    const decline = gender.options.find((o) => o.label === "Decline to self-identify")!;
    expect(new Set(gender.options.map((o) => o.value)).size).toBe(3); // not three times "on"
    const result = await fillField({ id: gender.id, kind: "radio", value: decline.label, optionValue: decline.value, overwrite: true });
    expect(result.status).toBe("filled");
    expect(scanFields().find((f) => f.label === "Gender")!.currentValue).toBe("Decline to self-identify");
  });

  it("answers Yes/No toggle buttons", async () => {
    const { fillField } = await import("@/content/autofill/writer");
    document.body.innerHTML = SAMPLES.find((s) => s.name.startsWith("Ashby"))!.html;
    document.querySelectorAll("button[aria-pressed]").forEach((b) => b.addEventListener("click", () => {
      b.parentElement!.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    }));
    const toggle = scanFields().find((f) => /sponsor/.test(f.label))!;
    const no = toggle.options.find((o) => o.label === "No")!;
    await fillField({ id: toggle.id, kind: "radio", value: "No", optionValue: no.value, overwrite: true });
    expect(scanFields().find((f) => /sponsor/.test(f.label))!.currentValue).toBe("No");
  });
});

describe("home-made forms", () => {
  it("fills a 'Please select' button dropdown whose options are plain elements", async () => {
    const { fillField } = await import("@/content/autofill/writer");
    document.body.innerHTML = SAMPLES.find((s) => s.name.startsWith("Custom React form"))!.html;
    const button = [...document.querySelectorAll("button")].find((b) => /Please select/.test(b.textContent ?? ""))!;
    // The menu appears when the button is pressed, as plain divs with no roles.
    button.addEventListener("click", () => {
      const menu = document.createElement("div");
      menu.innerHTML = `<div class="opt">Male</div><div class="opt">Female</div><div class="opt">Decline to self-identify</div>`;
      menu.querySelectorAll(".opt").forEach((o) => o.addEventListener("click", () => { button.textContent = o.textContent; menu.remove(); }));
      document.body.append(menu);
    });
    const gender = scanFields().find((f) => f.label === "Gender")!;
    expect(gender.kind).toBe("listbox");
    const result = await fillField({ id: gender.id, kind: "listbox", value: "Decline to self identify", optionValue: null, overwrite: true });
    expect(result.status).toBe("filled");
    expect(button.textContent).toBe("Decline to self-identify");
  });

  it("answers name-less radio groups and treats 'Apply and save' on a form as the final submit", async () => {
    const { fillField } = await import("@/content/autofill/writer");
    const { actionKind, actionText, findAction } = await import("@/content/forms/scanner");
    document.body.innerHTML = SAMPLES.find((s) => s.name.startsWith("Custom React form"))!.html;
    const sponsor = scanFields().find((f) => /sponsorship/.test(f.label))!;
    expect(sponsor.options.map((o) => o.label)).toEqual(["Yes", "No", "N/A"]);
    const no = sponsor.options.find((o) => o.label === "No")!;
    await fillField({ id: sponsor.id, kind: "radio", value: "No", optionValue: no.value, overwrite: true });
    expect((document.getElementById("r2") as HTMLInputElement).checked).toBe(true);
    expect((document.getElementById("r1") as HTMLInputElement).checked).toBe(false);
    expect(actionKind(actionText(findAction()!), true)).toBe("submit"); // never pressed without the user's OK
    expect(actionKind("Apply", false)).toBe("start");
  });
});
