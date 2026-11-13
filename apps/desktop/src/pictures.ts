// Homunculus 2 — small previews of pictures for lists, the full picture only where it is shown big. CLAUDE, 2026-11-13 (D-121).
// A friend with 1000 cards on Linux: every card picture (1–3 MB each) was read at start, kept in memory as text and drawn
// full size in every list, so the app sat at 14 GB and WebKitGTK killed it while scrolling. Now lists, chats and pickers
// get a small copy (about 320×480, tens of KB); the sheet, the reading view, the image picker and exports ask for the
// full picture, which is read from the database when needed and only the last few are kept.
import { useEffect, useState } from "react";
import type { Avatar } from "@homunculus/schemas";

/** The box a preview covers: big enough for the largest card in the grid and chat portraits on a sharp screen. */
export const PREVIEW_W = 320;
export const PREVIEW_H = 480;
/** Pictures already this small (base64 length) are their own preview. */
const SMALL_ENOUGH = 120_000;

function toBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

const encode = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * The small copy of a picture: scaled so it still covers a 320×480 box (a wide picture keeps its width for the crop),
 * as WebP where the WebView can write it, else JPEG (PNG when the picture has see-through parts, so they stay clear).
 */
export async function makePreview(picture: Avatar): Promise<Avatar> {
  if (picture.base64.length <= SMALL_ENOUGH) return picture;
  const url = URL.createObjectURL(new Blob([toBytes(picture.base64) as BlobPart], { type: picture.mime }));
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) throw new Error("empty picture");
    const scale = Math.min(1, Math.max(PREVIEW_W / w, PREVIEW_H / h));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const g = canvas.getContext("2d");
    if (!g) throw new Error("no canvas");
    g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
    let blob = await encode(canvas, "image/webp", 0.82);
    if (!blob || blob.type !== "image/webp") {
      // WebKitGTK (Linux) can't write WebP: JPEG, unless the picture is see-through somewhere
      const px = g.getImageData(0, 0, canvas.width, canvas.height).data;
      let clear = false;
      for (let i = 3; i < px.length; i += 4 * 7) if (px[i]! < 250) { clear = true; break; }
      blob = await encode(canvas, clear ? "image/png" : "image/jpeg", 0.85);
    }
    if (!blob) throw new Error("could not encode");
    const out = { mime: blob.type || "image/jpeg", base64: await blobToBase64(blob) };
    return out.base64.length < picture.base64.length ? out : picture;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---- pictures by address (D-124, desktop app): an Avatar whose "base64" is an h2pic:// address

/** The type that marks an address instead of picture data. Never stored; only in the screens' state. */
export const ADDRESS_MIME = "image/x-h2-address";
let makeAddress: ((path: string) => string) | null = null;
/** Set once at start in the desktop app: how to turn "p:<version>:<key>" into an address the WebView loads. */
export function setPictureAddresses(make: (path: string) => string): void { makeAddress = make; }
export const picturesByAddress = (): boolean => makeAddress !== null;
/** Back to pictures as data (the address didn't load: a safety net, should a WebView refuse the h2pic scheme). */
export function stopPictureAddresses(): void { makeAddress = null; }

/** Does a picture load by address? Tried once with a real picture before the app relies on addresses. */
export function addressWorks(key: string, version: number): Promise<boolean> {
  if (!makeAddress) return Promise.resolve(false);
  const src = makeAddress(`p:${version}:${key}`);
  return new Promise((resolve) => {
    const img = new Image();
    const t = setTimeout(() => resolve(false), 4000);
    img.onload = () => { clearTimeout(t); resolve(img.naturalWidth > 0); };
    img.onerror = () => { clearTimeout(t); resolve(false); };
    img.src = src;
  });
}
const addressOf = new WeakMap<Avatar, { key: string; version: number }>();
/** A preview by address (the small copy; the full picture stands in until a preview exists). */
export function previewAddress(key: string, version: number): Avatar {
  const a = { mime: ADDRESS_MIME, base64: makeAddress!(`p:${version}:${key}`) };
  addressOf.set(a, { key, version });
  rememberPreview(key, a);
  return a;
}
const fullAddresses = new WeakMap<Avatar, Avatar>();
/** The full picture's address for a preview address (shown big), the same object each time. */
function fullAddress(preview: Avatar): Avatar | undefined {
  const info = addressOf.get(preview);
  if (!info || !makeAddress) return undefined;
  let a = fullAddresses.get(preview);
  if (!a) { a = { mime: ADDRESS_MIME, base64: makeAddress(`f:${info.version}:${info.key}`) }; fullAddresses.set(preview, a); }
  return a;
}

// ---- previews → the picture they stand for

/** The key (owner id, or "<id>#<version>") of each preview the app holds, so any view can ask for its full picture. */
const keyOfPreview = new WeakMap<Avatar, string>();
export function rememberPreview(key: string, preview: Avatar): void { keyOfPreview.set(preview, key); }

let readFull: ((key: string) => Promise<Avatar | undefined>) | null = null;
/** Set once at start: how to read a full picture from the database. */
export function setFullPictureSource(read: (key: string) => Promise<Avatar | undefined>): void { readFull = read; }

/** The last full pictures read (a sheet opened again, the reading view), newest last. Small on purpose. */
const KEEP = 8;
const recent = new Map<string, { preview: Avatar; full: Promise<Avatar | undefined> }>();

/** The full picture behind a preview (the preview itself when it isn't one of the app's, or can't be read). */
export function fullPicture(preview: Avatar): Promise<Avatar> {
  const key = keyOfPreview.get(preview);
  if (!key || !readFull) return Promise.resolve(preview);
  const hit = recent.get(key);
  if (hit && hit.preview === preview) {
    recent.delete(key); recent.set(key, hit); // newest last
    return hit.full.then((f) => f ?? preview);
  }
  const full = readFull(key).catch(() => undefined);
  recent.set(key, { preview, full });
  while (recent.size > KEEP) recent.delete(recent.keys().next().value!);
  return full.then((f) => f ?? preview);
}

/** For a view that shows a picture big: the preview at once, then the full picture when it has been read. */
export function useFullPicture(preview: Avatar | undefined): Avatar | undefined {
  const [full, setFull] = useState<{ of: Avatar; full: Avatar } | null>(null);
  const byAddress = preview ? fullAddress(preview) : undefined;
  useEffect(() => {
    if (!preview || byAddress || !keyOfPreview.has(preview)) return;
    let live = true;
    void fullPicture(preview).then((f) => { if (live) setFull({ of: preview, full: f }); });
    return () => { live = false; };
  }, [preview, byAddress]);
  if (byAddress) return byAddress; // the WebView loads the full picture by itself (D-124)
  return preview && full?.of === preview ? full.full : preview;
}
