import { describe, expect, it } from "vitest";

import { bestOption } from "@/content/autofill/writer";
import { bestGuess } from "@/mapping/best-guess";
import { mapFields } from "@/mapping/engine";
import type { FieldDescriptor, MappedField } from "@/shared/fields";
import { makeProfile } from "@/test/profile-fixture";

const opts = (...labels: string[]) => labels.map((label, i) => ({ value: `v${i}`, label }));
function field(label: string, extra: Partial<MappedField> = {}): MappedField {
  return {
    id: label, frameId: 0, kind: "radio", label, name: "", htmlId: "", placeholder: "", autocomplete: "", helpText: "",
    required: false, options: [], currentValue: "", accept: "", maxLength: null, key: null, confidence: 0, status: "unmapped",
    value: null, optionValue: null, ...extra,
  };
}

describe("best-guess answers", () => {
  const context = { company: "Caterpillar", employers: ["Sify Technologies"] };

  it("ticks required consent boxes but never marketing opt-ins", () => {
    const [consent, optional, marketing] = bestGuess(
      [
        field("I accept the privacy statement *", { kind: "checkbox", required: true }),
        field("I agree to the terms", { kind: "checkbox" }),
        field("Send me job alerts and marketing emails", { kind: "checkbox", required: true }),
      ],
      context,
    );
    expect(consent).toMatchObject({ status: "auto", optionValue: "true" });
    expect(optional!.status).toBe("unmapped");
    expect(marketing!.status).toBe("unmapped");
  });

  it("uses the form's own 'prefer not to say' for self-identification without a profile answer", () => {
    const [gender] = bestGuess(
      [field("Gender", { key: "gender", status: "missing", options: opts("Male", "Female", "I don't wish to answer") })],
      context,
    );
    expect(gender).toMatchObject({ status: "auto", value: "I don't wish to answer", optionValue: "v2" });
  });

  it("answers 'worked here before?' from the work history and marketing questions with No", () => {
    const [worked, updates] = bestGuess(
      [
        field("Have you previously worked for Caterpillar Inc. or any subsidiaries?", { options: opts("Yes", "No") }),
        field("Would you like to join our talent community for future opportunities?", { options: opts("Yes", "No") }),
      ],
      context,
    );
    expect(worked).toMatchObject({ status: "auto", value: "No" });
    expect(updates).toMatchObject({ status: "auto", value: "No" });
  });
});

describe("dropdown option matching", () => {
  it("picks the closest option", () => {
    const options = ["India (+91)", "Indonesia (+62)", "United States of America (+1)"].map((text) => ({ text }));
    expect(bestOption(options, "India (+91)")?.text).toBe("India (+91)");
    expect(bestOption(options, "India")?.text).toBe("India (+91)");
    expect(bestOption([{ text: "Mobile" }, { text: "Landline" }], "Mobile")?.text).toBe("Mobile");
    expect(bestOption([{ text: "Yes" }, { text: "No" }], "Maybe")).toBeNull();
  });
});

describe("phone with a separate country code", () => {
  it("fills the country code and the national number", () => {
    const base = makeProfile();
    const profile = makeProfile({ personal_information: { ...base.personal_information, phone: "+91 98765 43210" } });
    const descriptor = (label: string, kind: FieldDescriptor["kind"] = "text"): FieldDescriptor => ({
      id: label, kind, label, name: "", htmlId: "", placeholder: "", autocomplete: "", helpText: "", required: true,
      options: [], currentValue: "", accept: "", maxLength: null,
    });
    const [code, number, type] = mapFields(
      [descriptor("Country / Territory Phone Code", "listbox"), descriptor("Phone Number"), descriptor("Phone Device Type", "listbox")],
      0,
      profile,
      null,
    );
    expect(code).toMatchObject({ key: "phone_country", value: "India (+91)" });
    expect(number).toMatchObject({ key: "phone", value: "9876543210" });
    expect(type).toMatchObject({ key: "phone_type", value: "Mobile" });
  });
});
