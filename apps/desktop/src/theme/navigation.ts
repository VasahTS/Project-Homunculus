// Approved collection navigation, expressed as profile data for future customization. CODEX, D-040.
export type LibraryCategory = "kits" | "narrators" | "npcs" | "personas" | "lorebooks" | "regex" | "presets" | "trackers" | "agents" | "trash";
export type NavigationPlace = "stories" | "characters" | "library" | "vault";
export interface NavigationProfile {
  places: Array<{ id: NavigationPlace; label: string; icon: "book" | "characters" | "grid" | "lock" }>;
  groups: Array<{ id: string; label: string; items: Array<{ id: LibraryCategory; label: string }> }>;
  recentLimit: number;
  showStoryShortcuts: boolean;
}
export const COLLECTION_NAVIGATION: NavigationProfile = {
  places: [{ id: "stories", label: "Stories", icon: "book" }, { id: "characters", label: "Characters", icon: "characters" }, { id: "library", label: "Library", icon: "grid" }],
  groups: [
    { id: "building", label: "Story building", items: [{ id: "kits", label: "Kits" }, { id: "narrators", label: "Narrators" }, { id: "npcs", label: "NPCs" }] },
    { id: "writing", label: "Writing and context", items: [{ id: "personas", label: "Personas" }, { id: "lorebooks", label: "Lorebooks" }, { id: "presets", label: "Presets" }, { id: "regex", label: "Regex" }] },
    { id: "scene", label: "Around each reply", items: [{ id: "trackers", label: "Trackers" }, { id: "agents", label: "Agents" }] },
    { id: "manage", label: "Manage", items: [{ id: "trash", label: "Trash" }] },
  ],
  recentLimit: 3,
  showStoryShortcuts: false,
};
