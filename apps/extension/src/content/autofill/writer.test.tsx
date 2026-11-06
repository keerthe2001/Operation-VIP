import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { fillField, fillFields } from "@/content/autofill/writer";
import { scanFields } from "@/content/forms/scanner";
import type { FillInstruction } from "@/shared/fields";

function instruction(id: string, kind: FillInstruction["kind"], value: string | null, optionValue: string | null = null, extra: Partial<FillInstruction> = {}): FillInstruction {
  return { id, kind, value, optionValue, overwrite: false, ...extra };
}

function ReactForm() {
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [sponsor, setSponsor] = useState("");
  const [about, setAbout] = useState("");
  const [agree, setAgree] = useState(false);
  return (
    <form>
      <label htmlFor="first">First name</label>
      <input id="first" value={name} onChange={(e) => setName(e.target.value)} />
      <label htmlFor="country">Country</label>
      <select id="country" value={country} onChange={(e) => setCountry(e.target.value)}>
        <option value="">Select…</option>
        <option value="in">India</option>
        <option value="us">United States</option>
      </select>
      <fieldset>
        <legend>Will you require sponsorship?</legend>
        <label><input type="radio" name="sponsor" value="yes" checked={sponsor === "yes"} onChange={() => setSponsor("yes")} /> Yes</label>
        <label><input type="radio" name="sponsor" value="no" checked={sponsor === "no"} onChange={() => setSponsor("no")} /> No</label>
      </fieldset>
      <label htmlFor="about">About you</label>
      <textarea id="about" value={about} onChange={(e) => setAbout(e.target.value)} />
      <label><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> Subscribe to updates</label>
      <output data-testid="state">{JSON.stringify({ name, country, sponsor, about, agree })}</output>
    </form>
  );
}

describe("scanner", () => {
  it("describes controls, groups radios and skips non-fillable inputs", () => {
    document.body.innerHTML = `
      <form>
        <label for="a">Email *</label><input id="a" type="email" name="email" required autocomplete="email">
        <input type="hidden" name="token"><input type="password" name="pw" value="secret"><input type="submit">
        <input name="honeypot_field"><input disabled name="x"><div hidden><input name="hidden_one"></div>
        <label for="s">Degree</label><select id="s"><option value="">Choose</option><option value="bs">BSc</option></select>
        <fieldset><legend>Relocate?</legend>
          <label><input type="radio" name="r" value="y">Yes</label><label><input type="radio" name="r" value="n" checked>No</label>
        </fieldset>
        <input type="file" id="cv" aria-label="Resume/CV" accept=".pdf">
        <div contenteditable="true" aria-label="Cover letter"></div>
      </form>`;
    const fields = scanFields();
    expect(fields.map((f) => [f.kind, f.label])).toEqual([
      ["email", "Email *"],
      ["password", "pw"],
      ["select", "Degree"],
      ["radio", "Relocate?"],
      ["file", "Resume/CV"],
      ["contenteditable", "Cover letter"],
    ]);
    expect(fields[0]).toMatchObject({ required: true, autocomplete: "email", name: "email" });
    // Password boxes are reported as filled or empty, never with their content.
    expect(fields[1]!.currentValue).toBe("••••••••");
    expect(fields[2]!.options).toEqual([{ value: "", label: "Choose" }, { value: "bs", label: "BSc" }]);
    expect(fields[3]).toMatchObject({ options: [{ value: "y", label: "Yes" }, { value: "n", label: "No" }], currentValue: "No" });
    expect(fields[4]!.accept).toBe(".pdf");
    // IDs are stable across scans.
    expect(scanFields().map((f) => f.id)).toEqual(fields.map((f) => f.id));
  });

  it("finds fields inside open shadow roots", () => {
    document.body.innerHTML = `<div id="host"></div>`;
    const root = document.getElementById("host")!.attachShadow({ mode: "open" });
    root.innerHTML = `<label for="p">Phone</label><input id="p" type="tel">`;
    expect(scanFields().map((f) => f.label)).toEqual(["Phone"]);
  });
});

describe("writer", () => {
  it("updates React-controlled inputs, selects, radios, textareas and checkboxes", async () => {
    render(<ReactForm />);
    const byLabel = Object.fromEntries(scanFields().map((f) => [f.label, f]));
    const results = await act(() =>
      fillFields([
        instruction(byLabel["First name"]!.id, "text", "Priya"),
        instruction(byLabel["Country"]!.id, "select", "India", "in"),
        instruction(byLabel["Will you require sponsorship?"]!.id, "radio", "No", "no"),
        instruction(byLabel["About you"]!.id, "textarea", "Backend engineer"),
        instruction(byLabel["Subscribe to updates"]!.id, "checkbox", "Yes", "true", { checked: true }),
      ]),
    );
    expect(results.map((r) => r.status)).toEqual(["filled", "filled", "filled", "filled", "filled"]);
    expect(JSON.parse(screen.getByTestId("state").textContent!)).toEqual({
      name: "Priya", country: "in", sponsor: "no", about: "Backend engineer", agree: true,
    });
  });

  it("does not overwrite user-entered values unless allowed", async () => {
    document.body.innerHTML = `<label for="e">Email</label><input id="e" value="mine@example.com">`;
    const [field] = scanFields();
    expect(await fillField(instruction(field!.id, "text", "other@example.com"))).toMatchObject({ status: "skipped" });
    expect((document.getElementById("e") as HTMLInputElement).value).toBe("mine@example.com");
    expect(await fillField(instruction(field!.id, "text", "other@example.com", null, { overwrite: true }))).toMatchObject({ status: "filled" });
    expect((document.getElementById("e") as HTMLInputElement).value).toBe("other@example.com");
  });

  it("reports missing options and vanished fields", async () => {
    document.body.innerHTML = `<label for="s">Degree</label><select id="s"><option value="a">A</option></select>`;
    const [field] = scanFields();
    expect(await fillField(instruction(field!.id, "select", "B", "b"))).toMatchObject({ status: "failed", message: "Option not found" });
    expect(await fillField(instruction("f99999", "text", "x"))).toMatchObject({ status: "failed" });
  });

  it("types into custom comboboxes and picks the matching option", async () => {
    document.body.innerHTML = `<label for="c">Country</label><input id="c" role="combobox" aria-controls="list"><ul id="list" role="listbox"></ul>`;
    const input = document.getElementById("c") as HTMLInputElement;
    let picked = "";
    input.addEventListener("input", () => {
      // Like most dropdown libraries: options appear asynchronously after typing.
      setTimeout(() => {
        document.getElementById("list")!.innerHTML = `<li role="option">Indonesia</li><li role="option">India</li>`;
        for (const option of document.querySelectorAll("[role=option]")) {
          option.addEventListener("mousedown", () => (picked = option.textContent!));
        }
      }, 50);
    });
    const [field] = scanFields();
    expect(field!.kind).toBe("combobox");
    const result = await fillField(instruction(field!.id, "combobox", "India"));
    expect(result.message ?? "").toBe("");
    expect(result).toMatchObject({ status: "filled" });
    expect(picked).toBe("India");
  });

  it("fills contenteditable editors", async () => {
    document.body.innerHTML = `<div contenteditable="true" aria-label="Cover letter"></div>`;
    const [field] = scanFields();
    await fillField(instruction(field!.id, "contenteditable", "Hello"));
    expect(document.querySelector("[contenteditable]")!.textContent).toBe("Hello");
  });
});
