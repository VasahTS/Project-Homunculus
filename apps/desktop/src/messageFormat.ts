// Homunculus 2 — how a message's text is drawn: Markdown, dialogue color and safe HTML. Author: CLAUDE, 2026-11-01 (D-061).
//
// Like SillyTavern's messageFormatting: *narration* in italics, "dialogue" in its own color (SillyTavern wraps quotes
// in <q> before Markdown), **bold**, line breaks, and formatting HTML the AI or a regex script writes
// (<font color>, <span style>, <b>…). Everything goes through DOMPurify with a short list of tags and CSS
// properties, so a message can color and style its own text but can never run code, load anything from the
// internet, or cover or restyle the app (no classes, ids, positions, <style>, images from links, forms).
import DOMPurify from "dompurify";
import { marked } from "marked";

export interface MessageLook {
  /** *italics*, **bold**, lists… */
  markdown: boolean;
  /** "Quoted speech" in the dialogue color. */
  dialogue: boolean;
  /** Formatting HTML written by the AI (<font color>, <span style>…). Regex scripts' HTML is always drawn. */
  html: boolean;
  /** Empty = the theme's. */
  dialogueColor: string;
  narrationColor: string;
}

export const DEFAULT_LOOK: MessageLook = { markdown: true, dialogue: true, html: true, dialogueColor: "", narrationColor: "" };

const TAGS = ["b", "strong", "i", "em", "u", "s", "del", "strike", "mark", "small", "big", "sub", "sup", "font", "span", "div", "p", "br", "hr",
  "q", "blockquote", "code", "pre", "kbd", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "details", "summary", "center",
  "table", "thead", "tbody", "tr", "th", "td", "ruby", "rt", "rp", "abbr", "cite", "dfn", "time", "img"];
const ATTRS = ["color", "face", "size", "style", "title", "open", "align", "colspan", "rowspan", "class", "src", "alt"];
/** CSS a message may use on its own text. */
const CSS = new Set(["color", "background", "background-color", "font-weight", "font-style", "font-family", "font-size", "font-variant",
  "text-decoration", "text-decoration-color", "text-decoration-style", "text-align", "text-transform", "text-shadow", "letter-spacing",
  "line-height", "opacity", "border", "border-color", "border-style", "border-width", "border-radius", "border-left", "border-right",
  "border-top", "border-bottom", "padding", "padding-left", "padding-right", "padding-top", "padding-bottom", "margin", "margin-top",
  "margin-bottom", "margin-left", "margin-right", "display", "white-space", "max-width", "width", "vertical-align", "filter", "box-shadow"]);
const DISPLAY = new Set(["inline", "block", "inline-block", "none", "flex", "inline-flex", "grid"]);

let hooked = false;
function hook() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
    const name = data.attrName;
    if (name === "class") { data.keepAttr = data.attrValue === "dlg"; return; } // only our own dialogue mark
    if (name === "src") { data.keepAttr = /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(data.attrValue); return; } // nothing from the internet
    if (name === "size") { data.keepAttr = /^[+-]?[1-7]$/.test(data.attrValue.trim()); return; }
    if (name !== "style") return;
    const kept: string[] = [];
    for (const decl of data.attrValue.split(";")) {
      const i = decl.indexOf(":");
      if (i < 0) continue;
      const prop = decl.slice(0, i).trim().toLowerCase();
      const value = decl.slice(i + 1).trim();
      if (!CSS.has(prop) || /url\s*\(|expression|@import|!important|var\s*\(/i.test(value)) continue;
      if (prop === "display" && !DISPLAY.has(value.toLowerCase())) continue;
      if (prop === "font-size" && !/^(\d+(\.\d+)?(px|em|rem|%)|smaller|larger|small|medium|large|x-large|x-small)$/i.test(value)) continue;
      if (prop === "font-size" && /px$/i.test(value) && parseFloat(value) > 48) continue;
      kept.push(`${prop}: ${value}`);
    }
    data.attrValue = kept.join("; ");
    data.keepAttr = kept.length > 0;
  });
  // an image whose address was dropped (from the internet) is dropped too
  DOMPurify.addHook("afterSanitizeAttributes", (node) => { if (node.nodeName === "IMG" && !node.getAttribute("src")) node.remove(); });
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** SillyTavern's quote pairs: "…", “…”, «…», 「…」, 『…』, ＂…＂ — on one line. */
const QUOTES = /("[^"\n]+")|(“[^”\n]+”)|(«[^»\n]+»)|(「[^」\n]+」)|(『[^』\n]+』)|(＂[^＂\n]+＂)/g;

/** Marks quoted speech, but never inside HTML tags (their attributes have quotes too) or code. */
function markDialogue(text: string): string {
  return text.split(/(```[\s\S]*?```|`[^`\n]*`|<[^>]*>)/g)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(QUOTES, (m) => `<q class="dlg">${m}</q>`)))
    .join("");
}

/**
 * The HTML for a message. `allowHtml` = HTML in the text is drawn (filtered); otherwise it shows as typed.
 * Pure for a given input, so callers can memoize.
 */
export function formatMessage(text: string, look: MessageLook, allowHtml: boolean): string {
  hook();
  let src = allowHtml ? text : escapeHtml(text);
  if (look.dialogue) src = markDialogue(src);
  const html = look.markdown
    ? (marked.parse(src, { breaks: true, gfm: true, async: false }) as string)
    : src.replace(/\n/g, "<br>");
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: TAGS, ALLOWED_ATTR: ATTRS, ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false });
}

/** Does the text have HTML tags at all? (then it is not plain text). */
export const hasHtml = (text: string) => /<\/?[a-z][\w-]*(\s[^<>]*)?\/?>/i.test(text);
