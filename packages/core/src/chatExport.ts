// Homunculus 2 — exporting a chat (round 3, D-036). Author: CLAUDE, 2026-10-29.
// Daniel: "you can export in the program's format or jsonl or .md or plain text".
// - "homunculus": everything — the whole message tree (every branch and version), the branch names, the world state of
//   each message (the trackers' and your own changes) — to keep or move between installs.
// - "jsonl": SillyTavern's chat file (a header line, then one line per message) of ONE path: the branch shown.
// - "markdown" / "text": the same path, to read or share.
import type { Message, Session } from "@homunculus/schemas";
import { effectiveCharacter, effectivePersona } from "./variants.ts";
import type { SqlStore } from "./storage/store.ts";

export type ChatExportFormat = "homunculus" | "jsonl" | "markdown" | "text";

export const CHAT_EXPORT_FORMATS: Array<{ format: ChatExportFormat; label: string; help: string; ext: string; mime: string }> = [
  { format: "homunculus", label: "Homunculus chat", help: "Everything: branches, versions and the world state", ext: "h2chat.json", mime: "application/json" },
  { format: "jsonl", label: "JSONL (SillyTavern)", help: "Opens in SillyTavern · the branch on screen", ext: "jsonl", mime: "application/jsonl" },
  { format: "markdown", label: "Markdown (.md)", help: "To read or share · names in bold", ext: "md", mime: "text/markdown" },
  { format: "text", label: "Plain text (.txt)", help: "Just the words", ext: "txt", mime: "text/plain" },
];

export interface ExportedChat { fileName: string; mime: string; bytes: Uint8Array }

/** Who wrote each message, by name (the chat's version of each card, its persona, the story's narrator). */
async function namer(store: SqlStore, session: Session): Promise<(m: Message) => string> {
  const chars = new Map<string, string>();
  for (const c of session.cast) {
    if (!c.characterId) continue;
    const raw = await store.getCharacter(c.characterId);
    if (raw) chars.set(raw.id, effectiveCharacter(raw, c.variantId).name);
  }
  let narrator = "Narrator";
  const story = session.storyId ? await store.getStory(session.storyId) : undefined;
  if (story) {
    const r = story.narrator;
    if (r.kind === "card") { const c = await store.getCharacter(r.characterId); if (c) narrator = effectiveCharacter(c, r.variantId).name; }
    else if (r.kind === "own") narrator = r.narrator.name || "Narrator";
    else narrator = (await store.narrators.get(r.id))?.name ?? "Narrator";
  }
  const setup = session.setup;
  const defaultPersona = (await store.getDefaultSetup()).personaId;
  const story2 = story?.setup;
  const pid = setup.personaId !== undefined ? setup.personaId : story2?.personaId !== undefined ? story2.personaId : defaultPersona;
  const pRaw = pid ? await store.personas.get(pid) : undefined;
  const pvid = setup.personaId !== undefined ? setup.personaVariantId ?? null : story2?.personaVariantId ?? null;
  const user = pRaw ? effectivePersona(pRaw, pvid).name : "User";
  return (m) => m.speaker.kind === "user" ? user
    : m.speaker.kind === "character" ? chars.get(m.speaker.characterId) ?? "Character"
      : m.speaker.kind === "narrator" ? narrator : "System";
}

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "chat";

/**
 * Exports a chat. `endId` = the last message of the path to export (the branch on screen); null/undefined = the newest
 * message's path. The "homunculus" format always holds the whole tree.
 */
export async function exportChat(store: SqlStore, sessionId: string, format: ChatExportFormat, endId?: string | null): Promise<ExportedChat> {
  const session = await store.getSession(sessionId);
  if (!session) throw new Error("This chat is gone.");
  const meta = CHAT_EXPORT_FORMATS.find((f) => f.format === format)!;
  const fileName = `${safeName(session.title)}.${meta.ext}`;
  const enc = (text: string): ExportedChat => ({ fileName, mime: meta.mime, bytes: new TextEncoder().encode(text) });

  if (format === "homunculus") {
    const messages = await store.messagesOf(sessionId);
    const deltas: Record<string, unknown> = {};
    for (const m of messages) {
      const [agents, user] = await Promise.all([store.getDelta(m.id), store.getUserDelta(m.id)]);
      if (agents || user) deltas[m.id] = { ...(agents ? { agents } : {}), ...(user ? { user } : {}) };
    }
    const doc = { format: "homunculus-chat", version: 1, exportedAt: new Date().toISOString(), session, branches: await store.listBranches(sessionId), messages, worldState: deltas };
    return enc(JSON.stringify(doc, null, 1));
  }

  const end = endId ?? (await store.latestMessage(sessionId))?.id ?? null;
  const path = end ? await store.pathTo(end) : [];
  const name = await namer(store, session);
  const visible = path.filter((m) => m.kind !== "event" || m.speaker.kind !== "system");

  if (format === "jsonl") {
    const lead = session.cast.find((c) => c.characterId);
    const leadName = visible.find((m) => m.speaker.kind !== "user") ? name(visible.find((m) => m.speaker.kind !== "user")!) : lead ? "Character" : "Narrator";
    const userName = name({ speaker: { kind: "user" } } as Message);
    const header = { user_name: userName, character_name: leadName, create_date: new Date(session.createdAt).toISOString(), chat_metadata: {} };
    const lines = [JSON.stringify(header), ...visible.map((m) => JSON.stringify({
      name: name(m), is_user: m.speaker.kind === "user", is_system: m.speaker.kind === "system",
      send_date: new Date(m.createdAt).toISOString(), mes: m.content, extra: m.reasoning ? { reasoning: m.reasoning } : {},
    }))];
    return enc(`${lines.join("\n")}\n`);
  }
  if (format === "markdown") {
    const body = visible.map((m) => `**${name(m)}:** ${m.content.trim()}`).join("\n\n");
    return enc(`# ${session.title}\n\n${body}\n`);
  }
  const body = visible.map((m) => `${name(m)}: ${m.content.trim()}`).join("\n\n");
  return enc(`${session.title}\n\n${body}\n`);
}
