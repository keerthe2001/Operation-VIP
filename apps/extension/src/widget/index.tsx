/**
 * The floating in-page assistant. Runs in the top frame only, inside a closed shadow root
 * so the page's CSS can't change it and page scripts can't read it. All data comes from
 * the background worker; this script never talks to the network.
 */
import { createRoot } from "react-dom/client";

import type { Reply } from "@/shared/messages";
import css from "@/widget/widget.css?inline";
import { Widget, type Send } from "@/widget/Widget";

declare const __WIDGET_SHADOW__: ShadowRootMode;

const FLAG = "__copilotWidgetMounted";
const globalState = window as unknown as Record<string, boolean>;

function mount() {
  if (window !== window.top || globalState[FLAG]) return;
  globalState[FLAG] = true;

  const host = document.createElement("copilot-assistant");
  host.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647;";
  const shadow = host.attachShadow({ mode: typeof __WIDGET_SHADOW__ === "string" ? __WIDGET_SHADOW__ : "closed" });
  const style = document.createElement("style");
  style.textContent = css;
  const container = document.createElement("div");
  shadow.append(style, container);
  document.documentElement.append(host);

  const root = createRoot(container);
  const send: Send = async <T,>(message: Record<string, unknown>): Promise<Reply<T>> => {
    try {
      return ((await chrome.runtime.sendMessage(message)) as Reply<T>) ?? { ok: false, error: "No response" };
    } catch (error) {
      // The extension was reloaded or removed: this copy of the script is orphaned.
      if (String(error).includes("Extension context invalidated")) {
        root.unmount();
        host.remove();
        globalState[FLAG] = false;
      }
      return { ok: false, error: "Copilot isn't available right now." };
    }
  };
  root.render(<Widget send={send} url={() => location.href} />);
}

mount();
