// Homunculus 2 — files the user gives the Assistant: .json, .jsonl, .md, .txt and PNG cards (D-062). Author: CLAUDE, 2026-11-01.
//
// Token budget: a file is never pasted whole into the request. The message carries a short **summary** (what the file
// is, its size, its outline); the Assistant reads the parts it needs with `read_file` (by field, line range or chunk)
// or turns it into a Library item with `import_file`. A 2 MB lorebook costs a few hundred tokens until it is read.
import { isPng, readChunks, readTextChunks } from "@homunculus/st-cards";

export const CHUNK = 6000;

export interface ParsedFile { text: string; mime: string; summary: string; kind: FileKind }
export type FileKind = "card" | "lorebook" | "json" | "jsonl" | "markdown" | "text";

const tok = (n: number) => `~${Math.max(1, Math.round(n / 3.6)).toLocaleString("en")} tokens`;
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Reads what the user attached. Throws a readable error for files it cannot use. */
export function parseFile(name: string, bytes: Uint8Array): ParsedFile {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png") || isPng(bytes)) {
    const chunks = readTextChunks(readChunks(bytes));
    const raw = chunks.get("ccv3") ?? chunks.get("chara");
    if (!raw) throw new Error(`“${name}” is a picture without a character card inside. Attach it as an image instead.`);
    const json = new TextDecoder().decode(Uint8Array.from(atob(raw), (c) => c.charCodeAt(0)));
    return withSummary(name, JSON.stringify(JSON.parse(json), null, 1), "application/json");
  }
  const text = new TextDecoder().decode(bytes);
  if (lower.endsWith(".jsonl")) return withSummary(name, text, "application/jsonl");
  if (lower.endsWith(".json")) { JSON.parse(text); return withSummary(name, text, "application/json"); }
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return withSummary(name, text, "text/markdown");
  if (/\.(txt|csv|yaml|yml|xml|html?)$/.test(lower) || !/[\u0000-\u0008]/.test(text.slice(0, 2000))) return withSummary(name, text, "text/plain");
  throw new Error(`“${name}” is not a text file the Assistant can read.`);
}

function withSummary(name: string, text: string, mime: string): ParsedFile {
  const size = `${text.length.toLocaleString("en")} characters, ${tok(text.length)}`;
  if (mime === "application/json") {
    const j = JSON.parse(text) as unknown;
    const data = isObj(j) && isObj(j.data) ? j.data : j;
    if (isObj(data) && (typeof data.first_mes === "string" || typeof data.description === "string") && typeof data.name === "string") {
      const fields = Object.entries(data).filter(([, v]) => typeof v === "string" && v).map(([k, v]) => `${k} (${tok((v as string).length)})`);
      const book = isObj(data.character_book) && Array.isArray(data.character_book.entries) ? `; embedded lorebook with ${data.character_book.entries.length} entries` : "";
      return { text, mime, kind: "card", summary: `SillyTavern character card “${data.name}” — ${size}. Fields: ${fields.slice(0, 14).join(", ")}${book}.` };
    }
    if (isObj(j) && isObj(j.entries)) {
      const entries = Object.values(j.entries).filter(isObj);
      const titles = entries.slice(0, 25).map((e) => String(e.comment || (Array.isArray(e.key) ? e.key[0] : "") || "untitled"));
      return { text, mime, kind: "lorebook", summary: `SillyTavern lorebook with ${entries.length} entries — ${size}. First titles: ${titles.join(", ")}${entries.length > 25 ? "…" : ""}.` };
    }
    const keys = isObj(j) ? Object.keys(j).slice(0, 20).join(", ") : Array.isArray(j) ? `a list of ${j.length} items` : typeof j;
    return { text, mime, kind: "json", summary: `JSON — ${size}. Top level: ${keys}.` };
  }
  if (mime === "application/jsonl") {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    let first = "";
    try { const o = JSON.parse(lines[0] ?? "{}") as unknown; first = isObj(o) ? Object.keys(o).slice(0, 12).join(", ") : ""; } catch { first = "(not JSON)"; }
    return { text, mime, kind: "jsonl", summary: `JSON lines — ${lines.length} lines, ${size}. First line's keys: ${first}. (A SillyTavern chat export is one message per line.)` };
  }
  if (mime === "text/markdown") {
    const heads = text.split(/\r?\n/).filter((l) => /^#{1,4}\s/.test(l)).slice(0, 30).map((l) => l.trim());
    return { text, mime, kind: "markdown", summary: `Markdown — ${size}.${heads.length ? ` Headings: ${heads.join(" · ")}` : ""}` };
  }
  return { text, mime, kind: "text", summary: `Text — ${size}. Starts: “${text.slice(0, 160).replace(/\s+/g, " ")}…”` };
}

/**
 * A part of a file for `read_file`: a JSON path ("data.description", "entries.12"), a line range (jsonl/text) or a
 * chunk by character offset. Always ends with how to read more, so the model never has to ask for everything.
 */
export function readPart(text: string, mime: string, args: { path?: string | undefined; lines?: string | undefined; offset?: number | undefined }): string {
  if (args.path && mime === "application/json") {
    let v: unknown = JSON.parse(text);
    for (const k of args.path.split(".").filter(Boolean)) {
      if (Array.isArray(v)) v = v[Number(k)];
      else if (isObj(v)) v = v[k];
      else { v = undefined; break; }
    }
    if (v === undefined) return `Nothing at “${args.path}”.`;
    const s = typeof v === "string" ? v : JSON.stringify(v, null, 1);
    return chunk(s, args.offset ?? 0, `read_file with path "${args.path}" and offset`);
  }
  if (args.lines) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(args.lines.trim());
    if (!m) return "Use lines like \"1-40\".";
    const all = text.split(/\r?\n/);
    const a = Math.max(1, Number(m[1])), b = Math.min(all.length, Number(m[2] ?? m[1]), a + 199);
    return `${all.slice(a - 1, b).map((l, i) => `${a + i}: ${l}`).join("\n")}${b < all.length ? `\n(${all.length - b} more lines; read_file with lines "${b + 1}-${Math.min(all.length, b + 200)}")` : ""}`;
  }
  return chunk(text, args.offset ?? 0, "read_file with offset");
}

function chunk(s: string, offset: number, how: string): string {
  const part = s.slice(offset, offset + CHUNK);
  const rest = s.length - offset - part.length;
  return rest > 0 ? `${part}\n(${rest.toLocaleString("en")} more characters; ${how} ${offset + part.length})` : part;
}
