import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderApp } from "@/test/render";

describe("connect extension", () => {
  it("explains how to install when the extension is missing", async () => {
    renderApp("/extension/connect", { authenticated: true });
    expect(await screen.findByText(/couldn't find the extension/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Connect extension/ })).not.toBeInTheDocument();
  });

  it("hands a fresh session to the installed extension", async () => {
    const { extension, extensionBridge } = renderApp("/extension/connect", {
      authenticated: true,
      extension: { installed: true, signedIn: false },
    });
    await userEvent.click(await screen.findByRole("button", { name: /Connect extension/ }));
    await waitFor(() => expect(extensionBridge.connect).toHaveBeenCalledWith("refresh-token-for-extension-xxxxxxxx"));
    expect(extension.handoffToken).toHaveBeenCalled();
    expect(await screen.findByText(/Connected. Open the Copilot side panel/)).toBeInTheDocument();
  });

  it("shows extension errors", async () => {
    const { extensionBridge } = renderApp("/extension/connect", {
      authenticated: true,
      extension: { installed: true, signedIn: false },
    });
    extensionBridge.connect.mockResolvedValueOnce({ ok: false, error: "The connection link expired." } as never);
    await userEvent.click(await screen.findByRole("button", { name: /Connect extension/ }));
    expect(await screen.findByText("The connection link expired.")).toBeInTheDocument();
  });
});
