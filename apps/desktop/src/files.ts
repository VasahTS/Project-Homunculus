// Homunculus 2 — reading picked files, saving exports, image conversion. Author: CLAUDE, 2026-10-23.
import type { Avatar } from "@homunculus/schemas";
import type { ExportedFile } from "@homunculus/core";
import { bytesToBase64 } from "@homunculus/st-cards";
import { isDesktop } from "./db.ts";

export async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

/**
 * Saves an exported file. Desktop: into the Downloads folder (never overwrites), returns the path.
 * Browser preview: a normal download.
 */
export async function saveExport(file: ExportedFile): Promise<string> {
  if (isDesktop) {
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
