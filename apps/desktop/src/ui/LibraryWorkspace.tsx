// The approved quiet Library hierarchy; existing editors and operations are retained. CODEX, D-040.
// D-069 (CLAUDE, 2026-11-01): the categories left the column on the left for one row of tabs under the title (Daniel:
// "it is too busy, there are many stacked menus"; draft B on the canvas "Library – barra no topo"). The groups stay,
// split by a thin line instead of headings; Trash sits apart on the right. The section's own title is not repeated
// below (the tab says where you are): its toolbar keeps the description and the actions.
import { useEffect, useRef, type ReactNode } from "react";
import type { LibraryCategory, NavigationProfile } from "../theme/navigation.ts";
import { Icon } from "./kit.tsx";
import { Toolbar } from "./Toolbar.tsx";

export function LibraryWorkspace({ lead, category, navigation, counts, onOpen, children }: {
  lead: ReactNode; category: LibraryCategory; navigation: NavigationProfile;
  counts: Partial<Record<LibraryCategory, number>>; onOpen: (category: LibraryCategory) => void; children: ReactNode;
}) {
  // in a narrow window the row scrolls sideways: keep the open section in view (also when Ctrl+K opened it)
  const nav = useRef<HTMLElement>(null);
  useEffect(() => { nav.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: "nearest", inline: "nearest" }); }, [category]);
  const groups = navigation.groups.filter((g) => !g.trailing);
  const trailing = navigation.groups.filter((g) => g.trailing).flatMap((g) => g.items);
  const tab = (item: { id: LibraryCategory; label: string }, icon?: ReactNode) => (
    <button type="button" key={item.id} className="library-tab" aria-current={category === item.id ? "page" : undefined} onClick={() => onOpen(item.id)}>
      {icon}<span>{item.label}</span>{counts[item.id] !== undefined && <small aria-hidden="true">{counts[item.id]}</small>}
    </button>
  );
  return (
    <section className="library-workspace" data-region="library-workspace">
      <Toolbar lead={lead} title="Library" subtitle="Reusable material for your characters and stories" />
      <nav ref={nav} className="library-tabs" aria-label="Library categories" data-testid="library-list" data-region="library-navigation">
        {groups.map((group) => (
          <div className="library-tab-group" role="group" key={group.id} aria-label={group.label}>
            {group.items.map((item) => tab(item))}
          </div>
        ))}
        {trailing.length > 0 && <div className="library-tab-group library-tab-end" role="group" aria-label="Manage">
          {trailing.map((item) => tab(item, item.id === "trash" ? <Icon name="trash" size={14} /> : undefined))}
        </div>}
      </nav>
      <div className="library-workspace-content">{children}</div>
    </section>
  );
}
