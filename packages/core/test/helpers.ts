// Test helpers. Author: CLAUDE, 2026-10-23; scripted AI 2026-10-27.
import initSqlJs from "sql.js";
import {
  ChatService, HomunculusCore, SqlJsDriver, SqlStore, coreMigrations, migrate,
  type ChatTurn, type HomunculusModule, type StreamChunk,
} from "../src/index.ts";

/** A fresh, migrated in-memory SQLite database. */
export async function newTestStore() {
  const SQL = await initSqlJs();
  const driver = new SqlJsDriver(new SQL.Database());
  await migrate(driver, coreMigrations);
  return { driver, store: new SqlStore(driver) };
}

export type Answer = string | StreamChunk[] | Error;

/**
 * A fake AI. `answer` decides what it says for each call (it sees the messages), so a test
 * can tell the main reply apart from an agent's call. Records every prompt it was sent.
 */
export function scriptedAi(answer: (messages: ChatTurn[], call: number) => Answer, id = "fake") {
  const prompts: ChatTurn[][] = [];
  let active = 0;
  const stats = { maxActive: 0 };
  const module: HomunculusModule = {
    manifest: { id: `ai-${id}`, version: "1" },
    register(api) {
      api.registerProvider({
        id, name: "Fake", help: "",
        async *stream(req) {
          prompts.push(req.messages);
          active++;
          stats.maxActive = Math.max(stats.maxActive, active);
          try {
            await new Promise((r) => setTimeout(r, 2));
            const a = answer(req.messages, prompts.length);
            if (a instanceof Error) throw a;
            const chunks: StreamChunk[] = typeof a === "string" ? a.split(/(?<= )/) : a;
            for (const c of chunks) {
              if (req.signal?.aborted) { const e = new Error("Stopped"); e.name = "AbortError"; throw e; }
              yield c;
            }
          } finally {
            active--;
          }
        },
      });
    },
  };
  return { module, prompts, stats };
}

/** True when the call is an agent's call (agent prompts end with a format instruction). */
export const isAgentCall = (messages: ChatTurn[]) => /Answer with ONLY/.test(messages.at(-1)?.content ?? "");

export const connection = { providerId: "fake", model: "fake-1" };

/** Store + core + chat service with a scripted AI and the character Lyra. */
export async function world(answer: (messages: ChatTurn[], call: number) => Answer, modules: HomunculusModule[] = [], opts: { random?: () => number } = {}) {
  const { store } = await newTestStore();
  const core = new HomunculusCore({ tree: store, stateRepository: store });
  const ai = scriptedAi(answer);
  await core.loadModules([ai.module, ...modules]);
  let n = 0;
  const chat = new ChatService(core, store, { newId: () => `id${++n}`, now: () => ++n, random: opts.random });
  await store.saveCharacter({
    id: "lyra", name: "Lyra", description: "A wary ranger.", personality: "Dry humor.", firstMessages: ["*Lyra eyes you.* Who's there?"],
  });
  return { store, core, chat, ai };
}
