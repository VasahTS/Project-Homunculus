// Homunculus 2 — module: OpenAI-compatible chat provider (OpenRouter, OpenAI, many local servers).
// Author: CLAUDE, 2026-10-23.
import type { ConnectionConfig, GenerateRequest, HomunculusModule, ModelInfo, StreamChunk } from "@homunculus/core";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1";

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/** Reads a Server-Sent Events body and yields each `data:` payload. */
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, "");
        buffer = buffer.slice(newline + 1);
        if (line.startsWith("data:")) yield line.slice(5).trimStart();
        // lines starting with ":" are keep-alive comments (OpenRouter sends them) — ignored
      }
    }
    const last = buffer.trim();
    if (last.startsWith("data:")) yield last.slice(5).trimStart();
  } finally {
    reader.releaseLock();
  }
}

export async function* streamChat(req: GenerateRequest, fetchFn: FetchLike): AsyncGenerator<StreamChunk> {
  const { connection } = req;
  const base = (connection.baseUrl ?? OPENROUTER_URL).replace(/\/+$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (connection.apiKey) headers.Authorization = `Bearer ${connection.apiKey}`;

  const body: Record<string, unknown> = {
    model: connection.model,
    messages: req.messages,
    stream: true,
  };
  const p = connection.params ?? {};
  if (p.temperature !== undefined) body.temperature = p.temperature;
  if (p.maxTokens !== undefined) body.max_tokens = p.maxTokens;
  if (p.topP !== undefined) body.top_p = p.topP;
  if (p.frequencyPenalty !== undefined) body.frequency_penalty = p.frequencyPenalty;
  if (p.presencePenalty !== undefined) body.presence_penalty = p.presencePenalty;
  if (p.topK !== undefined) body.top_k = p.topK;
  if (p.minP !== undefined) body.min_p = p.minP;
  if (p.repetitionPenalty !== undefined) body.repetition_penalty = p.repetitionPenalty;
  // thinking models: OpenRouter and nano-gpt both take { reasoning: { effort } }
  if (p.reasoningEffort) body.reasoning = { effort: p.reasoningEffort };
  // the user's extra fields win, except the ones the app needs to work (model, messages, stream)
  for (const [k, v] of Object.entries(connection.extraBody ?? {})) {
    if (k !== "messages" && k !== "stream" && k !== "model") body[k] = v;
  }

  let res: Response;
  try {
    res = await fetchFn(`${base}/chat/completions`, {
      method: "POST", headers, body: JSON.stringify(body), signal: req.signal,
    });
  } catch (e) {
    throw new Error(`Could not reach ${base}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`The AI service answered ${res.status}: ${text.slice(0, 300) || res.statusText}`);
  }

  for await (const data of readSse(res.body)) {
    if (data === "[DONE]") return;
    let json: {
      choices?: Array<{ delta?: { content?: string; reasoning?: string; reasoning_content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
      error?: { message?: string };
    };
    try { json = JSON.parse(data); } catch { continue; }
    if (json.error) throw new Error(`The AI service reported an error: ${json.error.message ?? "unknown"}`);
    const delta = json.choices?.[0]?.delta;
    // thinking models: OpenRouter sends `reasoning`, DeepSeek/GLM-style servers `reasoning_content`
    const thought = delta?.reasoning ?? delta?.reasoning_content;
    if (thought) yield { reasoning: thought };
    if (delta?.content) yield delta.content;
    if (json.usage) {
      yield { usage: { tokensIn: json.usage.prompt_tokens, tokensOut: json.usage.completion_tokens, cost: json.usage.cost } };
    }
  }
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : undefined;
};

/**
 * Reads a /models answer into ModelInfo. Understands OpenRouter (prices per token as strings,
 * `reasoning.supported_efforts`) and nano-gpt's detailed list (prices per million, `capabilities.reasoning`);
 * any other OpenAI-compatible server gives at least the ids.
 */
export function parseModels(json: unknown): ModelInfo[] {
  const list = (json as { data?: unknown })?.data ?? json;
  if (!Array.isArray(list)) throw new Error("The service's model list has an unexpected shape.");
  const out: ModelInfo[] = [];
  for (const m of list as Array<Record<string, any>>) {
    if (!m || typeof m.id !== "string") continue;
    const p = m.pricing ?? {};
    const perMillion = p.unit === "per_million_tokens";
    const scale = (v: unknown) => { const n = num(v); return n === undefined || n < 0 ? undefined : perMillion ? n : n * 1_000_000; };
    const efforts = Array.isArray(m.reasoning?.supported_efforts) ? (m.reasoning.supported_efforts as unknown[]).filter((x): x is string => typeof x === "string") : undefined;
    const input = scale(p.prompt);
    const output = scale(p.completion);
    out.push({
      id: m.id,
      name: typeof m.name === "string" && m.name.trim() ? m.name : undefined,
      description: typeof m.description === "string" ? m.description.slice(0, 300) : undefined,
      contextLength: num(m.context_length) ?? num(m.top_provider?.context_length),
      price: input !== undefined || output !== undefined ? { input, output } : undefined,
      reasoning: m.reasoning ? true : m.capabilities?.reasoning === true ? true : undefined,
      efforts: efforts?.length ? efforts : undefined,
    });
  }
  return out.sort((a, b) => (a.name ?? a.id).localeCompare(b.name ?? b.id));
}

export async function listModels(connection: ConnectionConfig, fetchFn: FetchLike, signal?: AbortSignal): Promise<ModelInfo[]> {
  const base = (connection.baseUrl ?? OPENROUTER_URL).replace(/\/+$/, "");
  const headers: Record<string, string> = {};
  if (connection.apiKey) headers.Authorization = `Bearer ${connection.apiKey}`;
  let res: Response;
  try {
    // detailed=true: nano-gpt then adds names, prices and capabilities; other services ignore it
    res = await fetchFn(`${base}/models?detailed=true`, { method: "GET", headers, signal });
  } catch (e) {
    throw new Error(`Could not reach ${base}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`The AI service answered ${res.status} to the model list: ${text.slice(0, 200) || res.statusText}`);
  }
  return parseModels(await res.json());
}

export function createOpenAICompatibleModule(fetchFn: FetchLike = (i, init) => fetch(i, init)): HomunculusModule {
  return {
    manifest: { id: "provider-openai", version: "0.0.1" },
    register(api) {
      api.registerProvider({
        id: "openai-compatible",
        name: "OpenAI-compatible (OpenRouter, OpenAI, local servers)",
        help: "Works with OpenRouter by default. For other services, set their address (base URL) and API key.",
        stream: (req) => streamChat(req, fetchFn),
        listModels: (connection, signal) => listModels(connection, fetchFn, signal),
      });
    },
  };
}
