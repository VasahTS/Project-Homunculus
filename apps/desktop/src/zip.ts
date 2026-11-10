// Homunculus 2 — reads the files inside a ZIP / CBZ (comic pages, D-115). Author: CLAUDE, 2026-11-10.
// Only what comics need: the central directory, "stored" and "deflate" entries (DecompressionStream "deflate-raw",
// in WebView2 / WebKitGTK and Node 18+). No encryption, no ZIP64.

export interface ZipFile { name: string; bytes: Uint8Array }

const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u32 = (b: Uint8Array, o: number) => (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The files of a ZIP (folders left out), in the archive's order. `want` filters by name before anything is unpacked. */
export async function unzip(bytes: Uint8Array, want: (name: string) => boolean = () => true): Promise<ZipFile[]> {
  // end of central directory: the last "PK\x05\x06" (a comment may follow it)
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) if (u32(bytes, i) === 0x06054b50) { end = i; break; }
  if (end < 0) throw new Error("This is not a ZIP / CBZ file (or it is damaged).");
  const count = u16(bytes, end + 10);
  let p = u32(bytes, end + 16);
  const out: ZipFile[] = [];
  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (u32(bytes, p) !== 0x02014b50) throw new Error("The ZIP's file list is damaged.");
    const flags = u16(bytes, p + 8), method = u16(bytes, p + 10);
    const size = u32(bytes, p + 20);
    const nameLen = u16(bytes, p + 28), extraLen = u16(bytes, p + 30), commentLen = u16(bytes, p + 32);
    const local = u32(bytes, p + 42);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith("/") || !want(name)) continue;
    if (flags & 1) throw new Error(`“${name}” is encrypted; unzip it first.`);
    const start = local + 30 + u16(bytes, local + 26) + u16(bytes, local + 28);
    const raw = bytes.subarray(start, start + size);
    if (method === 0) out.push({ name, bytes: raw.slice() });
    else if (method === 8) out.push({ name, bytes: await inflate(raw) });
    else throw new Error(`“${name}” uses a compression the app can't read (method ${method}).`);
  }
  return out;
}
