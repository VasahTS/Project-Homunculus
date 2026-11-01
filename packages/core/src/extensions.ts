// Homunculus 2 — extension points and module/agent contracts. Author: CLAUDE, 2026-10-23; agents v2 2026-10-27.
// Map of what plugs in where: docs/BLUEPRINT.md §8.
import type { z } from "zod";
import type {
  AgentConfig, AgentConfigInput, Avatar, TrackerSchema, Character, CharacterInput, Lorebook, LorebookInput, PersonaInput, Preset, PresetInput, GenerationType, Message, StateDelta, TrackerSchemaInput,
} from "@homunculus/schemas";
import type { ResolvedState } from "./state.ts";
import type { TrackerCastMember } from "./trackers.ts";

/**
 * A named place where modules plug things in (agents, macros, providers...).
 * Adding a new kind of feature = adding a new extension point, never a shortcut in the core.
 */
export class ExtensionPoint<T> {
  private items = new Map<string, { owner: string; item: T }>();
  constructor(readonly kind: string) {}

  add(id: string, item: T, owner: string): void {
    const existing = this.items.get(id);
    if (existing) {
      throw new Error(`${this.kind} "${id}" is already registered by module "${existing.owner}"`);
    }
    this.items.set(id, { owner, item });
  }

  get(id: string): T | undefined { return this.items.get(id)?.item; }
  ownerOf(id: string): string | undefined { return this.items.get(id)?.owner; }
  ids(): string[] { return [...this.items.keys()]; }
  all(): T[] { return [...this.items.values()].map((v) => v.item); }
}

// ---------------------------------------------------------------- AI providers and connections

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

/** What a provider streams: text, reasoning of thinking models, usage numbers at the end, or the tools the model called. */
export type StreamChunk =
  | string
  | { reasoning: string }
  | { usage: { tokensIn?: number; tokensOut?: number; cost?: number } }
  | { toolCalls: ToolCall[] };

// ---- tool calling and images (the Library Assistant, D-062) ----

/** A tool the model may call: a name, what it does, and its arguments as JSON Schema. */
export interface ToolSpec { name: string; description: string; parameters: Record<string, unknown> }
/** A call the model made: `arguments` is the JSON text the model wrote (may be invalid). */
export interface ToolCall { id: string; name: string; arguments: string }
export type ContentPart = { type: "text"; text: string } | { type: "image"; mime: string; base64: string };
/** A turn that can carry images, tool calls and tool results (only used where `GenerateRequest.rich` is). */
export interface RichTurn {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[];
  toolCalls?: ToolCall[];
  /** For role "tool": the call this answers. */
  toolCallId?: string;
}

export interface ConnectionLimits {
  /** At most this many calls at the same time on this connection (agents run in parallel). */
  maxConcurrent?: number;
  /** Wait at least this long between the start of two calls. */
  minIntervalMs?: number;
}

/** Which provider/model to use and how to reach it. The API key never goes in the database (D-011). */
export interface ConnectionConfig {
  providerId: string;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  params?: {
    temperature?: number; maxTokens?: number; topP?: number; reasoningEffort?: string;
    frequencyPenalty?: number; presencePenalty?: number; topK?: number; minP?: number; repetitionPenalty?: number;
  };
  /** Extra fields for the request body (user-set; providers merge them in). */
  extraBody?: Record<string, unknown>;
  /** The connection profile this came from, when there is one. */
  profileId?: string;
  limits?: ConnectionLimits;
  /** Tried when this connection fails before sending any text. */
  fallback?: ConnectionConfig;
}

export interface GenerateRequest {
  connection: ConnectionConfig;
  messages: ChatTurn[];
  signal?: AbortSignal;
  /** Tools the model may call (providers that cannot, ignore them). */
  tools?: ToolSpec[];
  /** Turns with images / tool calls; when set, providers send these instead of `messages`. */
  rich?: RichTurn[];
}

/** One model a service offers (for the model picker). Prices are USD per million tokens. */
export interface ModelInfo {
  id: string;
  name?: string;
  description?: string;
  contextLength?: number;
  price?: { input?: number; output?: number };
  /** The model thinks before answering. */
  reasoning?: boolean;
  /** Reasoning effort levels the model accepts (undefined = not known / all). */
  efforts?: string[];
}

export interface ProviderDefinition {
  id: string;
  name: string;
  help: string;
  /** Streams the reply piece by piece. Throws a readable Error on failure. */
  stream(req: GenerateRequest): AsyncIterable<StreamChunk>;
  /** The models the service offers, when it can tell (only address and key are used). */
  listModels?(connection: ConnectionConfig, signal?: AbortSignal): Promise<ModelInfo[]>;
}

/** The result of a whole (non-streamed) AI call. */
export interface Completion {
  text: string;
  reasoning: string;
  model: string;
  tokensIn?: number;
  tokensOut?: number;
  cost?: number;
}

// ---------------------------------------------------------------- Agents (BLUEPRINT §4)

/** Everything an agent may read when it runs. */
export interface AgentRunContext {
  agent: AgentConfig;
  sessionId: string;
  /** The message the agent works on (the reply for "after", the parent for "before"). */
  messageId: string;
  /** e.g. "turn.before", "turn.after", "everyN", "manual". */
  trigger: string;
  generationType: GenerationType;
  /** World state as of `messageId`. */
  state: ResolvedState;
  /** The conversation up to `messageId` (only the last `agent.input.messages`, oldest first). */
  messages: Message[];
  /** The reply text (after phase) or the user's text (before phase). */
  text: string;
  /** Results of the agents listed in `agent.input.readsAgents` that already ran. */
  results: Record<string, unknown>;
  /** Per-layer settings for this agent (SetupLayer.agentOverrides[id].settings). */
  settings: Record<string, unknown>;
  /** Names for {{char}} / {{user}} and for reading the transcript. */
  names: { char: string; user: string; bySpeaker: (m: Message) => string };
  /** Calls the AI on this agent's connection (respects limits, fallback and Stop). */
  complete(messages: ChatTurn[], options?: { maxTokens?: number }): Promise<Completion>;
  signal?: AbortSignal;
  /** For trackers (state agents with a field set): the fields and who can have per-character values. */
  tracker?: { schema: TrackerSchema; people: TrackerCastMember[] };
  /** The cast's character cards, short (agents with input.cards): the chat's characters, the story's narrator and NPCs. */
  cards?: string;
  /** The user's persona (input.persona), the scenario (input.scenario) and the lorebook entries that went into the
   * latest reply's prompt (input.lorebooks). D-048. */
  persona?: string;
  scenario?: string;
  lore?: string;
  /** For lorebook proposals: the entries the story's version already has (title and keywords), so it adds only what is new. */
  loreIndex?: string;
  /** This chat's Author's Note text (input.authorsNote, D-059). */
  authorsNote?: string;
  /** The chat's chapter summaries on this branch (input.chapters, D-059). */
  chapters?: string;
  /** This agent's own latest notes on this branch, oldest first (input.previousNotes, D-059). */
  previousNotes?: string[];
}

/** A built-in agent: its data plus code. User agents are only data (AgentConfig) and run through an executor. */
export interface AgentDefinition<Out = unknown> {
  config: AgentConfigInput;
  /** Shape the agent's answer must have. Checked before anything is saved. */
  output: z.ZodType<Out>;
  run(ctx: AgentRunContext): Promise<unknown>;
  /** For `state` agents: turns a valid answer into world-state changes. Default: { [namespace]: answer }. */
  toState?(output: Out): StateDelta;
}

/** Runs data agents of one run mode (e.g. "separate"). */
export type AgentExecutor = (ctx: AgentRunContext) => Promise<unknown>;

/** A tool an agent may call (e.g. "search the lorebook"). Contract only; used from slice 5. */
export interface AgentToolDefinition {
  id: string;
  name: string;
  help: string;
  /** JSON schema of the arguments, as the AI sees it. */
  parameters: Record<string, unknown>;
  call(args: unknown, ctx: { sessionId: string; messageId: string }): Promise<unknown>;
}

// ---------------------------------------------------------------- Prompt blocks, trackers, setup fields

/** A marker in a preset that a module fills (character card, cast, current scene…). Used from slice 2. */
export interface PromptBlockDefinition {
  id: string;
  name: string;
  help: string;
  /** Where it goes when the preset has no place for it. */
  defaultPosition: { anchor: "start" | "beforeHistory" | "afterHistory" | "depth"; depth?: number };
  render(ctx: { sessionId: string; messageId: string | null; state: ResolvedState }): Promise<string>;
}

/** A tracker schema shipped by a module (field packs: RPG, Drama…). */
export type TrackerSchemaDefinition = TrackerSchemaInput;

/** A new item in the layered setup (BLUEPRINT §3), stored in SetupLayer.extra[id]. */
export interface SetupFieldDefinition {
  id: string;
  label: string;
  help: string;
  default: unknown;
}

// ---------------------------------------------------------------- Import / export (the SillyTavern "border" lives here)

export interface ImportedCharacter {
  character: CharacterInput;
  avatar?: Avatar;
  /** Plain-language notes for the user (e.g. "embedded lorebook kept for later"). */
  warnings: string[];
}

export interface CharacterImporter {
  id: string;
  name: string;
  help: string;
  /** File extensions this importer understands, e.g. [".png", ".json"]. */
  extensions: string[];
  import(bytes: Uint8Array, fileName: string): Promise<ImportedCharacter[]>;
}

export interface ExportedFile {
  fileName: string;
  mime: string;
  bytes: Uint8Array;
}

export interface CharacterExporter {
  id: string;
  name: string;
  help: string;
  export(character: Character, avatar?: Avatar): Promise<ExportedFile>;
}

export interface ImportedPersona {
  persona: PersonaInput;
  avatar?: Avatar;
  /** The file said this was the user's default persona. */
  isDefault?: boolean;
}

/** Imports personas. Gets ALL the files picked together (e.g. a backup JSON plus the persona images). */
export interface PersonaImporter {
  id: string;
  name: string;
  help: string;
  extensions: string[];
  import(files: Array<{ name: string; bytes: Uint8Array }>): Promise<{ personas: ImportedPersona[]; warnings: string[] }>;
}

/** Imports a preset file (e.g. a SillyTavern Chat Completion preset). */
export interface PresetImporter {
  id: string;
  name: string;
  help: string;
  extensions: string[];
  import(bytes: Uint8Array, fileName: string): Promise<{ preset: PresetInput; warnings: string[] }>;
}

export interface PresetExporter {
  id: string;
  name: string;
  help: string;
  export(preset: Preset): Promise<ExportedFile & { warnings: string[] }>;
}

/** Imports a lorebook file (e.g. a SillyTavern World Info file). The id is given when it is saved. */
export interface LorebookImporter {
  id: string;
  name: string;
  help: string;
  extensions: string[];
  import(bytes: Uint8Array, fileName: string): Promise<{ lorebook: Omit<LorebookInput, "id">; warnings: string[] }>;
}

export interface LorebookExporter {
  id: string;
  name: string;
  help: string;
  export(book: Lorebook): Promise<ExportedFile & { warnings: string[] }>;
}

// ---------------------------------------------------------------- Other extension contracts (minimal for now)

export interface SettingDefinition {
  id: string;
  label: string;
  help: string;
  default: unknown;
}

export interface MacroDefinition {
  name: string; // e.g. "char" for {{char}}
  resolve(ctx: Record<string, unknown>, args: string[]): string;
}

export interface PanelDefinition {
  id: string;
  title: string;
  /** Which world-state namespace the panel shows. */
  stateNamespace: string;
  /** The tracker schema that tells the UI how to draw and edit it. */
  schemaId?: string;
}
