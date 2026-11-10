// Homunculus 2 — cards the Assistant puts in front of the user to decide (D-115). Author: CLAUDE, 2026-11-10.
//
// "What I Understood" (show_understanding): the story as the Assistant read it, in parts the user corrects in place
// (pencil, Merge…); the corrected card is what the model reads from the next message on.
// Questions with buttons (ask): one question at a time, 2–5 options (+ Other…); the answers go back as one message.
// Both end the reply: the model waits for the user. Daniel's approved draft: docs/drafts/vision-comic boards 5–6.
import type { AssistantResult } from "@homunculus/schemas";
import type { ToolSpec } from "@homunculus/core";

export type Understood = Extract<AssistantResult, { type: "understood" }>;
export type Question = Extract<AssistantResult, { type: "question" }>;

/** Tools after which the reply ends (the user answers on the card). */
export const WAITING_TOOLS = ["show_understanding", "ask"];

export const UNDERSTANDING_SPEC: ToolSpec = {
  name: "show_understanding",
  description: "Show the user \"What I Understood\" of a story you read (a comic, a long text) as a card they can correct before anything is made. Your reply ends after it: the user confirms or corrects, then you go on.",
  parameters: { type: "object", properties: {
    title: { type: "string", description: "The story's title." },
    synopsis: { type: "string", description: "3–5 sentences." },
    cast: { type: "array", description: "Main people first, minor ones last.", items: { type: "object", properties: {
      id: { type: "string", description: "The cast id from read_comic (A, B…)." }, name: { type: "string" },
      looks: { type: "string" }, personality: { type: "string", description: "Personality and way of speaking." },
      line: { type: "string", description: "One real line of theirs, word for word." }, pages: { type: "string", description: "Where they appear or where the line is, e.g. \"p. 3, 6–7\"." },
    }, required: ["id", "name"] } },
    relationships: { type: "string" }, setting: { type: "string" },
    scenes: { type: "string", description: "Key scenes with pages: \"the door jams (p. 2) · …\"." },
    unsure: { type: "string", description: "What you are not sure of (an unclear speaker, two drawings that may be one person). Empty when nothing." },
  }, required: ["synopsis", "cast"] },
};

export const ASK_SPEC: ToolSpec = {
  name: "ask",
  description: "Ask the user 1–4 questions with buttons instead of a paragraph, when you need their choice to go on. They answer one at a time on a card; the answers come back as their next message. Your reply ends after it.",
  parameters: { type: "object", properties: {
    questions: { type: "array", minItems: 1, maxItems: 4, items: { type: "object", properties: {
      question: { type: "string" },
      options: { type: "array", minItems: 2, maxItems: 5, items: { type: "object", properties: {
        label: { type: "string", description: "A few words." }, detail: { type: "string", description: "One short line (optional)." },
        cast: { type: "string", description: "A cast id (A, B…) when the option is a person of the story: shows their face (optional)." },
      }, required: ["label"] } },
    }, required: ["question", "options"] } },
  }, required: ["questions"] },
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export function understoodFrom(a: Obj, id: string): Understood {
  const cast = (Array.isArray(a.cast) ? a.cast : []).filter(isObj).map((c, i) => ({
    id: str(c.id) || String.fromCharCode(65 + i), name: str(c.name), looks: str(c.looks), personality: str(c.personality), line: str(c.line), pages: str(c.pages),
  }));
  if (!str(a.synopsis) || !cast.length) throw new Error("show_understanding needs a synopsis and the cast.");
  return { type: "understood", id, title: str(a.title), synopsis: str(a.synopsis), relationships: str(a.relationships), setting: str(a.setting), scenes: str(a.scenes), unsure: str(a.unsure), cast, edited: [], merged: [], confirmed: false };
}

export function questionFrom(a: Obj, id: string): Question {
  const questions = (Array.isArray(a.questions) ? a.questions : []).filter(isObj).slice(0, 4).map((q) => ({
    question: str(q.question),
    options: (Array.isArray(q.options) ? q.options : []).filter(isObj).slice(0, 5).map((o) => ({ label: str(o.label), detail: str(o.detail), cast: str(o.cast) })).filter((o) => o.label),
  })).filter((q) => q.question && q.options.length >= 2);
  if (!questions.length) throw new Error("ask needs at least one question with two options.");
  return { type: "question", id, questions, answers: [], done: false };
}

/** The card as the model reads it later: the user's corrections win and are marked. */
export function understoodText(r: Understood): string {
  const mark = (k: string) => (r.edited.includes(k) ? " (corrected by the user)" : "");
  const lines = [`[What I Understood${r.title ? ` — ${r.title}` : ""}${r.confirmed ? " — the user said it looks right" : ""}]`, `Synopsis${mark("synopsis")}: ${r.synopsis}`, `Cast${mark("cast")}:`];
  for (const c of r.cast) lines.push(`- ${c.id} ${c.name}: ${[c.looks, c.personality].filter(Boolean).join(" | ")}${c.line ? ` — "${c.line}"` : ""}${c.pages ? ` (${c.pages})` : ""}`);
  for (const m of r.merged) lines.push(`- The user merged ${m}: they are the same person.`);
  if (r.relationships) lines.push(`Relationships${mark("relationships")}: ${r.relationships}`);
  if (r.setting) lines.push(`Setting${mark("setting")}: ${r.setting}`);
  if (r.scenes) lines.push(`Key scenes${mark("scenes")}: ${r.scenes}`);
  if (r.unsure) lines.push(`Unsure: ${r.unsure}`);
  return lines.join("\n");
}

export function questionText(r: Question): string {
  return r.questions.map((q, i) => `[Asked: ${q.question} — ${r.answers[i] !== undefined ? `answered: ${r.answers[i]}` : "not answered"}]`).join("\n");
}

/** The user's answers as one message. */
export const answersMessage = (r: Question, answers: string[]) =>
  r.questions.map((q, i) => (r.questions.length === 1 ? answers[i] ?? "" : `${q.question} ${answers[i] ?? ""}`)).join("\n");

/** Merges person `from` into `into` on the card (Merge…). */
export function mergeCastOn(r: Understood, from: string, into: string): Understood {
  const a = r.cast.find((c) => c.id === from), b = r.cast.find((c) => c.id === into);
  if (!a || !b || a === b) return r;
  const pages = [b.pages, a.pages].filter(Boolean).join(", ");
  const merged = { ...b, name: b.name || a.name, looks: b.looks || a.looks, personality: [b.personality, a.personality].filter(Boolean).join(" "), line: b.line || a.line, pages };
  return { ...r, cast: r.cast.filter((c) => c !== a).map((c) => (c === b ? merged : c)), merged: [...r.merged, `${a.id}${a.name ? ` ${a.name}` : ""} into ${b.id}${b.name ? ` ${b.name}` : ""}`], edited: r.edited.includes("cast") ? r.edited : [...r.edited, "cast"] };
}
