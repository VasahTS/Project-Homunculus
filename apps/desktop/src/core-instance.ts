// Homunculus 2 — boots the app's services exactly once, outside React. Author: CLAUDE, 2026-10-23.
// (React may mount components twice in development; owning the core inside a
// component made it get stuck on "loading core…" — caught by the e2e test.)
import { ChatService, HomunculusCore, SqlStore, coreMigrations, migrate } from "@homunculus/core";
import { createOpenAICompatibleModule } from "@homunculus/provider-openai";
import { createSillyTavernCardsModule } from "@homunculus/st-cards";
import { createSillyTavernPersonasModule } from "@homunculus/st-personas";
import { createSillyTavernPresetsModule } from "@homunculus/st-presets";
import { adoptAllEmbeddedLorebooks, createSillyTavernLorebooksModule } from "@homunculus/st-lorebooks";
import { DEFAULT_PRESET, SIMPLE_NARRATOR } from "@homunculus/core";
import { backupBeforeMigrate, isDesktop, openDatabase } from "./db.ts";
import { offlineAiModule } from "./offline-ai.ts";
import { installStarterTrackers } from "./trackers.ts";
import { installConnectionProfiles } from "./connection.ts";

export interface AppServices {
  core: HomunculusCore;
  store: SqlStore;
  chat: ChatService;
  isDesktop: boolean;
}

const STARTER = {
  id: "starter-lyra",
  name: "Lyra",
  description: "A wary ranger who guards the road to the old mill. Silver hair, a weathered green cloak, a longbow always within reach.",
  personality: "Dry humor, suspicious of strangers, fiercely loyal once trust is earned.",
  scenario: "Dusk, at the gates of an abandoned mill on the edge of the forest.",
  firstMessages: ["*Lyra steps out of the shadow of the mill gate, an arrow already nocked.* \"That's close enough. Who sent you?\""],
};

async function boot(): Promise<AppServices> {
  const driver = await openDatabase();
  await migrate(driver, coreMigrations, { beforeMigrate: backupBeforeMigrate });
  const store = new SqlStore(driver);
  const core = new HomunculusCore({ tree: store, stateRepository: store });
  await core.loadModules([createOpenAICompatibleModule(), offlineAiModule, createSillyTavernCardsModule(), createSillyTavernPersonasModule(), createSillyTavernPresetsModule(), createSillyTavernLorebooksModule()]);
  const chat = new ChatService(core, store);
  await installStarterTrackers(store); // once; editable data, not code (D-017)
  await installConnectionProfiles(store); // once: the old single connection becomes a saved profile (D-020)
  // once: the built-in preset as editable data (D-021); deleting it later doesn't bring it back
  if (!(await store.getAppSetting("starterPresets"))) {
    if (!(await store.presets.get(DEFAULT_PRESET.id))) await store.savePreset(DEFAULT_PRESET);
    await store.setAppSetting("starterPresets", true);
  }
  // once (slice 4, D-029): the Simple Narrator, as editable data in the Vault; deleting it later doesn't bring it back
  if (!(await store.getAppSetting("starterNarrators"))) {
    if (!(await store.narrators.get(SIMPLE_NARRATOR.id))) await store.saveNarrator(SIMPLE_NARRATOR);
    await store.setAppSetting("starterNarrators", true);
  }
  // once (slice 3, D-027): cards imported before lorebooks existed get their embedded lorebook, linked to them
  if (!(await store.getAppSetting("embeddedLorebooksAdopted"))) {
    await adoptAllEmbeddedLorebooks(store);
    await store.setAppSetting("embeddedLorebooksAdopted", true);
  }
  // First run: a starter character and a first session, created here (once) and not in
  // React, which may run effects twice in development (that created 2 sessions — caught by e2e).
  const isFirstRun = (await store.listCharacters()).length === 0 && (await store.listSessions()).length === 0;
  if (isFirstRun) {
    await store.saveCharacter(STARTER);
    await chat.createSession({ title: `Session with ${STARTER.name}`, characterIds: [STARTER.id] });
  }
  return { core, store, chat, isDesktop };
}

export const servicesReady: Promise<AppServices> = boot();
