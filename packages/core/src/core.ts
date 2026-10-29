// Homunculus 2 — the core: small on purpose. Author: CLAUDE, 2026-10-23; v2 2026-10-27.
// It loads modules, announces events, keeps world state, holds the extension points and
// calls providers. Turns live in turn.ts, agents in agents/. Everything else is a module,
// including our own features. Map: docs/BLUEPRINT.md §8.
import { AgentConfig, TrackerSchema } from "@homunculus/schemas";
import { ConnectionService } from "./connections.ts";
import { EventBus, type ListenerError } from "./events.ts";
import {
  ExtensionPoint,
  type AgentDefinition,
  type AgentExecutor,
  type AgentToolDefinition,
  type CharacterExporter,
  type CharacterImporter,
  type PersonaImporter,
  type PresetExporter,
  type PresetImporter,
  type LorebookExporter,
  type LorebookImporter,
  type MacroDefinition,
  type PanelDefinition,
  type PromptBlockDefinition,
  type ProviderDefinition,
  type SettingDefinition,
  type SetupFieldDefinition,
} from "./extensions.ts";
import { MemoryStateRepository, WorldState, type MessageTree, type StateRepository } from "./state.ts";

export interface CoreEvents extends Record<string, unknown> {
  "module.loaded": { moduleId: string };
  "agent.started": { agentId: string; messageId: string; trigger: string };
  "agent.finished": { agentId: string; messageId: string; trigger: string };
  "agent.failed": { agentId: string; messageId: string; trigger: string; reason: string };
  /** Results the UI may show: choices, check results, proposals, speaker picks, notes. */
  "agent.output": { agentId: string; messageId: string; kind: string; output: unknown };
  "state.changed": { sessionId: string; messageId: string; namespaces: string[] };
  "message.created": { sessionId: string; messageId: string };
  "message.revised": { sessionId: string; messageId: string };
  "generation.started": { sessionId: string; parentId: string | null };
  "generation.finished": { sessionId: string; messageId: string };
  "generation.failed": { sessionId: string; parentId: string | null; reason: string };
  "turn.finished": { sessionId: string; messageId: string };
  "core.error": { source: string; message: string };
}

export interface ModuleManifest {
  id: string;
  version: string;
  dependsOn?: string[];
}

/** What a module is allowed to touch. Nothing else. */
export interface ModuleApi {
  readonly moduleId: string;
  on: <K extends keyof CoreEvents>(event: K, fn: (p: CoreEvents[K]) => void | Promise<void>) => () => void;
  registerAgent(agent: AgentDefinition<any>): void;
  registerAgentExecutor(runMode: string, executor: AgentExecutor): void;
  registerAgentTool(tool: AgentToolDefinition): void;
  registerTrackerSchema(schema: TrackerSchema | Parameters<typeof TrackerSchema.parse>[0]): void;
  registerPromptBlock(block: PromptBlockDefinition): void;
  registerSetupField(field: SetupFieldDefinition): void;
  registerMacro(macro: MacroDefinition): void;
  registerPanel(panel: PanelDefinition): void;
  registerSetting(setting: SettingDefinition): void;
  registerProvider(provider: ProviderDefinition): void;
  registerCharacterImporter(importer: CharacterImporter): void;
  registerCharacterExporter(exporter: CharacterExporter): void;
  registerPersonaImporter(importer: PersonaImporter): void;
  registerPresetImporter(importer: PresetImporter): void;
  registerPresetExporter(exporter: PresetExporter): void;
  registerLorebookImporter(importer: LorebookImporter): void;
  registerLorebookExporter(exporter: LorebookExporter): void;
  readonly state: WorldState;
}

export interface HomunculusModule {
  manifest: ModuleManifest;
  register(api: ModuleApi): void | Promise<void>;
}

export interface CoreOptions {
  tree: MessageTree;
  stateRepository?: StateRepository;
}

/** A built-in agent ready to run: its validated config and its code. */
export interface RegisteredAgent {
  config: AgentConfig;
  definition: AgentDefinition<any>;
}

export class HomunculusCore {
  readonly events: EventBus<CoreEvents>;
  readonly state: WorldState;
  readonly connections: ConnectionService;
  readonly agents = new ExtensionPoint<RegisteredAgent>("agent");
  readonly agentExecutors = new ExtensionPoint<AgentExecutor>("agent executor");
  readonly agentTools = new ExtensionPoint<AgentToolDefinition>("agent tool");
  readonly trackerSchemas = new ExtensionPoint<TrackerSchema>("tracker schema");
  readonly promptBlocks = new ExtensionPoint<PromptBlockDefinition>("prompt block");
  readonly setupFields = new ExtensionPoint<SetupFieldDefinition>("setup field");
  readonly macros = new ExtensionPoint<MacroDefinition>("macro");
  readonly panels = new ExtensionPoint<PanelDefinition>("panel");
  readonly settings = new ExtensionPoint<SettingDefinition>("setting");
  readonly providers = new ExtensionPoint<ProviderDefinition>("provider");
  readonly characterImporters = new ExtensionPoint<CharacterImporter>("character importer");
  readonly characterExporters = new ExtensionPoint<CharacterExporter>("character exporter");
  readonly personaImporters = new ExtensionPoint<PersonaImporter>("persona importer");
  readonly presetImporters = new ExtensionPoint<PresetImporter>("preset importer");
  readonly presetExporters = new ExtensionPoint<PresetExporter>("preset exporter");
  readonly lorebookImporters = new ExtensionPoint<LorebookImporter>("lorebook importer");
  readonly lorebookExporters = new ExtensionPoint<LorebookExporter>("lorebook exporter");
  private loaded = new Map<string, ModuleManifest>();

  constructor(options: CoreOptions) {
    this.events = new EventBus<CoreEvents>((e: ListenerError) => {
      if (e.event === "core.error") return; // never loop on our own error event
      void this.events.emit("core.error", { source: `${e.owner} on ${e.event}`, message: errorText(e.error) });
    });
    this.state = new WorldState(options.tree, options.stateRepository ?? new MemoryStateRepository());
    this.connections = new ConnectionService(this.providers);
  }

  /** Load modules in dependency order. Fails loudly on missing deps, cycles or duplicates. */
  async loadModules(modules: HomunculusModule[]): Promise<void> {
    for (const mod of sortByDependencies(modules, new Set(this.loaded.keys()))) {
      await mod.register(this.apiFor(mod.manifest.id));
      this.loaded.set(mod.manifest.id, mod.manifest);
      await this.events.emit("module.loaded", { moduleId: mod.manifest.id });
    }
  }

  loadedModules(): ModuleManifest[] { return [...this.loaded.values()]; }

  private apiFor(moduleId: string): ModuleApi {
    return {
      moduleId,
      on: (event, fn) => this.events.on(event, fn, moduleId),
      registerAgent: (a) => {
        const config = AgentConfig.parse({ runMode: "code", ...a.config, source: { kind: "builtin", from: moduleId } });
        this.agents.add(config.id, { config, definition: a }, moduleId);
      },
      registerAgentExecutor: (mode, ex) => this.agentExecutors.add(mode, ex, moduleId),
      registerAgentTool: (t) => this.agentTools.add(t.id, t, moduleId),
      registerTrackerSchema: (s) => { const v = TrackerSchema.parse(s); this.trackerSchemas.add(v.id, v, moduleId); },
      registerPromptBlock: (b) => this.promptBlocks.add(b.id, b, moduleId),
      registerSetupField: (f) => this.setupFields.add(f.id, f, moduleId),
      registerMacro: (m) => this.macros.add(m.name, m, moduleId),
      registerPanel: (p) => this.panels.add(p.id, p, moduleId),
      registerSetting: (s) => this.settings.add(s.id, s, moduleId),
      registerProvider: (p) => this.providers.add(p.id, p, moduleId),
      registerCharacterImporter: (i) => this.characterImporters.add(i.id, i, moduleId),
      registerCharacterExporter: (x) => this.characterExporters.add(x.id, x, moduleId),
      registerPersonaImporter: (i) => this.personaImporters.add(i.id, i, moduleId),
      registerPresetImporter: (i) => this.presetImporters.add(i.id, i, moduleId),
      registerPresetExporter: (x) => this.presetExporters.add(x.id, x, moduleId),
      registerLorebookImporter: (i) => this.lorebookImporters.add(i.id, i, moduleId),
      registerLorebookExporter: (x) => this.lorebookExporters.add(x.id, x, moduleId),
      state: this.state,
    };
  }
}

export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Topological sort: a module always loads after the modules it depends on. */
export function sortByDependencies(modules: HomunculusModule[], alreadyLoaded = new Set<string>()): HomunculusModule[] {
  const byId = new Map<string, HomunculusModule>();
  for (const m of modules) {
    if (byId.has(m.manifest.id) || alreadyLoaded.has(m.manifest.id)) {
      throw new Error(`Module "${m.manifest.id}" is defined twice`);
    }
    byId.set(m.manifest.id, m);
  }
  const result: HomunculusModule[] = [];
  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (id: string, chain: string[]) => {
    if (done.has(id) || alreadyLoaded.has(id)) return;
    if (visiting.has(id)) throw new Error(`Module dependency cycle: ${[...chain, id].join(" -> ")}`);
    const mod = byId.get(id);
    if (!mod) throw new Error(`Module "${chain.at(-1)}" depends on "${id}", which is not installed`);
    visiting.add(id);
    for (const dep of mod.manifest.dependsOn ?? []) visit(dep, [...chain, id]);
    visiting.delete(id);
    done.add(id);
    result.push(mod);
  };
  for (const id of byId.keys()) visit(id, []);
  return result;
}
