// Homunculus 2 — UI entry point. Author: CLAUDE, 2026-10-23.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { NavigationProvider } from "./ui/ux.tsx";
import { App } from "./App.tsx";
import { Opening } from "./ui/Opening.tsx";
import "./theme/tokens.css";
import "./styles.css";

// No spell check or autocorrect anywhere (D-133): the system's language (e.g. Portuguese) marked and "fixed" English text.
// index.html turns it off for the whole page; this also covers any box that asks for it on its own.
document.addEventListener("focusin", (e) => {
  const t = e.target;
  if (t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement || (t instanceof HTMLElement && t.isContentEditable)) {
    if (t.spellcheck) t.spellcheck = false;
    t.setAttribute("autocorrect", "off");
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <NavigationProvider><App /></NavigationProvider>
    <Opening />
  </StrictMode>,
);
