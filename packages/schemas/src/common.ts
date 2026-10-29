// Homunculus 2 — basic shapes shared by every other schema file. Author: CLAUDE, 2026-10-23.
import { z } from "zod";

export const Id = z.string().min(1);
export type Id = z.infer<typeof Id>;

/** Free-form JSON value. Used for module data and for untouched originals. */
export const Json: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(Json), z.record(z.string(), Json)]),
);

/** How the user takes part in the story (BLUEPRINT §2.2). */
export const UserRole = z.enum(["player", "coauthor", "director"]);
export type UserRole = z.infer<typeof UserRole>;

/** What kind of generation a turn is (BLUEPRINT §6). */
export const GenerationType = z.enum(["normal", "swipe", "continue", "impersonate", "letThemAct", "quiet"]);
export type GenerationType = z.infer<typeof GenerationType>;
