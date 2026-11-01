// Homunculus 2 — a message's text on screen (D-061). Author: CLAUDE, 2026-11-01.
// Markdown + dialogue color + filtered HTML (messageFormat.ts). Regex output with its own <style> block is drawn in the
// sandboxed box instead, so its CSS can never reach the app.
import { useMemo } from "react";
import { formatMessage } from "../messageFormat.ts";
import { useMessageLook } from "../messageLook.ts";
import { SafeHtml } from "./RegexScripts.tsx";

export function MessageText({ text, htmlFromRegex = false }: { text: string; htmlFromRegex?: boolean }) {
  const look = useMessageLook();
  const allowHtml = look.html || htmlFromRegex;
  const html = useMemo(() => formatMessage(text, look, allowHtml), [text, look, allowHtml]);
  if (htmlFromRegex && /<style[\s>]/i.test(text)) return <SafeHtml html={text} />;
  return <div className="msg-format" data-testid="msg-format" dangerouslySetInnerHTML={{ __html: html }} />;
}
