// Message counts must never mix visible text with reasoning. Author: CODEX, 2026-11-03.
import { describe, expect, it } from "vitest";
import { messageTokenCounts } from "../src/ui/message-metadata.ts";

describe("message token counts", () => {
  const message = { content: "A short reply.", reasoning: "A separate thought." };
  it("subtracts reported reasoning from completion tokens without changing billing totals", () => {
    expect(messageTokenCounts(message, { tokensOut: 745, tokensReasoning: 170 })).toEqual({ text: 575, reasoning: 170, textEstimated: false, reasoningEstimated: false });
  });
  it("uses the provider's count even when reasoning text is hidden", () => {
    expect(messageTokenCounts({ content: "Done." }, { tokensOut: 30, tokensReasoning: 25 })).toMatchObject({ text: 5, reasoning: 25, textEstimated: false });
  });
  it("estimates the two texts independently when no breakdown was reported", () => {
    expect(messageTokenCounts(message, { tokensOut: 745 })).toEqual({ text: 4, reasoning: 5, textEstimated: true, reasoningEstimated: true });
  });
  it("keeps an explicit zero distinct from an absent count", () => {
    expect(messageTokenCounts({ content: "Done." }, { tokensOut: 10, tokensReasoning: 0 })).toMatchObject({ text: 10, reasoning: 0, textEstimated: false, reasoningEstimated: false });
  });
  it("recounts edited text instead of keeping the generated response's count", () => {
    expect(messageTokenCounts(message, { tokensOut: 745, tokensReasoning: 170 }, true)).toMatchObject({ text: 4, textEstimated: true, reasoning: 170 });
  });
  it("rejects inconsistent counts and handles empty messages", () => {
    expect(messageTokenCounts({ content: "" })).toEqual({ text: 0, reasoning: 0, textEstimated: true, reasoningEstimated: true });
    expect(messageTokenCounts(message, { tokensOut: 1, tokensReasoning: 170 })).toMatchObject({ text: 4, textEstimated: true });
  });
});
