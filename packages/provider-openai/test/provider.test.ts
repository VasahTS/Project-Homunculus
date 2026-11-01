// Tests for the OpenAI-compatible provider, with simulated AI answers. Author: CLAUDE, 2026-10-23.
import { describe, expect, it } from "vitest";
import type { StreamChunk } from "@homunculus/core";
import { listModels, parseModels, streamChat } from "../src/index.ts";

/** Builds a fake streaming response, split into awkward chunks like real networks do. */
function sseResponse(lines: string[], chunkSize = 7, status = 200): Response {
  const text = lines.join("\n") + "\n";
  const bytes = new TextEncoder().encode(text);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) controller.enqueue(bytes.slice(i, i + chunkSize));
      controller.close();
    },
  });
  return new Response(stream, { status });
}

const delta = (s: string) => `data: ${JSON.stringify({ choices: [{ delta: { content: s } }] })}`;
const req = { connection: { providerId: "openai-compatible", model: "test/model", apiKey: "sk-test" }, messages: [{ role: "user" as const, content: "Hi" }] };

async function collect(it: AsyncIterable<StreamChunk>) { let s = ""; for await (const p of it) if (typeof p === "string") s += p; return s; }

describe("OpenAI-compatible provider", () => {
  it("streams the reply, ignoring keep-alive comments, and stops at [DONE]", async () => {
    let sent: { url: string; body: any; auth: string } | undefined;
    const fetchFn = async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>).Authorization! };
      return sseResponse([": OPENROUTER PROCESSING", delta("Hel"), "", delta("lo, "), delta("traveler."), "data: [DONE]", delta("IGNORED")]);
    };
    expect(await collect(streamChat(req, fetchFn))).toBe("Hello, traveler.");
    expect(sent!.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(sent!.body).toMatchObject({ model: "test/model", stream: true, messages: [{ role: "user", content: "Hi" }] });
    expect(sent!.auth).toBe("Bearer sk-test");
  });

  it("uses a custom address and maps parameters", async () => {
    let body: any; let url = "";
    const fetchFn = async (u: string, init: RequestInit) => { url = u; body = JSON.parse(String(init.body)); return sseResponse(["data: [DONE]"]); };
    await collect(streamChat({ ...req, connection: { ...req.connection, baseUrl: "http://localhost:5001/v1/", params: { temperature: 0.8, maxTokens: 300 } } }, fetchFn));
    expect(url).toBe("http://localhost:5001/v1/chat/completions");
    expect(body).toMatchObject({ temperature: 0.8, max_tokens: 300 });
  });

  it("sends the reasoning effort and the user's extra fields, but never lets them break the request", async () => {
    let body: any;
    const fetchFn = async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return sseResponse(["data: [DONE]"]); };
    await collect(streamChat({ ...req, connection: { ...req.connection, params: { reasoningEffort: "high" },
      extraBody: { provider: { order: ["z-ai"] }, stream: false, model: "x", messages: [] } } }, fetchFn));
    expect(body.reasoning).toEqual({ effort: "high" });
    expect(body.provider).toEqual({ order: ["z-ai"] });
    expect(body).toMatchObject({ stream: true, model: "test/model", messages: [{ role: "user", content: "Hi" }] });
  });

  it("explains HTTP errors in plain words", async () => {
    const fetchFn = async () => new Response('{"error":{"message":"Invalid API key"}}', { status: 401 });
    await expect(collect(streamChat(req, fetchFn))).rejects.toThrow(/answered 401.*Invalid API key/);
  });

  it("explains errors sent in the middle of the stream", async () => {
    const fetchFn = async () => sseResponse([delta("Once"), 'data: {"error":{"message":"Rate limited"}}']);
    await expect(collect(streamChat(req, fetchFn))).rejects.toThrow(/Rate limited/);
  });

  it("explains when the service cannot be reached", async () => {
    const fetchFn = async () => { throw new TypeError("Failed to fetch"); };
    await expect(collect(streamChat(req, fetchFn))).rejects.toThrow(/Could not reach https:\/\/openrouter\.ai/);
  });

  it("keeps a thinking model's reasoning apart from the reply, and reports usage", async () => {
    const fetchFn = async () => sseResponse([
      `data: ${JSON.stringify({ choices: [{ delta: { reasoning_content: "She is " } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: { reasoning: "scared." } }] })}`,
      delta("Who goes there?"),
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 120, completion_tokens: 8, cost: 0.0004 } })}`,
      "data: [DONE]",
    ]);
    const chunks: StreamChunk[] = [];
    for await (const c of streamChat(req, fetchFn)) chunks.push(c);
    expect(chunks.filter((c) => typeof c === "string").join("")).toBe("Who goes there?");
    expect(chunks.flatMap((c) => (typeof c === "object" && "reasoning" in c ? [c.reasoning] : [])).join("")).toBe("She is scared.");
    expect(chunks.find((c) => typeof c === "object" && "usage" in c)).toEqual({ usage: { tokensIn: 120, tokensOut: 8, cost: 0.0004 } });
  });

  it("lists models from OpenRouter (prices per token) and nano-gpt (prices per million), sorted by name", async () => {
    const openrouter = parseModels({ data: [
      { id: "z-ai/glm-5.3", name: "Z.ai: GLM 5.3", context_length: 200000, pricing: { prompt: "0.0000006", completion: "0.0000022" },
        reasoning: { supported_efforts: ["high", "medium", "low"] } },
      { id: "a/plain", name: "A Plain", pricing: { prompt: "0", completion: "0" } },
    ] });
    expect(openrouter.map((m) => m.id)).toEqual(["a/plain", "z-ai/glm-5.3"]);
    expect(openrouter[1]).toMatchObject({ contextLength: 200000, reasoning: true, efforts: ["high", "medium", "low"] });
    expect(openrouter[1]!.price!.input).toBeCloseTo(0.6);
    expect(openrouter[1]!.price!.output).toBeCloseTo(2.2);

    const nano = parseModels({ object: "list", data: [
      { id: "z-ai/glm-5.3:thinking", name: "GLM 5.3 Thinking", context_length: 128000, capabilities: { reasoning: true },
        pricing: { prompt: 0.5, completion: 2, unit: "per_million_tokens", currency: "USD" } },
      { id: "bare-id", object: "model" },
    ] });
    expect(nano.find((m) => m.id === "z-ai/glm-5.3:thinking")).toMatchObject({ reasoning: true, price: { input: 0.5, output: 2 } });
    expect(nano.find((m) => m.id === "bare-id")).toEqual({ id: "bare-id", name: undefined, description: undefined, contextLength: undefined, price: undefined, reasoning: undefined, efforts: undefined });
  });

  it("asks the right address for the model list, with the key, and explains errors", async () => {
    let url = ""; let auth = "";
    const ok = async (u: string, init: RequestInit) => {
      url = u; auth = (init.headers as Record<string, string>).Authorization ?? "";
      return new Response(JSON.stringify({ data: [{ id: "m" }] }), { status: 200 });
    };
    expect(await listModels({ providerId: "x", model: "", baseUrl: "https://nano-gpt.com/api/v1/", apiKey: "k" }, ok)).toHaveLength(1);
    expect(url).toBe("https://nano-gpt.com/api/v1/models?detailed=true");
    expect(auth).toBe("Bearer k");
    const bad = async () => new Response("nope", { status: 401 });
    await expect(listModels({ providerId: "x", model: "" }, bad)).rejects.toThrow(/answered 401 to the model list/);
  });
});

describe("tool calling and images (D-062)", () => {
  it("sends tools, images and tool results, and puts streamed tool calls back together", async () => {
    let body: Record<string, any> = {};
    const lines = [
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "find", arguments: "{\"qu" } }] } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "ery\":\"Lyra\"}" } }, { index: 1, id: "c2", function: { name: "guide", arguments: "{}" } }] } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls" }] })}`,
      "data: [DONE]",
    ];
    const fetchFn = async (_u: string, init: RequestInit) => { body = JSON.parse(String(init.body)); return sseResponse(lines); };
    const out: StreamChunk[] = [];
    for await (const c of streamChat({
      connection: { providerId: "x", model: "m" }, messages: [],
      tools: [{ name: "find", description: "d", parameters: { type: "object" } }],
      rich: [
        { role: "user", content: [{ type: "text", text: "look" }, { type: "image", mime: "image/png", base64: "QUJD" }] },
        { role: "assistant", content: "", toolCalls: [{ id: "c0", name: "read", arguments: "{}" }] },
        { role: "tool", toolCallId: "c0", content: "result" },
      ],
    }, fetchFn)) out.push(c);
    expect(body.tools[0]).toEqual({ type: "function", function: { name: "find", description: "d", parameters: { type: "object" } } });
    expect(body.messages[0].content[1]).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } });
    expect(body.messages[1]).toMatchObject({ role: "assistant", content: null, tool_calls: [{ id: "c0", type: "function", function: { name: "read", arguments: "{}" } }] });
    expect(body.messages[2]).toEqual({ role: "tool", tool_call_id: "c0", content: "result" });
    expect(out).toEqual([{ toolCalls: [{ id: "c1", name: "find", arguments: "{\"query\":\"Lyra\"}" }, { id: "c2", name: "guide", arguments: "{}" }] }]);
  });
});
