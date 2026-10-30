// The approved quiet Library hierarchy; existing editors and operations are retained. CODEX, D-040.
import type { ReactNode } from "react";
import type { LibraryCategory, NavigationProfile } from "../theme/navigation.ts";
import { Toolbar } from "./Toolbar.tsx";

export function LibraryWorkspace({ lead, category, navigation, counts, onOpen, children }: {
  lead: ReactNode; category: LibraryCategory; navigation: NavigationProfile;
  counts: Partial<Record<LibraryCategory, number>>; onOpen: (category: LibraryCategory) => void; children: ReactNode;
}) {
  return (
    <section className="library-workspace" data-region="library-workspace">
      <Toolbar lead={lead} title="Library" subtitle="Reusable material for your characters and stories" />
      <div className="library-workspace-body">
        <nav className="library-categories" aria-label="Library categories" data-testid="library-list" data-region="library-navigation">
          {navigation.groups.map((group) => (
            <section className="library-category-group" key={group.id} aria-labelledby={`library-${group.id}`}>
              <h2 id={`library-${group.id}`}>{group.label}</h2>
              <div className="library-category-items">
                {group.items.map((item) => (
                  <button type="button" key={item.id} aria-current={category === item.id ? "page" : undefined} onClick={() => onOpen(item.id)}>
                    <span>{item.label}</span>{counts[item.id] !== undefined && <small aria-hidden="true">{counts[item.id]}</small>}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </nav>
        <div className="library-workspace-content">{children}</div>
      </div>
    </section>
  );
}
