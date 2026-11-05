import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api/errors";
import { renderApp } from "@/test/render";

describe("authentication flow", () => {
  it("redirects anonymous users to login", async () => {
    const { router } = renderApp("/");
    expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/login");
  });

  it("shows client-side validation errors", async () => {
    const { auth } = renderApp("/login");
    await userEvent.click(await screen.findByRole("button", { name: "Sign in" }));
    expect(await screen.findByText("Enter your email")).toBeInTheDocument();
    expect(screen.getByText("Enter your password")).toBeInTheDocument();
    expect(auth.login).not.toHaveBeenCalled();
  });

  it("signs in and lands on the dashboard", async () => {
    const { auth, router } = renderApp("/login");
    await userEvent.type(await screen.findByLabelText("Email"), "jane@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "correct-horse-battery");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("heading", { name: "Welcome, Jane" })).toBeInTheDocument();
    expect(auth.login).toHaveBeenCalledWith({ email: "jane@example.com", password: "correct-horse-battery" });
    expect(router.state.location.pathname).toBe("/");
  });

  it("shows the server message when credentials are wrong", async () => {
    const { auth } = renderApp("/login");
    auth.login.mockRejectedValueOnce(new ApiError(401, "INVALID_CREDENTIALS", "Incorrect email or password."));
    await userEvent.type(await screen.findByLabelText("Email"), "jane@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "wrong-password");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password.");
  });

  it("maps server validation errors onto register fields", async () => {
    const { auth } = renderApp("/register");
    auth.register.mockRejectedValueOnce(
      new ApiError(422, "VALIDATION_ERROR", "Some fields are invalid.", [
        { field: "email", message: "This domain is not allowed" },
      ]),
    );
    await userEvent.type(await screen.findByLabelText("Email"), "jane@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "long-enough-pass");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("This domain is not allowed")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("registers with an optional name and signs out", async () => {
    const { auth } = renderApp("/register");
    await userEvent.type(await screen.findByLabelText("Email"), "jane@example.com");
    await userEvent.type(screen.getByLabelText("Password"), "long-enough-pass");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(auth.register).toHaveBeenCalledWith({
      email: "jane@example.com",
      password: "long-enough-pass",
      full_name: null,
    });

    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument());
  });

  it("keeps authenticated users away from the login page", async () => {
    const { router } = renderApp("/login", { authenticated: true });
    expect(await screen.findByText("Getting started")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });
});
