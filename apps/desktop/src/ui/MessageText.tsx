// Homunculus 2 — a message's text on screen (D-061). Author: CLAUDE, 2026-11-01.
// Markdown + dialogue color + filtered HTML (messageFormat.ts). Regex output with its own <style> block is drawn in the
// sandboxed box instead, so its CSS can never reach the app.
import { useMemo, type MouseEvent } from "react";
import { isDesktop } from "../db.ts";
import { formatMessage } from "../messageFormat.ts";
import { useMessageLook } from "../messageLook.ts";
import { SafeHtml } from "./RegexScripts.tsx";

export function MessageText({ text, htmlFromRegex = false }: { text: string; htmlFromRegex?: boolean }) {
  const look = useMessageLook();
  const allowHtml = look.html || htmlFromRegex;
  const html = useMemo(() => formatMessage(text, look, allowHtml), [text, look, allowHtml]);
  if (htmlFromRegex && /<style[\s>]/i.test(text)) return <SafeHtml html={text} />;
  return <div className="msg-format" data-testid="msg-format" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Links open in the system browser; "Show image" loads that one picture (D-061). */
function onClick(e: MouseEvent<HTMLDivElement>) {
  const el = e.target as HTMLElement;
  const copy = el.closest<HTMLButtonElement>("button.code-copy");
  if (copy) {
    e.preventDefault();
    const code = copy.parentElement?.querySelector("pre")?.textContent ?? "";
    void navigator.clipboard?.writeText(code).then(() => { copy.textContent = "Copied"; setTimeout(() => { copy.textContent = "Copy"; }, 1500); }).catch(() => {});
    return;
  }
  const gate = el.closest<HTMLButtonElement>("button.img-gate");
  if (gate?.dataset.src) {
    e.preventDefault();
    const img = document.createElement("img");
    img.src = gate.dataset.src;
    img.alt = gate.dataset.alt ?? "";
    img.referrerPolicy = "no-referrer";
    gate.replaceWith(img);
    return;
  }
  const a = el.closest<HTMLAnchorElement>("a.msg-link");
  if (a?.href) {
    e.preventDefault();
    void openLink(a.href);
  }
}

export async function openLink(url: string): Promise<void> {
  if (!/^(https?:|mailto:)/i.test(url)) return;
  if (isDesktop) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else window.open(url, "_blank", "noopener,noreferrer");
}
