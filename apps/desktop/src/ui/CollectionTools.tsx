// One collection vocabulary for Stories and Characters. CODEX, D-040.
// D-068 (CLAUDE, 2026-11-01): Folders · Everything, the card size (S · M · L), and folders found by the search.
import { Button, Icon, Segmented } from "./kit.tsx";

/** How a collection page shows its cards, remembered per place (Characters, Stories, Kits…). */
export interface CollectionPrefs { view: "folders" | "everything"; size: "s" | "m" | "l" }
export const DEFAULT_PREFS: CollectionPrefs = { view: "folders", size: "m" };

/** A folder whose path matches the search. */
export interface FolderHit { id: string; path: string; count: number }

export function CollectionTools({ label, query, onQuery, recent, onRecent, prefs, onPrefs }: {
  label: string; query: string; onQuery: (value: string) => void; recent: boolean; onRecent: (value: boolean) => void;
  prefs?: CollectionPrefs | undefined; onPrefs?: ((p: CollectionPrefs) => void) | undefined;
}) {
  return (
    <div className="collection-tools" data-region="collection-tools">
      <div className="collection-filters" role="group" aria-label={`${label} filters`}>
        <Button variant="plain" aria-pressed={!recent} onClick={() => onRecent(false)}>All {label}</Button>
        <Button variant="plain" aria-pressed={recent} onClick={() => onRecent(true)}>Recently played</Button>
        {prefs && onPrefs && <ViewSwitch prefs={prefs} onPrefs={onPrefs} />}
      </div>
      <span className="collection-right">
        {prefs && onPrefs && <SizeSwitch prefs={prefs} onPrefs={onPrefs} />}
        <label className="search-box collection-search"><Icon name="search" size={15} />
          <input aria-label={`Search ${label}`} placeholder={`Search ${label}`} value={query} onChange={(e) => onQuery(e.target.value)} />
        </label>
      </span>
    </div>
  );
}

/** Folders = the open folder's cards and its folders; Everything = every card in one list, folders ignored. */
export function ViewSwitch({ prefs, onPrefs }: { prefs: CollectionPrefs; onPrefs: (p: CollectionPrefs) => void }) {
  return (
    <Segmented small label="Show" value={prefs.view} onChange={(view) => onPrefs({ ...prefs, view })}
      options={[{ value: "folders", label: "Folders", testId: "view-folders" }, { value: "everything", label: "Everything", testId: "view-everything" }]} />
  );
}

export function SizeSwitch({ prefs, onPrefs }: { prefs: CollectionPrefs; onPrefs: (p: CollectionPrefs) => void }) {
  return (
    <Segmented small label="Card size" value={prefs.size} onChange={(size) => onPrefs({ ...prefs, size })}
      options={[{ value: "s", label: "S", testId: "size-s" }, { value: "m", label: "M", testId: "size-m" }, { value: "l", label: "L", testId: "size-l" }]} />
  );
}

/** "Folders" at the top of search results: click one to open it. */
export function FolderHits({ hits, onOpen }: { hits: FolderHit[]; onOpen: (id: string) => void }) {
  if (!hits.length) return null;
  return (
    <div className="folder-hits" data-testid="folder-hits">
      <div className="collection-heading"><h2>Folders</h2><span>{hits.length}</span></div>
      <div className="folder-hit-list">
        {hits.map((h) => (
          <button key={h.id} type="button" className="folder-hit" onClick={() => onOpen(h.id)} title={`Open ${h.path}`}>
            <span className="folder-hit-mark" aria-hidden /><span className="folder-hit-name">{h.path}</span><span className="folder-hit-count">{h.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
