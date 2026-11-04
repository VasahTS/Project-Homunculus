// Styled chat messages and CSS-only animation, isolated from the app. Author: CODEX, 2026-11-03.
// CLAUDE, 2026-11-04 (D-086): dialogue follows the look's color inside styled messages too; only a color the AI set on
// the quote's own container (style="color…" or <font color>) is kept. Before, any element with a class won, so a
// message drawn by a render agent never took the look's dialogue color.
// CLAUDE, 2026-11-03: while a reply streams, only the body is replaced in the loaded frame, so the frame is not
// reloaded (blank flash, lost height, restarted page) on every token; a new <style>/policy still reloads it.
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { formatRichMessage, type MessageLook } from "../messageFormat.ts";

const BASE = `html{overflow-wrap:anywhere}body{margin:0;padding:10px 0;min-height:0;display:flow-root;color:var(--app-label,#ddd);font-family:var(--app-font,Georgia,serif);font-size:var(--app-size,16.5px);line-height:1.65;white-space:normal}*,*::before,*::after{box-sizing:border-box}p{margin:0 0 .8em}img,svg{max-width:100%}img{height:auto}pre{white-space:pre-wrap;overflow-wrap:anywhere}q.dlg{color:var(--app-dialogue,inherit);quotes:none}q.dlg::before,q.dlg::after{content:none}:not([class])>em{color:var(--app-narration,inherit)}[style*="color"] q.dlg,font[color] q.dlg{color:inherit}.img-gate,.code-copy{font:inherit;color:inherit;cursor:pointer}.code-wrap{position:relative}.code-copy{float:right}`;
const MOTION = `@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}:root[data-app-motion="off"] *,:root[data-app-motion="off"] *::before,:root[data-app-motion="off"] *::after{animation:none!important;transition:none!important}`;
const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
/** The CSP source for one approved picture (its path only), or nothing when the address is not a valid URL. */
const imageSource = (src: string) => {
  try { const url = new URL(src); return (url.origin + url.pathname).replace(/[';,\s]/g, (c) => encodeURIComponent(c)); } catch { return ""; }
};

export function MessageHtml({ text, look, onClick }: { text: string; look: MessageLook; onClick: (event: MouseEvent) => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(32);
  const [approved, setApproved] = useState<string[]>([]);
  const { head, body } = useMemo(() => {
    const parts = formatRichMessage(text, look);
    const content = document.createElement("template");
    content.innerHTML = parts.body;
    if (look.images === "ask") for (const gate of content.content.querySelectorAll<HTMLButtonElement>("button.img-gate")) {
      if (!gate.dataset.src || !approved.includes(gate.dataset.src)) continue;
      const img = document.createElement("img");
      img.src = gate.dataset.src; img.alt = gate.dataset.alt ?? ""; img.referrerPolicy = "no-referrer";
      gate.replaceWith(img);
    }
    // CSS URLs are blocked too. A click permits only that image's path, never the whole remote host.
    const images = look.images === "always" ? "https: http:" : look.images === "ask" ? approved.map(imageSource).filter(Boolean).join(" ") : "";
    const policy = `default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: ${images}; base-uri 'none'; form-action 'none'`;
    return { head: `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${escapeAttr(policy)}"><style>${BASE}</style>${parts.head}<style>${MOTION}</style>`, body: content.innerHTML };
  }, [text, look, approved]);

  // The document the frame loads changes only with its head (styles, policy); body updates are patched in place.
  const shown = useRef<{ head: string; doc: string; loaded: boolean } | null>(null);
  if (shown.current?.head !== head) shown.current = { head, doc: `<!doctype html><html><head>${head}</head><body>${body}</body></html>`, loaded: false };
  const doc = shown.current!.doc;
  const latestBody = useRef(body);
  latestBody.current = body;
  const refit = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    const child = frame.current?.contentDocument;
    if (!shown.current?.loaded || !child?.body || child.body.innerHTML === body) return;
    child.body.innerHTML = body;
    refit.current();
  }, [body]);

  useLayoutEffect(() => {
    const f = frame.current;
    if (!f) return;
    let resize: ResizeObserver | undefined;
    let theme: MutationObserver | undefined;
    let fitTimer = 0;
    let body: HTMLElement | null = null;
    let themeSheet: HTMLStyleElement | null = null;
    // Parent-frame sizing runs after the child document has finished its resize notification cycle.
    const fit = () => {
      clearTimeout(fitTimer);
      fitTimer = window.setTimeout(() => {
        if (!body || !f.isConnected || !f.clientWidth) return;
        const style = body.ownerDocument.defaultView!.getComputedStyle(body);
        const next = Math.min(4096, Math.max(24, Math.ceil(body.getBoundingClientRect().height + (parseFloat(style.marginTop) || 0) + (parseFloat(style.marginBottom) || 0))));
        setHeight((old) => old === next ? old : next);
      }, 0);
    };
    refit.current = fit;
    const syncTheme = () => {
      if (!body || !themeSheet) return;
      const style = getComputedStyle(document.documentElement);
      const value = (key: string, fallback: string) => style.getPropertyValue(key).trim() || fallback;
      const css = `:root{--app-label:${value("--label", "#ddd")};--app-font:${value("--font-prose", "Georgia,serif")};--app-size:${value("--size-prose", "16.5px")};--app-dialogue:${value("--dialogue-user", value("--dialogue", "inherit"))};--app-narration:${value("--narration-user", value("--narration", "inherit"))}}`;
      if (themeSheet.textContent !== css) themeSheet.textContent = css;
      body.ownerDocument.documentElement.dataset.appMotion = document.documentElement.dataset.motion === "off" ? "off" : "on";
      fit();
    };
    const click = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const gate = target?.closest<HTMLButtonElement>("button.img-gate");
      if (gate?.dataset.src && /^https?:\/\//i.test(gate.dataset.src)) {
        event.preventDefault();
        const src = gate.dataset.src;
        setApproved((old) => old.includes(src) ? old : [...old, src]);
      } else onClick(event);
    };
    const load = () => {
      resize?.disconnect(); theme?.disconnect(); body?.removeEventListener("click", click);
      const child = f.contentDocument;
      if (!child?.body) return;
      if (shown.current?.doc === doc) shown.current.loaded = true;
      // Tokens that arrived while the frame was loading.
      if (child.body.innerHTML !== latestBody.current) child.body.innerHTML = latestBody.current;
      body = child.body;
      themeSheet = child.createElement("style"); child.head.prepend(themeSheet);
      body.addEventListener("click", click);
      syncTheme();
      resize = new ResizeObserver(fit); resize.observe(body);
      theme = new MutationObserver(syncTheme); theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme", "data-motion"] });
      fit();
    };
    f.addEventListener("load", load);
    return () => { f.removeEventListener("load", load); body?.removeEventListener("click", click); resize?.disconnect(); theme?.disconnect(); clearTimeout(fitTimer); refit.current = () => {}; };
  }, [doc, onClick]);

  return <iframe ref={frame} className="safe-html" title="Formatted message" sandbox="allow-same-origin" srcDoc={doc} style={{ height, maxWidth: "100%" }} data-testid="message-html" />;
}
