// One collection vocabulary for Stories and Characters. CODEX, D-040.
import { Button, Icon } from "./kit.tsx";

export function CollectionTools({ label, query, onQuery, recent, onRecent }: {
  label: string; query: string; onQuery: (value: string) => void; recent: boolean; onRecent: (value: boolean) => void;
}) {
  return (
    <div className="collection-tools" data-region="collection-tools">
      <div className="collection-filters" role="group" aria-label={`${label} filters`}>
        <Button variant="plain" aria-pressed={!recent} onClick={() => onRecent(false)}>All {label}</Button>
        <Button variant="plain" aria-pressed={recent} onClick={() => onRecent(true)}>Recently played</Button>
      </div>
      <label className="search-box collection-search"><Icon name="search" size={15} />
        <input aria-label={`Search ${label}`} placeholder={`Search ${label}`} value={query} onChange={(e) => onQuery(e.target.value)} />
      </label>
    </div>
  );
}
