// Homunculus 2 — a message's text on screen (D-061). Author: CLAUDE, 2026-11-01.
// Markdown + dialogue color + filtered HTML (messageFormat.ts). Regex output with its own <style> block is drawn in the
// sandboxed box instead, so its CSS can never reach the app.
import { useMemo } from "react";
import { isDesktop } from "../db.ts";
import { formatMessage, needsMessageFrame } from "../messageFormat.ts";
import { MessageHtml } from "./MessageHtml.tsx";
import { useMessageLook } from "../messageLook.ts";
import { SafeHtml } from "./RegexScripts.tsx";

export function MessageText({ text, htmlFromRegex = false, richHtml = false }: { text: string; htmlFromRegex?: boolean; richHtml?: boolean }) {
  const look = useMessageLook();
  const allowHtml = look.html || htmlFromRegex;
  // CODEX: the chat opts into styled documents; Assistant code samples keep their existing rendering.
  const framed = useMemo(() => richHtml && allowHtml && needsMessageFrame(text), [text, richHtml, allowHtml]);
  const html = useMemo(() => framed ? "" : formatMessage(text, look, allowHtml), [text, look, allowHtml, framed]);
  if (framed) return <MessageHtml text={text} look={look} onClick={onClick} />;
  if (htmlFromRegex && /<style[\s>]/i.test(text)) return <SafeHtml html={text} />;
  return <div className="msg-format" data-testid="msg-format" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Links open in the system browser; "Show image" loads that one picture (D-061). */
function onClick(e: { target: EventTarget | null; preventDefault: () => void }) {
  const el = e.target as Element | null;
  if (!el?.closest) return;
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
