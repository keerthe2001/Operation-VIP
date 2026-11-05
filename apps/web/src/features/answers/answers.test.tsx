import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { emptyProfile, renderApp } from "@/test/render";

function profileWithTitle() {
  const profile = emptyProfile();
  profile.professional_summary = { current_designation: "Senior Engineer" };
  return profile;
}

describe("answer library", () => {
  it("adds a template as is", async () => {
    const { answers } = renderApp("/answers", { authenticated: true });
    expect(await screen.findByText("No saved answers yet. Start from a template below or write your own.")).toBeInTheDocument();
    await userEvent.click(await screen.findByRole("button", { name: "Add as is" }));
    await waitFor(() => expect(answers.create).toHaveBeenCalledWith(expect.objectContaining({ category: "why_company" })));
    expect(await screen.findByText("Needs personalizing")).toBeInTheDocument();
  });

  it("writes a new answer with placeholders and a live preview", async () => {
    const { answers } = renderApp("/answers", { authenticated: true, profile: profileWithTitle() });
    await userEvent.click(await screen.findByRole("button", { name: "New answer" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Question"), "Why do you want this job?");
    await userEvent.type(within(dialog).getByLabelText("Answer"), "As a ");
    await userEvent.click(await within(dialog).findByRole("button", { name: "{current_designation}" }));
    await userEvent.type(within(dialog).getByLabelText("Answer"), " I'd fit {{company}.");
    expect(within(dialog).getByText("As a Senior Engineer I'd fit Acme Corp.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Add variant" }));
    await userEvent.type(within(dialog).getByLabelText("Variant 1"), "Short version");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save answer" }));
    await waitFor(() =>
      expect(answers.create).toHaveBeenCalledWith({
        category: "other",
        question_text: "Why do you want this job?",
        answer_template: "As a {current_designation} I'd fit {company}.",
        variants: ["Short version"],
      }),
    );
  });

  it("edits and deletes answers", async () => {
    const existing = { id: "a1", category: "strengths" as const, question_text: "Strengths?", answer_template: "Focus.", variants: [], usage_count: 3, created_at: "", updated_at: "" };
    const { answers } = renderApp("/answers", { authenticated: true, answers: [existing] });
    expect(await screen.findByText("Used 3 times")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Edit answer to “Strengths?”" }));
    const answerBox = within(await screen.findByRole("dialog")).getByLabelText("Answer");
    await userEvent.clear(answerBox);
    await userEvent.type(answerBox, "Persistence.");
    await userEvent.click(screen.getByRole("button", { name: "Save answer" }));
    await waitFor(() => expect(answers.update).toHaveBeenCalledWith("a1", expect.objectContaining({ answer_template: "Persistence." })));

    await userEvent.click(await screen.findByRole("button", { name: "Delete answer to “Strengths?”" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(answers.remove).toHaveBeenCalledWith("a1"));
  });
});
