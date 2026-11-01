// Homunculus 2 — shared data shapes (Zod). Author: CLAUDE, 2026-10-23; split by area 2026-10-27.
// Every piece of data that crosses a boundary (database, modules, agents, UI)
// has a shape defined here and is validated against it. Map: docs/BLUEPRINT.md §2.
export * from "./common.ts";
export * from "./library.ts";
export * from "./setup.ts";
export * from "./play.ts";
export * from "./vault.ts";
export * from "./agents.ts";
export * from "./trackers.ts";
export * from "./presets.ts";
export * from "./lorebooks.ts";
export * from "./records.ts";
export * from "./legacy.ts";
export * from "./regex.ts";
