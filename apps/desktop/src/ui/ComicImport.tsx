// Homunculus 2 — Import From a Comic (D-115, approved draft docs/drafts/vision-comic board 4). Author: CLAUDE, 2026-11-10.
// Pick a folder, pictures or a CBZ / ZIP; the pages show as a strip in natural file-name order (002 before 010); click
// a page to skip it, drag to move it; choose the reading order. Nothing is spent until Start Reading, which sends the
// pages to the Assistant as one message.
import { useEffect, useRef, useState } from "react";
import { naturalCompare } from "../assistant/comic.ts";
import { unzip } from "../zip.ts";
import { readFileBytes } from "../files.ts";
import { bytesToBase64 } from "@homunculus/st-cards";
import { Button, Segmented } from "./kit.tsx";
import { Modal } from "./Vault.tsx";
import type { PagePicture } from "./AssistantCards.tsx";

const IMAGE = /\.(png|jpe?g|webp|gif)$/i;
const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const mimeOf = (name: string) => MIME[name.split(".").pop()!.toLowerCase()] ?? "image/png";
const baseName = (path: string) => path.split(/[\\/]/).pop() ?? path;
type Order = "manga" | "western";

/**
 * Big scans cost more and fill the database: pages are scaled down to 2400 px on the long side (a tall webtoon strip
 * keeps 1200 px of width) and saved as JPEG. Where a canvas can't be made the page stays as it was.
 */
async function fitPage(bytes: Uint8Array, mime: string): Promise<{ mime: string; base64: string }> {
  try {
    const bmp = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }));
    const tall = bmp.height / bmp.width > 3;
    const scale = Math.min(1, tall ? 1200 / bmp.width : 2400 / Math.max(bmp.width, bmp.height));
    if (scale >= 1 && bytes.length < 1_500_000) { bmp.close(); return { mime, base64: bytesToBase64(bytes) }; }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.88));
    if (!blob) throw new Error("no blob");
    return { mime: "image/jpeg", base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
  } catch { return { mime, base64: bytesToBase64(bytes) }; }
}

export function ComicImport({ onClose, onStart, costHint }: {
  onClose: () => void;
  onStart: (title: string, pages: PagePicture[], order: Order) => void;
  /** "1 call · about US$ 0.02 with Gemini Flash" for n pages (empty when the reader is unknown). */
  costHint: (pages: number) => string;
}) {
  const [pages, setPages] = useState<PagePicture[]>([]);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [order, setOrder] = useState<Order>("manga");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("");
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState<number | null>(null);
  const folder = useRef<HTMLInputElement>(null);
  const pictures = useRef<HTMLInputElement>(null);
  const archive = useRef<HTMLInputElement>(null);
  useEffect(() => { folder.current?.setAttribute("webkitdirectory", ""); }, []);

  const load = async (files: File[], from: string) => {
    setError(""); setLoading("Opening…");
    try {
      const raw: Array<{ name: string; bytes: Uint8Array }> = [];
      let name = "";
      for (const f of files) {
        if (/\.(cbz|zip)$/i.test(f.name)) {
          name ||= f.name.replace(/\.(cbz|zip)$/i, "");
          for (const z of await unzip(await readFileBytes(f), (n) => IMAGE.test(n) && !/(^|\/)(__MACOSX|\.)/.test(n))) raw.push({ name: z.name, bytes: z.bytes });
        } else if (IMAGE.test(f.name)) {
          const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
          if (rel && !name) name = rel.split("/")[0] ?? "";
          raw.push({ name: rel || f.name, bytes: await readFileBytes(f) });
        }
      }
      if (!raw.length) throw new Error("No pictures there (PNG, JPG, WebP or GIF; or a CBZ / ZIP of them).");
      raw.sort((a, b) => naturalCompare(a.name, b.name));
      const out: PagePicture[] = [];
      for (const [i, r] of raw.entries()) {
        setLoading(`Preparing page ${i + 1} of ${raw.length}…`);
        const fit = await fitPage(r.bytes, mimeOf(r.name));
        out.push({ id: `cp${Date.now().toString(36)}${i}`, name: baseName(r.name), ...fit });
      }
      setPages(out); setSkipped(new Set());
      setTitle(name.replace(/[_-]+/g, " ").trim()); setSource(`${out.length} picture${out.length === 1 ? "" : "s"}${from === "archive" ? " from the archive" : ""}`);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setLoading("");
  };
  const move = (from: number, to: number) => setPages((ps) => { if (to < 0 || to >= ps.length) return ps; const next = [...ps]; const [p] = next.splice(from, 1); next.splice(to, 0, p!); return next; });
  const toggle = (id: string) => setSkipped((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const used = pages.filter((p) => !skipped.has(p.id));
  let n = 0;
  return (
    <Modal title="Import From a Comic" onClose={onClose} className="modal-small comic-import" testId="comic-import"
      head={source ? <span className="hint comic-src">{title || "Comic"} · {source}</span> : undefined}>
      <div className="comic-body"
        onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }}
        onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); void load([...e.dataTransfer.files], "dropped"); } }}>
        {!pages.length ? (
          <div className="comic-pick">
            <p>The pages of a short comic or doujinshi. The Assistant reads them, tells you what it understood, asks who you are in the story, and proposes one card (and a story, if you want).</p>
            <div className="comic-pick-btns">
              <Button onClick={() => folder.current?.click()} data-testid="comic-folder">Choose a Folder…</Button>
              <Button onClick={() => pictures.current?.click()}>Choose Pictures…</Button>
              <Button onClick={() => archive.current?.click()}>Choose a CBZ / ZIP…</Button>
            </div>
            <span className="hint">or drop them here</span>
          </div>
        ) : <>
          <div className="comic-row">
            <label className="comic-title"><span>Title</span><input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Comic title" placeholder="The comic's title" /></label>
            <Button small variant="plain" onClick={() => { setPages([]); setSource(""); }}>Change…</Button>
          </div>
          <div className="comic-row">
            <span>Reading Order</span>
            <Segmented small label="Reading order" value={order} onChange={setOrder}
              options={[{ value: "manga", label: "Manga · Right to Left" }, { value: "western", label: "Western · Left to Right" }]} />
            <span className="hint">{order === "manga" ? "Panels and balloons read ← (scanlations keep this order in English)." : "Panels and balloons read →."}</span>
          </div>
          <div className="comic-strip" data-testid="comic-strip">
            {pages.map((p, i) => {
              const skip = skipped.has(p.id);
              const label = skip ? p.name : `p. ${++n}`;
              return (
                <button key={p.id} type="button" className={`comic-page${skip ? " skip" : ""}${dragging === i ? " dragging" : ""}`} aria-pressed={skip}
                  title={`${p.name} — click to ${skip ? "use" : "skip"} it; drag (or Alt+←/→) to move it`} data-testid="comic-page"
                  draggable onDragStart={(e) => { setDragging(i); e.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDragging(null)}
                  onDragOver={(e) => { if (dragging !== null) e.preventDefault(); }} onDrop={(e) => { if (dragging !== null) { e.preventDefault(); e.stopPropagation(); move(dragging, i); setDragging(null); } }}
                  onKeyDown={(e) => { if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) { e.preventDefault(); move(i, i + (e.key === "ArrowLeft" ? -1 : 1)); } }}
                  onClick={() => toggle(p.id)}>
                  <span className="comic-paper"><img src={`data:${p.mime};base64,${p.base64}`} alt="" />{skip && <span className="comic-skip">SKIP</span>}</span>
                  <span className="comic-lbl">{label}</span>
                </button>
              );
            })}
          </div>
          <span className="hint">Ordered by file name (002 before 010). Drag a page to move it. Click to skip it.</span>
        </>}
        {loading && <p className="hint" role="status">{loading}</p>}
        {error && <p className="asst-error" role="alert">{error}</p>}
      </div>
      <div className="comic-foot">
        <span className="hint" data-testid="comic-cost">{used.length ? `${used.length} page${used.length === 1 ? "" : "s"}${costHint(used.length) ? ` · ${costHint(used.length)}` : ""}` : ""}</span>
        <Button small variant="plain" onClick={onClose}>Cancel</Button>
        <Button small variant="prominent" disabled={!used.length || !!loading} onClick={() => onStart(title.trim(), used, order)} data-testid="comic-start">Start Reading</Button>
      </div>
      <input ref={folder} type="file" multiple hidden onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; if (fs.length) void load(fs, "folder"); }} />
      <input ref={pictures} type="file" multiple hidden accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; if (fs.length) void load(fs, "pictures"); }} />
      <input ref={archive} type="file" hidden accept=".cbz,.zip" data-testid="comic-archive" onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; if (fs.length) void load(fs, "archive"); }} />
    </Modal>
  );
}
