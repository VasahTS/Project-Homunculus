// PNG chunk reading/writing for character cards. Author: CLAUDE, 2026-10-23.
// SillyTavern stores the card as base64 JSON in tEXt chunks: "chara" (V2) and "ccv3" (V3).
import { adler32, crc32, latin1Decode, latin1Encode, utf8 } from "./bytes.ts";

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

export interface PngChunk { type: string; data: Uint8Array }

export function isPng(bytes: Uint8Array): boolean {
  return SIGNATURE.every((b, i) => bytes[i] === b);
}

export function readChunks(bytes: Uint8Array): PngChunk[] {
  if (!isPng(bytes)) throw new Error("This file is not a PNG image.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunks: PngChunk[] = [];
  let pos = 8;
  while (pos + 8 <= bytes.length) {
    const length = view.getUint32(pos);
    const type = latin1Decode(bytes.subarray(pos + 4, pos + 8));
    const start = pos + 8;
    const end = start + length;
    if (end + 4 > bytes.length) throw new Error("The PNG file is damaged (a chunk is cut off).");
    chunks.push({ type, data: bytes.slice(start, end) });
    pos = end + 4; // skip CRC
    if (type === "IEND") break;
  }
  return chunks;
}

export function writeChunks(chunks: PngChunk[]): Uint8Array {
  const size = 8 + chunks.reduce((n, c) => n + 12 + c.data.length, 0);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  out.set(SIGNATURE, 0);
  let pos = 8;
  for (const c of chunks) {
    const type = latin1Encode(c.type);
    view.setUint32(pos, c.data.length);
    out.set(type, pos + 4);
    out.set(c.data, pos + 8);
    view.setUint32(pos + 8 + c.data.length, crc32(type, c.data));
    pos += 12 + c.data.length;
  }
  return out;
}

/** Text chunks (tEXt, and uncompressed iTXt) as keyword -> text. */
export function readTextChunks(chunks: PngChunk[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const c of chunks) {
    if (c.type === "tEXt") {
      const zero = c.data.indexOf(0);
      if (zero > 0) out.set(latin1Decode(c.data.subarray(0, zero)), latin1Decode(c.data.subarray(zero + 1)));
    } else if (c.type === "iTXt") {
      // keyword \0 compressionFlag compressionMethod languageTag \0 translatedKeyword \0 text
      const k = c.data.indexOf(0);
      if (k <= 0 || c.data[k + 1] !== 0) continue; // compressed iTXt is not used by card tools
      const lang = c.data.indexOf(0, k + 3);
      const trans = lang < 0 ? -1 : c.data.indexOf(0, lang + 1);
      if (trans < 0) continue;
      out.set(latin1Decode(c.data.subarray(0, k)), utf8.decode(c.data.subarray(trans + 1)));
    }
  }
  return out;
}

export function textChunk(keyword: string, text: string): PngChunk {
  const k = latin1Encode(keyword);
  const t = latin1Encode(text); // card text is base64, so plain ASCII
  const data = new Uint8Array(k.length + 1 + t.length);
  data.set(k, 0);
  data.set(t, k.length + 1);
  return { type: "tEXt", data };
}

/** Replaces the given text keywords (removing old copies) and inserts them before IEND. */
export function setTextChunks(png: Uint8Array, entries: Record<string, string>): Uint8Array {
  const keys = new Set(Object.keys(entries).map((k) => k.toLowerCase()));
  const kept = readChunks(png).filter((c) => {
    if (c.type !== "tEXt" && c.type !== "iTXt") return true;
    const zero = c.data.indexOf(0);
    return !keys.has(latin1Decode(c.data.subarray(0, zero)).toLowerCase());
  });
  const iend = kept.findIndex((c) => c.type === "IEND");
  const added = Object.entries(entries).map(([k, v]) => textChunk(k, v));
  return writeChunks([...kept.slice(0, iend), ...added, ...kept.slice(iend)]);
}

/** A plain one-color PNG, used as avatar when a character has none (uncompressed "stored" deflate). */
export function solidPng(width: number, height: number, rgb: [number, number, number]): Uint8Array {
  const row = new Uint8Array(1 + width * 3);
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3);
  const raw = new Uint8Array(row.length * height);
  for (let y = 0; y < height; y++) raw.set(row, y * row.length);

  // zlib stream with stored blocks (max 65535 bytes each)
  const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  for (let i = 0; i < raw.length; i += 65535) {
    const part = raw.subarray(i, i + 65535);
    const last = i + 65535 >= raw.length ? 1 : 0;
    const header = new Uint8Array([last, part.length & 0xff, part.length >> 8, ~part.length & 0xff, (~part.length >> 8) & 0xff]);
    blocks.push(header, part);
  }
  const a = adler32(raw);
  blocks.push(new Uint8Array([a >>> 24, (a >>> 16) & 0xff, (a >>> 8) & 0xff, a & 0xff]));
  const idat = new Uint8Array(blocks.reduce((n, b) => n + b.length, 0));
  let p = 0;
  for (const b of blocks) { idat.set(b, p); p += b.length; }

  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width); v.setUint32(4, height);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit, RGB, deflate, no filter method, no interlace
  return writeChunks([{ type: "IHDR", data: ihdr }, { type: "IDAT", data: idat }, { type: "IEND", data: new Uint8Array() }]);
}
