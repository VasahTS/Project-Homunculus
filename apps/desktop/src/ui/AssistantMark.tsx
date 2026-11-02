// Homunculus 2 — how an assistant's mark is drawn. CLAUDE, 2026-11-02 (D-079).
import { Icon, type ICONS } from "./kit.tsx";

/** UX review item 13 (D-079): the built-in assistants' glyph marks are drawn as line icons; marks people type stay as typed. */
const GLYPH_ICON: Record<string, keyof typeof ICONS> = { "✦": "grid", "✧": "persona", "◯": "characters", "▤": "book", "❖": "scroll", "✎": "pencil" };
export function AssistantMark({ emoji, size = 14 }: { emoji: string | undefined; size?: number }) {
  const icon = emoji ? GLYPH_ICON[emoji.trim()] : "grid";
  return icon ? <Icon name={icon} size={size} /> : <>{emoji}</>;
}
