// Homunculus 2 — reading picked files, saving exports, image conversion. Author: CLAUDE, 2026-10-23.
import type { Avatar } from "@homunculus/schemas";
import type { ExportedFile } from "@homunculus/core";
import { bytesToBase64 } from "@homunculus/st-cards";
import { isDesktop } from "./db.ts";

export async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/** The system "Save as" window (Chromium/WebView2: the Windows app and the browser preview). Not in TypeScript's DOM types. */
type SavePicker = (options: { suggestedName: string; types?: Array<{ description: string; accept: Record<string, string[]> }> }) =>
  Promise<{ name: string; createWritable(): Promise<{ write(data: BlobPart): Promise<void>; close(): Promise<void> }> }>;

/**
 * Saves an exported file and returns where it went, or null when the person cancelled.
 * Desktop: asks where with the system "Save as" window (D-046); without one (Linux WebKitGTK) it goes to
 * Downloads (never overwrites) and the path is returned. Browser preview: a normal download.
 */
export async function saveExport(file: ExportedFile): Promise<string | null> {
  if (isDesktop) {
    const picker = (window as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
    if (picker) {
      const ext = /\.[A-Za-z0-9]+$/.exec(file.fileName)?.[0];
      try {
        const handle = await picker({ suggestedName: file.fileName, ...(ext ? { types: [{ description: ext.slice(1).toUpperCase(), accept: { [file.mime]: [ext] } }] } : {}) });
        const out = await handle.createWritable();
        await out.write(file.bytes as BlobPart);
        await out.close();
        return handle.name;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return null;
        // a picker that exists but cannot write falls back to Downloads below
      }
    }
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string>("save_download", { fileName: file.fileName, base64Data: bytesToBase64(file.bytes) });
  }
  const url = URL.createObjectURL(new Blob([file.bytes as BlobPart], { type: file.mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file.fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return `Downloads/${file.fileName}`;
}

/** A file name from a display name, keeping accents and other letters ("Viagem à praia" → "Viagem-à-praia"). */
export function fileNameFrom(name: string, fallback: string): string {
  return name.normalize("NFC").replace(/[^\p{L}\p{N}_ -]+/gu, "-").trim().replace(/\s+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "") || fallback;
}

/** Any image the browser can open (PNG, JPG, WebP, GIF…) becomes a PNG avatar, so cards export cleanly. */
export async function imageFileToPngAvatar(file: File): Promise<Avatar> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`"${file.name}" is not an image this app can open.`));
      el.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")!.drawImage(img, 0, 0);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not convert the image."))), "image/png"));
    return { mime: "image/png", base64: bytesToBase64(new Uint8Array(await blob.arrayBuffer())) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const avatarUrl = (a: Avatar | undefined) => (a ? `data:${a.mime};base64,${a.base64}` : undefined);
