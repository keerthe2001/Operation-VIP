import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { emptyProfile, makeResume, renderApp } from "@/test/render";

function extractedProfile() {
  const profile = emptyProfile();
  profile.personal_information = { full_name: "Priya Raman", email: "priya@example.com", phone: "+919876543210" };
  profile.field_meta = {
    "personal_information.full_name": { confidence: 0.9, source: "Priya Raman", is_confirmed: false },
    "personal_information.email": { confidence: 0.97, source: "priya@example.com", is_confirmed: false },
  };
  profile.experience = [
    {
      company_name: "Acme", designation: "Engineer", employment_type: null, location: null,
      start_date: "2021-01", end_date: null, is_current: true, responsibilities: ["Built APIs"],
      achievements: [], technologies: ["Python"], confidence: 0.8, is_confirmed: false,
    },
  ];
  profile.completion = { percentage: 55, sections: {}, items: [], unconfirmed_fields: 3 };
  return profile;
}

describe("profile review", () => {
  it("marks extracted fields for review and confirms edits on save", async () => {
    const { profile } = renderApp("/profile", { authenticated: true, profile: extractedProfile() });

    expect(await screen.findByRole("heading", { name: "Your profile" })).toBeInTheDocument();
    expect(screen.getByText("3 to review")).toBeInTheDocument();
    const email = screen.getByLabelText("Email");
    expect(email).toHaveValue("priya@example.com");

    const saveButton = screen.getByRole("button", { name: "Save changes" });
    expect(saveButton).toBeDisabled();

    await userEvent.clear(email);
    await userEvent.type(email, "priya.r@example.com");
    expect(saveButton).toBeEnabled();
    await userEvent.click(saveButton);

    await waitFor(() => expect(profile.save).toHaveBeenCalledTimes(1));
    const saved = profile.save.mock.calls[0]![0];
    expect(saved.personal_information!.email).toBe("priya.r@example.com");
    expect(saved.field_meta!["personal_information.email"]!.is_confirmed).toBe(true);
    // Untouched fields stay unconfirmed.
    expect(saved.field_meta!["personal_information.full_name"]!.is_confirmed).toBe(false);
    expect(saved.experience![0]!.is_confirmed).toBe(false);
  });

  it("confirms everything at once", async () => {
    const { profile } = renderApp("/profile", { authenticated: true, profile: extractedProfile() });
    await userEvent.click(await screen.findByRole("button", { name: "Confirm all" }));
    await waitFor(() => expect(profile.save).toHaveBeenCalled());
    const saved = profile.save.mock.calls[0]![0];
    expect(Object.values(saved.field_meta!).every((m) => m.is_confirmed)).toBe(true);
    expect(saved.experience![0]!.is_confirmed).toBe(true);
  });

  it("validates dates and adds new items", async () => {
    const { profile } = renderApp("/profile", { authenticated: true, profile: emptyProfile() });
    const experience = await screen.findByRole("region", { name: "Work experience" });
    await userEvent.click(within(experience).getByRole("button", { name: "Add role" }));
    await userEvent.type(within(experience).getByLabelText("Job title"), "Designer");
    await userEvent.type(within(experience).getByLabelText("Start"), "Jan 2020");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await within(experience).findByText("Use YYYY or YYYY-MM")).toBeInTheDocument();
    expect(profile.save).not.toHaveBeenCalled();

    await userEvent.clear(within(experience).getByLabelText("Start"));
    await userEvent.type(within(experience).getByLabelText("Start"), "2020-01");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(profile.save).toHaveBeenCalled());
    const saved = profile.save.mock.calls[0]![0];
    expect(saved.experience).toEqual([
      expect.objectContaining({ designation: "Designer", start_date: "2020-01", is_confirmed: true }),
    ]);
  });

  it("adds skills as tags", async () => {
    const { profile } = renderApp("/profile", { authenticated: true, profile: emptyProfile() });
    const input = await screen.findByLabelText("Programming languages");
    await userEvent.type(input, "Python{enter}Go,");
    expect(screen.getByRole("button", { name: "Remove Python" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(profile.save).toHaveBeenCalled());
    expect(profile.save.mock.calls[0]![0].skills.programming_languages).toEqual(["Python", "Go"]);
  });
});

describe("dashboard and resumes", () => {
  it("shows the upload onboarding and uploads a file", async () => {
    const { resumes } = renderApp("/", { authenticated: true });
    await screen.findByText("Drag and drop your resume here");
    const input = screen.getByLabelText("Upload resume");
    await userEvent.upload(input, new File(["%PDF-1.7"], "cv.pdf", { type: "application/pdf" }));
    await waitFor(() => expect(resumes.upload).toHaveBeenCalled());
    expect(await screen.findByText(/We're reading “cv.pdf”/)).toBeInTheDocument();
  });

  it("rejects unsupported files before uploading", async () => {
    const { resumes } = renderApp("/", { authenticated: true });
    const input = await screen.findByLabelText("Upload resume");
    await userEvent.upload(input, new File(["x"], "cv.exe"), { applyAccept: false });
    expect(await screen.findByText("Upload a PDF, DOC, DOCX, PNG or JPG file.")).toBeInTheDocument();
    expect(resumes.upload).not.toHaveBeenCalled();
  });

  it("deletes a resume after confirmation", async () => {
    const { resumes } = renderApp("/resumes", {
      authenticated: true,
      resumes: [makeResume({ status: "failed", error_message: "This PDF is password-protected." })],
    });
    expect(await screen.findByText("This PDF is password-protected.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete jane.pdf" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(resumes.remove).toHaveBeenCalledWith("r1"));
    expect(await screen.findByText("No resumes yet.")).toBeInTheDocument();
  });
});

describe("point editors", () => {
  it("edits project points one by one", async () => {
    const { profile } = renderApp("/profile", { authenticated: true, profile: emptyProfile() });
    const projects = await screen.findByRole("region", { name: "Projects" });
    await userEvent.click(within(projects).getByRole("button", { name: "Add project" }));
    await userEvent.type(within(projects).getByLabelText("Project name"), "Inventory Tracker");
    expect(within(projects).queryByLabelText("Technologies")).not.toBeInTheDocument();
    expect(within(projects).queryByLabelText("Outcomes")).not.toBeInTheDocument();

    await userEvent.type(within(projects).getByLabelText("Description point 1"), "Built a REST API{enter}Added scanning{enter}Typo");
    await userEvent.click(within(projects).getByRole("button", { name: "Delete description point 3" }));
    await userEvent.click(within(projects).getByRole("button", { name: "Add point" }));
    // An empty point is dropped on save.
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(profile.save).toHaveBeenCalled());
    expect(profile.save.mock.calls[0]![0].projects).toEqual([
      expect.objectContaining({ project_name: "Inventory Tracker", points: ["Built a REST API", "Added scanning"] }),
    ]);
  });

  it("keeps achievements optional and removes empty points with backspace", async () => {
    renderApp("/profile", { authenticated: true, profile: emptyProfile() });
    const experience = await screen.findByRole("region", { name: "Work experience" });
    await userEvent.click(within(experience).getByRole("button", { name: "Add role" }));
    expect(within(experience).getByLabelText("Responsibilities point 1")).toBeInTheDocument();
    expect(within(experience).queryByLabelText("Achievements point 1")).not.toBeInTheDocument();
    await userEvent.click(within(experience).getByRole("button", { name: /Add achievements \(optional\)/ }));
    const achievement = within(experience).getByLabelText("Achievements point 1");
    await userEvent.type(achievement, "{backspace}");
    expect(within(experience).queryByLabelText("Achievements point 1")).not.toBeInTheDocument();
  });
});
