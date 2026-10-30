// Homunculus 2 — appearance profiles as data. Author: CLAUDE, 2026-10-27 (D-018).
//
// Same idea as Homunculus v1's "Customize" screen: a VISUAL PROFILE bundles colors + fonts (theme tokens),
// a LAYOUT (where the menus live) and optional EFFECTS, plus small per-profile tweaks; profiles can be
// imported/exported. Profiles are DATA: nothing in a screen changes when a profile is added or edited.
//
//  - tokens:  values for the design tokens of theme/tokens.css (missing = default). The built-in
//             "graphite" profile is tokens.css itself (no overrides).
//  - layout:  id of a shell layout. Today only "inspector" exists (sidebar + story + inspector); other
//             layouts (e.g. a "classic" one with menus in a top bar) plug in as new shell components.
//  - effects: ids of optional visual effects (none yet). Each effect is a small module that reads its
//             own tweak values and must respect reduced motion.
//  - css:     extra CSS for what tokens can't express. It may target ONLY the stable data-region hooks
//             (sidebar, toolbar, inspector, story, message, composer, library, editor…) — their names
//             never change once shipped (D-018).

export interface AppearanceProfile {
  id: string;
  name: string;
  description: string;
  tokens: Record<string, string>;
  layout: string;
  effects: string[];
  /** Per-profile tweak values (e.g. an effect's color), read by effects. */
  tweaks: Record<string, string | number | boolean>;
  css?: string;
}

export const DEFAULT_PROFILE_ID = "quiet";

export const BUILTIN_PROFILES: AppearanceProfile[] = [
  {
    id: "graphite", name: "Graphite", description: "Neutral dark graphite with a verdigris accent. Sidebar, story and inspector.",
    tokens: {}, layout: "inspector", effects: [], tweaks: {},
  },
  {
    id: "quiet", name: "Quiet", description: "The approved graphite collection layout with restrained green selection and a quiet Library hierarchy.",
    layout: "inspector", effects: [], tweaks: {},
    tokens: {
      window: "#1b1d20", backdrop: "#1b1d20", surface: "#23272a", field: "#292d30",
      label: "#edf0ed", "label-2": "#afb8b5", "label-3": "#9eaaa3", separator: "#3b4244",
      accent: "#8bc4b0", "accent-ink": "#142b24", "accent-soft": "rgba(139,196,176,.075)",
      "focus-ring": "#a7d9c7", "glass": "#222528", "glass-edge": "#303639", "glass-blur": "none",
      "shadow-float": "none", "collection-title": "26px", "collection-cover": "178px",
    },
    css: '[data-region="app"] { gap: 0; padding: 0; } [data-region="sidebar"] { border-radius: 0; box-shadow: none; border-right: 1px solid var(--glass-edge); padding: 27px 16px 18px; }',
  },
];

export const LAYOUTS = ["inspector"] as const;

const STYLE_ID = "homunculus-profile-css";

/** Applies a profile to the whole window: token overrides on <html>, extra CSS in one <style>. */
export function applyProfile(p: AppearanceProfile, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = p.id;
  root.dataset.layout = p.layout;
  for (const prop of [...root.style]) if (prop.startsWith("--")) root.style.removeProperty(prop);
  for (const [name, value] of Object.entries(p.tokens)) root.style.setProperty(`--${name}`, value);
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) { style = document.createElement("style"); style.id = STYLE_ID; document.head.append(style); }
  style.textContent = p.css ?? "";
}
