// Separate generated text/reasoning counts; estimates describe the current message. Author: CODEX, 2026-11-03.
import type { GenerationRecord } from "@homunculus/schemas";

type Usage = Pick<GenerationRecord, "tokensOut" | "tokensReasoning">;
const valid = (n: number | undefined): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const estimate = (text: string) => Math.ceil(text.length / 4);

export function messageTokenCounts(message: { content: string; reasoning?: string }, usage?: Usage, edited = false) {
  const reasoningKnown = valid(usage?.tokensReasoning);
  const textKnown = !edited && reasoningKnown && valid(usage?.tokensOut) && usage.tokensOut >= usage.tokensReasoning!;
  return {
    text: textKnown ? usage!.tokensOut! - usage!.tokensReasoning! : estimate(message.content),
    reasoning: reasoningKnown ? usage!.tokensReasoning! : estimate(message.reasoning ?? ""),
    textEstimated: !textKnown,
    reasoningEstimated: !reasoningKnown,
  };
}
