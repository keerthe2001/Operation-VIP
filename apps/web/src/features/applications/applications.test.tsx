import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { makeApplication, renderApp } from "@/test/render";

const apps = [
  makeApplication(),
  makeApplication({ id: "app2", company_name: "Globex", job_title: "Product Designer", status: "interview", portal: "lever" }),
  makeApplication({ id: "app3", company_name: "Initech", job_title: "Data Analyst", status: "rejected", portal: "workday" }),
];

describe("applications tracker", () => {
  it("shows stats, analytics and the list", async () => {
    renderApp("/applications", { authenticated: true, applications: apps });
    expect(await screen.findByText("Backend Engineer")).toBeInTheDocument();
    const total = screen.getByText("Total").nextSibling;
    expect(total).toHaveTextContent("3");
    expect(screen.getByText("Response rate").nextSibling).toHaveTextContent("100%");
    expect(screen.getByText("Applications per week")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /Applications started per week/ })).toBeInTheDocument();
  });

  it("filters by status and searches", async () => {
    renderApp("/applications", { authenticated: true, applications: apps });
    await screen.findByText("Backend Engineer");
    await userEvent.click(screen.getByRole("tab", { name: "Interview" }));
    await waitFor(() => expect(screen.queryByText("Backend Engineer")).not.toBeInTheDocument());
    expect(screen.getByText("Product Designer")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("tab", { name: "All" }));
    await userEvent.type(screen.getByPlaceholderText("Search company or title"), "initech");
    await waitFor(() => expect(screen.queryByText("Product Designer")).not.toBeInTheDocument());
    expect(screen.getByText("Data Analyst")).toBeInTheDocument();
  });

  it("changes status inline", async () => {
    const { applications } = renderApp("/applications", { authenticated: true, applications: apps });
    await userEvent.selectOptions(await screen.findByLabelText("Status of Backend Engineer"), "submitted");
    await waitFor(() => expect(applications.update).toHaveBeenCalledWith("app1", { status: "submitted" }));
  });

  it("opens details from a deep link and saves notes", async () => {
    const { applications } = renderApp("/applications?id=app1", { authenticated: true, applications: apps });
    const dialog = await screen.findByRole("dialog");
    expect(await within(dialog).findByText(/jane\.pdf/)).toBeInTheDocument();
    expect(within(dialog).getByText(/automatically/)).toBeInTheDocument();
    await userEvent.type(within(dialog).getByLabelText("Notes"), "Call with recruiter on Friday");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save notes" }));
    await waitFor(() => expect(applications.update).toHaveBeenCalledWith("app1", { notes: "Call with recruiter on Friday" }));
  });

  it("adds an application manually", async () => {
    const { applications } = renderApp("/applications", { authenticated: true });
    expect(await screen.findByText(/No applications yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add application" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("Job link"), "https://jobs.lever.co/globex/1");
    await userEvent.type(within(dialog).getByLabelText("Company"), "Globex");
    await userEvent.click(within(dialog).getByRole("button", { name: "Add application" }));
    await waitFor(() =>
      expect(applications.create).toHaveBeenCalledWith({ job_url: "https://jobs.lever.co/globex/1", company_name: "Globex", job_title: null, status: "submitted" }),
    );
    expect(await screen.findByText("Untitled position")).toBeInTheDocument();
  });
});
