import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { makeResume, renderApp } from "@/test/render";

describe("resumes page", () => {
  it("re-reads a resume parsed by an older parser before using it for the profile", async () => {
    const { resumes, profile } = renderApp("/resumes", {
      authenticated: true,
      resumes: [makeResume({ id: "r1", file_name: "cv.pdf", parser_outdated: true })],
    });
    expect(await screen.findByText(/Read with an older version of our resume reader/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Use for profile/ }));
    expect(screen.getByText(/re-read the file with the latest resume reader first/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Replace profile" }));
    await waitFor(() => expect(profile.importResume).toHaveBeenCalledWith("r1"), { timeout: 3000 });
    expect(resumes.reprocess).toHaveBeenCalledWith("r1");
    expect(resumes.reprocess.mock.invocationCallOrder[0]!).toBeLessThan(profile.importResume.mock.invocationCallOrder[0]!);
  });

  it("imports an up-to-date resume directly", async () => {
    const { resumes, profile } = renderApp("/resumes", { authenticated: true, resumes: [makeResume({ id: "r1" })] });
    await userEvent.click(await screen.findByRole("button", { name: /Use for profile/ }));
    await userEvent.click(screen.getByRole("button", { name: "Replace profile" }));
    await waitFor(() => expect(profile.importResume).toHaveBeenCalledWith("r1"));
    expect(resumes.reprocess).not.toHaveBeenCalled();
  });
});
