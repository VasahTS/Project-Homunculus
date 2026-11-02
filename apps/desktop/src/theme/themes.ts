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

export const DEFAULT_PROFILE_ID = "mono";

export const BUILTIN_PROFILES: AppearanceProfile[] = [
  {
    // D-073 (2026-11-01): Daniel's neutral look, from his "Fontstore" reference with white in place of pink.
    // Black, grey and white; square corners; panels split by hairlines instead of floating; white is the one
    // strong thing on a screen (the main button, the selected tab). Geist for the interface, Archivo for big titles.
    id: "mono", name: "Mono", description: "Black, grey and white. Square corners, hairlines, white for the one thing that matters.",
    layout: "inspector", effects: [], tweaks: {},
    tokens: {
      window: "#0d0d0d", backdrop: "#0d0d0d", surface: "#131313", field: "#161616",
      label: "#f2f2f2", "label-2": "#a1a1a1", "label-3": "#7a7a7a",
      separator: "rgba(242,242,242,.10)", fill: "rgba(242,242,242,.05)", "fill-hover": "rgba(242,242,242,.09)", "fill-selected": "rgba(242,242,242,.13)", group: "transparent",
      accent: "#f2f2f2", "accent-ink": "#0d0d0d", "accent-soft": "rgba(242,242,242,.07)", "focus-ring": "rgba(242,242,242,.6)",
      ok: "#4cc38a", warn: "#d9b46a", danger: "#e5484d", "danger-soft": "rgba(229,72,77,.12)",
      dialogue: "#f2f2f2", narration: "#a6a6a6",
      glass: "#0d0d0d", "glass-edge": "rgba(242,242,242,.10)", pop: "#141414", "glass-blur": "none",
      "shadow-float": "none", "shadow-pop": "0 0 0 1px rgba(242,242,242,.12), 0 16px 40px rgba(0,0,0,.6)",
      flash: "rgba(242,242,242,.14)", scrim: "rgba(0,0,0,.72)", "preview-scrim": "rgba(0,0,0,.72)",
      round: "0",
      "font-ui": '"Geist Variable", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif',
      "font-mono": '"Geist Mono Variable", ui-monospace, Consolas, monospace',
      "font-display": '"Archivo Variable", "Geist Variable", system-ui, sans-serif',
      "display-weight": "600", "display-stretch": "112%",
      "letter-bg": "#1c1c1c", "portrait-bg": "#161616",
      orb: "#f2f2f2", "orb-ring": "none", "assistant-wash": "linear-gradient(transparent, transparent)",
      "collection-title": "36px",
    },
    css: [
      '[data-region="app"] { gap: 0; padding: 0; }',
      '[data-region="sidebar"] { border-radius: 0; box-shadow: none; border-right: 1px solid var(--separator); padding: 24px 12px 16px; }',
      '[data-region="inspector"] { border-radius: 0; box-shadow: none; border-left: 1px solid var(--separator); }',
      '.toolbar { border-bottom: 1px solid var(--separator); height: 56px; }',
      // selected = solid white block with black text (segmented controls, the sidebar's place)
      '.segmented, .mode-switch { background: transparent; box-shadow: inset 0 0 0 1px var(--separator); padding: 0; }',
      '.segmented .slide-pill { background: var(--label); box-shadow: none; }',
      '.segmented button.on { color: var(--window); }',
      '.mode-switch { padding: 0; } .mode-switch button.on { background: var(--label); color: var(--window); box-shadow: none; }',
      '.btn-bordered, .ghost { background: transparent; box-shadow: inset 0 0 0 1px rgba(242,242,242,.18); }',
      '.btn-bordered:hover:not(:disabled), .ghost:hover { background: var(--fill); }',
      '.group { border-top: 1px solid var(--separator); border-bottom: 1px solid var(--separator); }',
      '.composer-box:focus-within { box-shadow: none; }',
      // switches and dots stay round: they are objects, not panels
      '.switch, .switch span { border-radius: 999px; }',
      '.switch.on span { background: var(--window); }',
    ].join("\n"),
  },
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
