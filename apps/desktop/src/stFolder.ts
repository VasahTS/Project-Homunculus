// Homunculus 2 — a SillyTavern folder: where its files are and what is in it (D-127). Author: CLAUDE, 2026-11-13.
// The folder comes from the native folder dialog (desktop: `folder_pick`, read through `folder_list` / `folder_read`, which
// never leave the picked folder) or from `<input webkitdirectory>` (browser preview, click tests). Nothing is imported
// here: `scanSt` only counts, so the "What was found" step can show it before anything is written.

export interface FolderEntry { path: string; dir: boolean; size: number; modified: number }
export interface FolderSource {
  /** The folder's own name (shown to the user). */
  name: string;
  /** Entries under `sub` ("" = the top), every level or just the first. Paths use "/" and start at the folder. */
  list(sub: string, recursive: boolean): Promise<FolderEntry[]>;
  read(path: string): Promise<Uint8Array>;
}

export interface PickedFolder { id: string; path: string; name: string; linked: boolean; present?: boolean }

/** Desktop: the system's folder dialog. `link` remembers it as a linked folder (the external card source). */
export async function pickFolder(title: string, link = false): Promise<PickedFolder | null> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<PickedFolder | null>("folder_pick", { title, link });
}

/** Desktop: a picked or linked folder as a source. */
export function nativeFolder(f: Pick<PickedFolder, "id" | "name">): FolderSource {
  return {
    name: f.name,
    async list(sub, recursive) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<FolderEntry[]>("folder_list", { id: f.id, sub, recursive });
    },
    async read(path) {
      const { invoke } = await import("@tauri-apps/api/core");
      return new Uint8Array(await invoke<ArrayBuffer>("folder_read", { id: f.id, path }));
    },
  };
}

/** Browser: the files of `<input webkitdirectory>` (their paths start with the picked folder's name). */
export function browserFolder(files: File[]): FolderSource {
  const rel = (f: File) => ((f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name).split("/").slice(1).join("/");
  const byPath = new Map(files.map((f) => [rel(f), f]));
  const name = ((files[0] as File & { webkitRelativePath?: string } | undefined)?.webkitRelativePath ?? "").split("/")[0] || "Folder";
  const entries = (): FolderEntry[] => {
    const out = new Map<string, FolderEntry>();
    for (const [p, f] of byPath) {
      if (!p) continue;
      const parts = p.split("/");
      for (let i = 1; i < parts.length; i++) {
        const d = parts.slice(0, i).join("/");
        if (!out.has(d)) out.set(d, { path: d, dir: true, size: 0, modified: 0 });
      }
      out.set(p, { path: p, dir: false, size: f.size, modified: f.lastModified });
    }
    return [...out.values()].filter((e) => !e.path.split("/").some((s) => s.startsWith("."))).sort((a, b) => a.path.localeCompare(b.path));
  };
  return {
    name,
    async list(sub, recursive) {
      const prefix = sub ? `${sub.replace(/\/$/, "")}/` : "";
      return entries().filter((e) => e.path.startsWith(prefix) && (recursive || !e.path.slice(prefix.length).includes("/")));
    },
    async read(path) {
      const f = byPath.get(path);
      if (!f) throw new Error(`not found: ${path}`);
      return new Uint8Array(await f.arrayBuffer());
    },
  };
}

/** A user folder inside a SillyTavern folder ("" when the picked folder IS one, e.g. data/default-user). */
export interface StUser { dir: string; name: string }

const USER_MARKS = ["settings.json", "characters", "chats", "worlds"];

/** Where the SillyTavern data is: the picked folder itself, `data/<user>` (one or several), or old `public/`. */
export async function findStUsers(src: FolderSource): Promise<StUser[]> {
  const top = new Set((await src.list("", false)).map((e) => e.path));
  if (USER_MARKS.filter((m) => top.has(m)).length >= 2) return [{ dir: "", name: src.name }];
  if (top.has("data")) {
    const users: StUser[] = [];
    for (const e of await src.list("data", false)) {
      if (!e.dir) continue;
      const inner = new Set((await src.list(e.path, false)).map((x) => x.path.slice(e.path.length + 1)));
      if (USER_MARKS.filter((m) => inner.has(m)).length >= 2) users.push({ dir: e.path, name: e.path.split("/").pop()! });
    }
    // default-user first
    return users.sort((a, b) => (a.name === "default-user" ? -1 : b.name === "default-user" ? 1 : a.name.localeCompare(b.name)));
  }
  if (top.has("public")) {
    const inner = new Set((await src.list("public", false)).map((x) => x.path.slice("public/".length)));
    if (USER_MARKS.filter((m) => inner.has(m)).length >= 2) return [{ dir: "public", name: "public (old SillyTavern)" }];
  }
  return [];
}

export interface StScan {
  user: StUser;
  cards: string[];
  /** Chat files by the card file they belong to (`chats/<card name>/…`). */
  chats: Record<string, string[]>;
  chatCount: number;
  chatBytes: number;
  groups: string[];
  groupChats: string[];
  lorebooks: string[];
  personaPictures: string[];
  personas: number;
  presets: string[];
  quickReplies: string[];
  regex: number;
  tags: number;
  hasSettings: boolean;
  /** What will not be imported, with how many files and why. */
  skipped: Array<{ what: string; count: number; why: string }>;
}

const at = (user: StUser, sub: string) => (user.dir ? `${user.dir}/${sub}` : sub);
const files = (list: FolderEntry[], ext: RegExp) => list.filter((e) => !e.dir && ext.test(e.path)).map((e) => e.path);

async function listOr(src: FolderSource, sub: string, recursive: boolean): Promise<FolderEntry[]> {
  try { return await src.list(sub, recursive); } catch { return []; }
}

/** Counts what a SillyTavern user folder holds. Reads only `settings.json` (never `secrets.json`). */
export async function scanSt(src: FolderSource, user: StUser): Promise<StScan> {
  const top = await listOr(src, user.dir, false);
  const has = (name: string) => top.some((e) => e.path === at(user, name));
  const direct = async (sub: string, ext: RegExp) => (has(sub) ? files(await listOr(src, at(user, sub), false), ext) : []);

  const cards = await direct("characters", /\.(png|json|charx)$/i);
  const chatEntries = has("chats") ? await listOr(src, at(user, "chats"), true) : [];
  const chats: Record<string, string[]> = {};
  let chatBytes = 0;
  for (const e of chatEntries) {
    if (e.dir || !/\.jsonl$/i.test(e.path)) continue;
    const parts = e.path.slice(at(user, "chats").length + 1).split("/");
    if (parts.length !== 2) continue;
    (chats[parts[0]!] ??= []).push(e.path);
    chatBytes += e.size;
  }
  const groupChatEntries = has("group chats") ? await listOr(src, at(user, "group chats"), false) : [];
  chatBytes += groupChatEntries.reduce((n, e) => n + e.size, 0);

  let personas = 0, regex = 0, tags = 0;
  const hasSettings = has("settings.json");
  if (hasSettings) {
    try {
      const s = JSON.parse(new TextDecoder().decode(await src.read(at(user, "settings.json"))));
      personas = Object.keys(s?.power_user?.personas ?? {}).length;
      regex = Array.isArray(s?.extension_settings?.regex) ? s.extension_settings.regex.length : 0;
      tags = Array.isArray(s?.tags) ? s.tags.length : 0;
    } catch { /* an unreadable settings.json: counted as nothing, said in the report later */ }
  }

  const count = async (sub: string) => (has(sub) ? (await listOr(src, at(user, sub), false)).filter((e) => !e.dir).length : 0);
  const skipped: StScan["skipped"] = [];
  const textCompletion = (await count("TextGen Settings")) + (await count("instruct")) + (await count("context")) + (await count("sysprompt")) + (await count("KoboldAI Settings")) + (await count("NovelAI Settings"));
  if (textCompletion) skipped.push({ what: "Text Completion settings", count: textCompletion, why: "Homunculus uses Chat Completion presets only" });
  const bg = await count("backgrounds");
  if (bg) skipped.push({ what: "Backgrounds", count: bg, why: "not used by Homunculus" });
  const themes = await count("themes");
  if (themes) skipped.push({ what: "Themes", count: themes, why: "Homunculus has its own looks" });
  if (has("secrets.json")) skipped.push({ what: "API keys (secrets.json)", count: 1, why: "never read — set up your connections in Homunculus" });

  return {
    user, cards, chats, chatCount: Object.values(chats).reduce((n, l) => n + l.length, 0), chatBytes,
    groups: await direct("groups", /\.json$/i),
    groupChats: files(groupChatEntries, /\.jsonl$/i),
    lorebooks: await direct("worlds", /\.json$/i),
    personaPictures: await direct("User Avatars", /\.(png|jpe?g|webp|gif)$/i),
    personas,
    presets: await direct("OpenAI Settings", /\.json$/i),
    quickReplies: await direct("QuickReplies", /\.json$/i),
    regex, tags, hasSettings, skipped,
  };
}
