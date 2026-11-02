// Card Browser: find characters on ChubAI, JannyAI, Wyvern and Pygmalion and add them to Characters (UI-PLAN "Card Browser",
// docs/CARD-BROWSER.md, D-081). Built like the Characters page: a portrait grid and a sheet beside it. CLAUDE, 2026-11-02.
// Everything from the sites is shown as plain text; nothing from them runs here.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import type { Avatar, Character, Folder } from "@homunculus/schemas";
import { bytesToBase64 } from "@homunculus/st-cards";
import { CARD_SOURCES, cardSource, isSourceId, NO_FILTERS, SiteError } from "@homunculus/card-browser";
import type { CardDetails, CardFile, CardFilters, CardItem, CardSource, MustHave, SiteTransport, SourceId } from "@homunculus/card-browser";
import { Button, Icon, IconButton, Switch } from "./kit.tsx";
import { Toolbar } from "./Toolbar.tsx";
import { Help } from "./Help.tsx";
import { CardPicture, GalleryCard } from "./Gallery.tsx";
import { SizeSwitch, type CollectionPrefs } from "./CollectionTools.tsx";
import { childrenOf } from "./Folders.tsx";
import { openLink } from "./MessageText.tsx";
import { siteIndex, type FolderChoice } from "../importCharacters.ts";

// ------------------------------------------------------------------ remembered state
/** Between runs (a per-viewer convenience, D-068 style): never required, defaults apply without it. */
interface Prefs { source: SourceId; sorts: Partial<Record<SourceId, string>>; nsfw: Partial<Record<SourceId, boolean>>; size: CollectionPrefs["size"]; folder: string; importTags: boolean; datacatOk?: boolean }
const PREFS_KEY = "h2.cardBrowser";
const DEFAULT_PREFS: Prefs = { source: "chub", sorts: {}, nsfw: {}, size: "m", folder: "web", importTags: true };
function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>;
    return { ...DEFAULT_PREFS, ...raw, source: isSourceId(raw.source) ? raw.source : "chub", size: raw.size === "s" || raw.size === "l" ? raw.size : "m" };
  } catch { return DEFAULT_PREFS; }
}
const savePrefs = (p: Prefs) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* storage unavailable */ } };

/** While the app is open: leaving the page and coming back shows the same place. */
interface Memory { source: SourceId; text: string; sort: string; include: string[]; exclude: string[]; filters: CardFilters; items: CardItem[]; total: number | null; hasMore: boolean; page: number; selected: string | null; scroll: number; key: string; seenTags: string[] }
let memory: Memory | null = null;
const details = new Map<string, CardDetails | "failed">();

// ------------------------------------------------------------------ pictures
/** Last 300 pictures (as avatars), at most 4 loading at a time, only for cards on screen. */
const pictures = new Map<string, Avatar | null>();
const waiting: Array<() => void> = [];
let loading = 0;
async function picture(t: SiteTransport, url: string): Promise<Avatar | null> {
  if (pictures.has(url)) return pictures.get(url) ?? null;
  if (loading >= 4) await new Promise<void>((go) => waiting.push(go));
  loading++;
  try {
    const r = await t.request({ url, method: "GET", expect: "image" });
    const a = r.status >= 200 && r.status < 300 && r.bytes && r.mime ? { mime: r.mime, base64: bytesToBase64(r.bytes) } : null;
    pictures.set(url, a);
    if (pictures.size > 300) pictures.delete(pictures.keys().next().value!);
    return a;
  } catch { pictures.set(url, null); return null; }
  finally { loading--; waiting.shift()?.(); }
}
function usePicture(t: SiteTransport, item: CardItem | null, visible: boolean): Avatar | undefined {
  const url = item?.thumb ?? "";
  const [a, setA] = useState<Avatar | null | undefined>(() => (url ? pictures.get(url) : null));
  useEffect(() => {
    if (!url) { setA(null); return; }
    if (pictures.has(url)) { setA(pictures.get(url)); return; }
    if (!visible) return;
    let live = true;
    void picture(t, url).then((x) => { if (live) setA(x); });
    return () => { live = false; };
  }, [t, url, visible, item]);
  return a ?? undefined;
}
function useOnScreen<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || on) return;
    if (typeof IntersectionObserver === "undefined") { setOn(true); return; }
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setOn(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [on]);
  return [ref, on];
}

// ------------------------------------------------------------------ helpers
const NSFW_NOTE: Record<SourceId, string> = { chub: "Adult cards with NSFW on", janny: "Adult cards with NSFW on", wyvern: "Adult cards with NSFW on", pygmalion: "Safe cards only", datacat: "Adult cards only" };
const MUST_LABEL: Record<MustHave, string> = { lorebook: "Has Lorebook", greetings: "Has Alternate Greetings", gallery: "Has Gallery", expressions: "Has Expressions" };
const MUST_SHORT: Record<MustHave, string> = { lorebook: "Lorebook", greetings: "Alternate Greetings", gallery: "Gallery", expressions: "Expressions" };
const fmt = (n: number | undefined) => (n === undefined ? "" : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n));
function figures(i: CardItem): string {
  const s = i.stats;
  return [s.downloads !== undefined && `${fmt(s.downloads)} downloads`, s.likes !== undefined && `${fmt(s.likes)} likes`, s.stars !== undefined && s.downloads === undefined && `${fmt(s.stars)} stars`,
    s.tokens !== undefined && `${fmt(s.tokens)} tokens`].filter(Boolean).join(" · ");
}
const desktopOnly = (e: unknown) => e instanceof Error && /works in the desktop app/.test(e.message);
/** Plain text with web addresses that open in the system browser. */
function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"')\]]+)/g);
  return <>{parts.map((p, i) => (i % 2 ? <a key={i} href={p} onClick={(e) => { e.preventDefault(); void openLink(p); }}>{p}</a> : p))}</>;
}

// ------------------------------------------------------------------ the page
export interface CardBrowserProps {
  lead: ReactNode;
  transport: SiteTransport;
  characters: Character[];
  folders: Folder[];
  /** Saves a card from a site in Characters (shared import path, D-081) and shows the usual notice. Returns the new character's id. */
  onAdd: (file: CardFile, item: CardItem, opts: { folder: FolderChoice; importTags: boolean }) => Promise<string | null>;
  onSavePng: (file: CardFile, item: CardItem) => Promise<void>;
  onOpenCharacter: (id: string) => void;
  onChat: (id: string) => void;
  /** Library → Import, for cards downloaded by hand. */
  onImportFiles: (files: File[]) => void;
  onNewFolder: (name: string) => Promise<string>;
  /** Shows an error notice. */
  onError: (title: string, message: string, recover?: () => void) => void;
}

export function CardBrowser(p: CardBrowserProps) {
  const [prefs, setPrefsState] = useState(loadPrefs);
  const setPrefs = (f: (x: Prefs) => Prefs) => setPrefsState((x) => { const n = f(x); savePrefs(n); return n; });
  const m = memory;
  const [sourceId, setSourceId] = useState<SourceId>(m?.source ?? prefs.source);
  const source = cardSource(sourceId);
  const [text, setText] = useState(m?.text ?? "");
  const [sort, setSort] = useState(m?.sort ?? prefs.sorts[sourceId] ?? source.defaultSort);
  const [include, setInclude] = useState<string[]>(m?.include ?? []);
  const [exclude, setExclude] = useState<string[]>(m?.exclude ?? []);
  const [filters, setFilters] = useState<CardFilters>(m?.filters ?? NO_FILTERS);
  const [items, setItems] = useState<CardItem[]>(m?.items ?? []);
  const [total, setTotal] = useState<number | null>(m?.total ?? null);
  const [hasMore, setHasMore] = useState(m?.hasMore ?? false);
  const [page, setPage] = useState(m?.page ?? 1);
  const [selected, setSelected] = useState<string | null>(m?.selected ?? null);
  const [seenTags, setSeenTags] = useState<string[]>(m?.seenTags ?? []);
  const [busy, setBusy] = useState<"search" | "more" | null>(null);
  const [error, setError] = useState<{ message: string; paused: boolean; desktop: boolean } | null>(null);
  const [open, setOpen] = useState<"source" | "tags" | "filters" | null>(null);
  const nsfw = source.nsfw === "never" ? false : source.nsfw === "always" ? true : prefs.nsfw[sourceId] ?? false;
  const [askAdult, setAskAdult] = useState(false);
  // tags the site lists itself (DataCat), loaded once per source
  const [siteTags, setSiteTags] = useState<string[]>([]);
  useEffect(() => {
    setSiteTags([]);
    if (!source.loadTags) return;
    let live = true;
    source.loadTags(p.transport).then((xs) => { if (live) setSiteTags(xs); }, () => {});
    return () => { live = false; };
  }, [source, p.transport]);
  const search = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const added = useMemo(() => siteIndex(p.characters), [p.characters]);
  const key = JSON.stringify([sourceId, text.trim(), sort, include, exclude, filters, nsfw]);

  const run = useCallback(async (more: boolean) => {
    const id = ++seq.current;
    const nextPage = more ? page + 1 : 1;
    setBusy(more ? "more" : "search"); setError(null);
    try {
      const r = await source.search({ text: text.trim(), sort, page: nextPage, nsfw, include, exclude, filters }, p.transport);
      if (id !== seq.current) return;
      setItems((old) => { if (!more) return r.items; const have = new Set(old.map((x) => x.id)); return [...old, ...r.items.filter((x) => !have.has(x.id))]; });
      setTotal(r.total); setHasMore(r.hasMore); setPage(nextPage);
      setSeenTags((old) => [...new Set([...old, ...r.items.flatMap((x) => x.tags)])].slice(0, 400));
      if (!more) { setSelected((s) => (s && r.items.some((x) => x.id === s) ? s : null)); gridRef.current?.scrollTo?.({ top: 0 }); }
    } catch (e) {
      if (id !== seq.current) return;
      setError({ message: e instanceof Error ? e.message : String(e), paused: e instanceof SiteError && e.paused, desktop: desktopOnly(e) });
      if (!more) setItems([]);
    } finally { if (id === seq.current) setBusy(null); }
  }, [source, text, sort, nsfw, include, exclude, filters, page, p.transport]);

  // search by itself ½ s after typing stops (and at once when anything else changes); not again when coming back
  const lastKey = useRef(m?.key ?? "");
  useEffect(() => {
    if (key === lastKey.current) return;
    const typing = lastKey.current !== "" && JSON.parse(lastKey.current)[1] !== text.trim();
    // marked as asked only when it runs, so a cancelled timer (typing on, or React's double effect) asks again
    const timer = setTimeout(() => { lastKey.current = key; void run(false); }, typing ? 500 : 0);
    return () => clearTimeout(timer);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep the place while the app is open
  useEffect(() => {
    memory = { source: sourceId, text, sort, include, exclude, filters, items, total, hasMore, page, selected, scroll: gridRef.current?.scrollTop ?? memory?.scroll ?? 0, key: lastKey.current, seenTags };
  });
  useEffect(() => { if (m?.scroll && gridRef.current) gridRef.current.scrollTop = m.scroll; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const switchSource = (id: SourceId, confirmed = false) => {
    setOpen(null);
    if (id === sourceId) return;
    // DataCat lists adult cards only: asked once (remembered)
    if (cardSource(id).nsfw === "always" && !prefs.datacatOk && !confirmed) { setAskAdult(true); return; }
    setAskAdult(false);
    setSourceId(id); setPrefs((x) => ({ ...x, source: id }));
    // the search text stays; tags and filters differ by site
    setInclude([]); setExclude([]); setFilters(NO_FILTERS); setSeenTags([]); setSelected(null); setItems([]);
    setSort(prefs.sorts[id] ?? cardSource(id).defaultSort);
  };
  const pickSort = (s: string) => { setSort(s); setPrefs((x) => ({ ...x, sorts: { ...x.sorts, [sourceId]: s } })); };
  const setTag = (t: string, mode: "include" | "exclude" | null) => {
    const name = t.trim(); if (!name) return;
    const low = name.toLowerCase(); const drop = (xs: string[]) => xs.filter((x) => x.toLowerCase() !== low);
    setInclude((xs) => (mode === "include" ? [...drop(xs), name] : drop(xs)));
    setExclude((xs) => (mode === "exclude" ? [...drop(xs), name] : drop(xs)));
  };
  const clearAll = () => { setInclude([]); setExclude([]); setFilters(NO_FILTERS); };
  const activeFilters = filters.must.length + (filters.ascending ? 1 : 0) + (filters.minTokens ? 1 : 0) + (filters.maxTokens ? 1 : 0) + (filters.lowQuality ? 1 : 0);
  const hasFilters = source.mustHave.length > 0 || source.ascending || source.tokens || source.lowQuality;
  const chosen = items.find((x) => x.id === selected) ?? null;

  const onKey = (e: ReactKeyboardEvent) => {
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); search.current?.focus(); return; }
    if (e.key === "Escape") { if (open) setOpen(null); else if (selected) setSelected(null); return; }
    const reading = e.target instanceof Element && e.target.closest(".cb-sheet");
    if (typing || reading || !items.length || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const cards = gridRef.current?.querySelectorAll<HTMLElement>("[data-testid=cb-card]");
    const perRow = cards && cards.length > 1 ? Math.max(1, [...cards].filter((c) => c.offsetTop === cards[0]!.offsetTop).length) : 1;
    const at = Math.max(0, items.findIndex((x) => x.id === selected));
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -perRow, ArrowDown: perRow }[e.key] ?? 0;
    const next = items[Math.min(items.length - 1, Math.max(0, selected ? at + step : 0))];
    if (next) { setSelected(next.id); cards?.[items.indexOf(next)]?.focus(); }
  };

  return (
    <div className="page collection-page card-browser" data-testid="card-browser" data-region="collection" onKeyDown={onKey}>
      <Toolbar lead={p.lead} title="Card Browser" subtitle="Find characters on public sites and add them to Characters."
        trailing={<>
          <Help text="Searches go straight from this app to each site; the site sees what you search, as in a browser. Card text is shown as plain text and nothing from the sites runs in the app." />
          <SourcePicker source={source} open={open === "source"} onToggle={() => setOpen(open === "source" ? null : "source")} onPick={switchSource} onClose={() => setOpen(null)} />
        </>} />
      <div className="collection-tools cb-tools" data-region="collection-tools">
        <div className="cb-tools-left">
          <label className="search-box collection-search cb-search"><Icon name="search" size={15} />
            <input ref={search} data-testid="cb-search" aria-label={`Search ${source.name}`} placeholder={`Search ${source.name}…`} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <label className="cb-sort"><span className="sr-only">Sort</span>
            <select data-testid="cb-sort" aria-label="Sort" value={sort} onChange={(e) => pickSort(e.target.value)}>
              {source.sorts.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <Pop open={open === "tags"} onClose={() => setOpen(null)} button={
            <Button variant="plain" data-testid="cb-tags" aria-expanded={open === "tags"} onClick={() => setOpen(open === "tags" ? null : "tags")}>
              Tags{include.length + exclude.length > 0 && <span className="cb-count">{include.length + exclude.length}</span>}</Button>}>
            <TagPanel tags={[...new Set([...source.suggestedTags, ...siteTags, ...seenTags])]} include={include} exclude={exclude} onSet={setTag} />
          </Pop>
          {hasFilters && <Pop open={open === "filters"} onClose={() => setOpen(null)} button={
            <Button variant="plain" data-testid="cb-filters" aria-expanded={open === "filters"} onClick={() => setOpen(open === "filters" ? null : "filters")}>
              Filters{activeFilters > 0 && <span className="cb-count">{activeFilters}</span>}</Button>}>
            <FilterPanel source={source} filters={filters} onChange={setFilters} />
          </Pop>}
          <span className="cb-nsfw" data-testid="cb-nsfw" title={source.nsfw !== "toggle" ? source.nsfwNote : undefined}>
            <Switch label="NSFW" checked={nsfw} disabled={source.nsfw !== "toggle"} onChange={(v) => setPrefs((x) => ({ ...x, nsfw: { ...x.nsfw, [sourceId]: v } }))} />
            <span>NSFW</span>
          </span>
        </div>
        <span className="collection-right"><SizeSwitch prefs={{ view: "everything", size: prefs.size }} onPrefs={(x) => setPrefs((y) => ({ ...y, size: x.size }))} /></span>
      </div>
      {(include.length > 0 || exclude.length > 0 || activeFilters > 0) && (
        <div className="cb-chips" data-testid="cb-chips">
          {include.map((t) => <button key={`+${t}`} type="button" className="cb-chip" onClick={() => setTag(t, null)}>{t} <Icon name="close" size={11} /></button>)}
          {exclude.map((t) => <button key={`-${t}`} type="button" className="cb-chip hide" onClick={() => setTag(t, null)}>− {t} <Icon name="close" size={11} /></button>)}
          {filters.must.map((x) => <button key={x} type="button" className="cb-chip" onClick={() => setFilters({ ...filters, must: filters.must.filter((y) => y !== x) })}>{MUST_LABEL[x]} <Icon name="close" size={11} /></button>)}
          {filters.ascending && <button type="button" className="cb-chip" onClick={() => setFilters({ ...filters, ascending: false })}>Ascending <Icon name="close" size={11} /></button>}
          {filters.minTokens ? <button type="button" className="cb-chip" onClick={() => setFilters({ ...filters, minTokens: undefined })}>Min {filters.minTokens} Tokens <Icon name="close" size={11} /></button> : null}
          {filters.maxTokens ? <button type="button" className="cb-chip" onClick={() => setFilters({ ...filters, maxTokens: undefined })}>Max {filters.maxTokens} Tokens <Icon name="close" size={11} /></button> : null}
          {filters.lowQuality && <button type="button" className="cb-chip" onClick={() => setFilters({ ...filters, lowQuality: false })}>Low Quality Shown <Icon name="close" size={11} /></button>}
          <Button variant="plain" small onClick={clearAll}>Clear All</Button>
        </div>
      )}
      <div className="gallery-layout">
        <div className={`gallery-grid portrait size-${prefs.size}`} ref={gridRef}>
          {askAdult && (
            <div className="cb-notice gallery-empty" data-testid="cb-adult" role="alertdialog" aria-label="DataCat is adult only">
              <p><strong>DataCat lists adult cards only.</strong></p>
              <p className="hint">Its cards come from JanitorAI. Continue to browse it, or go back to {source.name}.</p>
              <div className="cb-notice-actions">
                <Button variant="prominent" onClick={() => { setPrefs((x) => ({ ...x, datacatOk: true })); switchSource("datacat", true); }}>Continue</Button>
                <Button onClick={() => setAskAdult(false)}>Back</Button>
              </div>
            </div>
          )}
          {error && (error.desktop
            ? <div className="cb-notice gallery-empty" data-testid="cb-notice"><p>The Card Browser works in the desktop app.</p></div>
            : <div className="cb-notice gallery-empty" data-testid="cb-notice">
                <p>{error.paused ? error.message : /answered|did not answer|failed|time/.test(error.message) ? `${source.name} did not answer. ${error.message}` : error.message}</p>
                <div className="cb-notice-actions">
                  {error.paused
                    ? <><Button onClick={() => void openLink(source.site)}>Open {source.name}</Button>
                        <Button onClick={() => fileInput.current?.click()}>Import a Downloaded File…</Button></>
                    : <Button onClick={() => void run(false)}>Try Again</Button>}
                </div>
              </div>)}
          {!error && (items.length > 0 || busy === "search") && (
            <div className="collection-heading"><h2>{busy === "search" ? "Searching…" : total !== null ? `${total.toLocaleString("en-US")} cards` : `Page ${page}`}</h2><span>{source.name}</span></div>
          )}
          <div className="gallery-cards" data-testid="cb-grid" aria-busy={busy === "search"}>
            {busy === "search" && items.length === 0
              ? Array.from({ length: 12 }, (_, i) => <div key={i} className="gallery-card cb-ghost" aria-hidden />)
              : items.map((it) => <ResultCard key={it.id} item={it} t={p.transport} selected={it.id === selected} added={added.has(`${it.source}:${it.id}`)} onClick={() => setSelected(it.id)} />)}
          </div>
          {!error && !busy && items.length === 0 && lastKey.current && (
            <div className="gallery-empty hint" data-testid="cb-empty">
              <p>{text.trim() ? `Nothing on ${source.name} matches “${text.trim()}”.` : `Nothing on ${source.name} with these choices.`}</p>
              {(include.length + exclude.length + activeFilters > 0) && <Button onClick={clearAll}>Clear Tags and Filters</Button>}
            </div>
          )}
          {hasMore && items.length > 0 && !error && (
            <div className="cb-more"><Button data-testid="cb-load-more" disabled={busy !== null} onClick={() => void run(true)}>{busy === "more" ? "Loading…" : "Load More"}</Button></div>
          )}
          <input ref={fileInput} type="file" accept=".png,.json" multiple hidden onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) p.onImportFiles(files); }} />
        </div>
        <aside className={`gallery-sheet${chosen ? " has-card" : ""}`} data-region="sheet">
          <div className="collection-detail-label cb-sheet-label">Card details{chosen && <IconButton className="cb-sheet-close" label="Close" onClick={() => setSelected(null)}><Icon name="close" size={13} /></IconButton>}</div>
          {chosen
            ? <CardSheet key={`${chosen.source}:${chosen.id}`} item={chosen} source={source} {...p} onImportDownloaded={() => fileInput.current?.click()} prefs={prefs} setPrefs={setPrefs} addedId={added.get(`${chosen.source}:${chosen.id}`) ?? null} />
            : <div className="empty-detail"><p>Pick a card to read it here.</p><p className="hint">Add to Characters saves it in your library, with its lorebook.</p></div>}
        </aside>
      </div>
    </div>
  );
}

function ResultCard({ item, t, selected, added, onClick }: { item: CardItem; t: SiteTransport; selected: boolean; added: boolean; onClick: () => void }) {
  const [ref, on] = useOnScreen<HTMLSpanElement>();
  const pic = usePicture(t, item, on);
  return (
    <span ref={ref} className="cb-card-wrap">
      <GalleryCard testId="cb-card" name={item.name} selected={selected} onClick={onClick} by={item.creator ? `by ${item.creator}` : undefined}
        summary={item.tagline || undefined} tags={item.tags} size={item.stats.tokens !== undefined ? `${fmt(item.stats.tokens)} tok` : item.stats.downloads !== undefined ? `${fmt(item.stats.downloads)} dl` : undefined}
        picture={<>
          <CardPicture name={item.name} avatar={pic} />
          {(item.nsfw || added) && <span className="cb-marks">{item.nsfw && <span className="cb-mark">NSFW</span>}{added && <span className="cb-mark added" title="In your Characters" aria-label="In your Characters"><Icon name="check" size={12} /></span>}</span>}
        </>} />
    </span>
  );
}

// ------------------------------------------------------------------ the sheet
function CardSheet({ item, source, transport, characters: _c, folders, onAdd, onSavePng, onOpenCharacter, onChat, onNewFolder, onError, onImportDownloaded, prefs, setPrefs, addedId }: CardBrowserProps & {
  onImportDownloaded: () => void; item: CardItem; source: CardSource; prefs: Prefs; setPrefs: (f: (x: Prefs) => Prefs) => void; addedId: string | null;
}) {
  const k = `${item.source}:${item.id}`;
  const [d, setD] = useState<CardDetails | "failed" | null>(details.get(k) ?? null);
  const [greeting, setGreeting] = useState(0);
  const [working, setWorking] = useState<"add" | "png" | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const pic = usePicture(transport, item, true);
  useEffect(() => {
    if (details.has(k)) return;
    let live = true;
    source.details(item, transport).then((x) => { if (!x.partial) details.set(k, x); if (live) setD(x); }, () => { if (live) setD("failed"); });
    return () => { live = false; };
  }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
  const full = d && d !== "failed" ? d : null;
  const mine = justAdded ?? addedId;
  const folderChoice = (): FolderChoice => (prefs.folder === "web" ? "from-the-web" : prefs.folder ? { id: prefs.folder } : null);
  const fetchFile = async () => source.download(item, transport);
  const add = async () => {
    setWorking("add"); setMenu(false);
    try {
      const id = await onAdd(await fetchFile(), item, { folder: folderChoice(), importTags: prefs.importTags });
      if (id) setJustAdded(id);
    } catch (e) { onError(`Could not add ${item.name}`, e instanceof Error ? e.message : String(e), e instanceof SiteError && e.paused ? onImportDownloaded : undefined); }
    finally { setWorking(null); }
  };
  const png = async () => {
    setWorking("png");
    try { await onSavePng(await fetchFile(), item); }
    catch (e) { onError(`Could not save ${item.name}`, e instanceof Error ? e.message : String(e), e instanceof SiteError && e.paused ? onImportDownloaded : undefined); }
    finally { setWorking(null); }
  };
  const folderValue = prefs.folder === "web" || prefs.folder === "" || folders.some((f) => f.id === prefs.folder) ? prefs.folder : "web";
  const rows: Array<{ f: Folder; depth: number }> = [];
  const walk = (parent: string | null, depth: number) => { for (const f of childrenOf(folders, parent)) { if (!(parent === null && f.name === "From the Web")) rows.push({ f, depth }); walk(f.id, depth + 1); } };
  walk(null, 0);
  const greetings = full ? [full.firstMessage, ...full.alternateGreetings].filter((x) => x.trim()) : [];
  const tags = full?.tags.length ? full.tags : item.tags;
  const badges = [full?.hasLorebook && "Lorebook", greetings.length > 1 && `${greetings.length} Greetings`, item.nsfw && "NSFW"].filter(Boolean) as string[];
  const figs = figures(item);

  return (
    <div className="view-sheet cb-sheet" data-testid="cb-sheet">
      <CardPicture name={item.name} avatar={pic} className="vs-pic" />
      <div className="vs-head">
        <div className="vs-title"><h2>{item.name}</h2><span className="hint">{[item.creator && `by ${item.creator}`, figs].filter(Boolean).join(" · ")}</span></div>
      </div>
      {badges.length > 0 && <div className="vs-tags cb-badges">{badges.map((b) => <span key={b} className="gallery-tag big">{b}</span>)}</div>}
      <div className="vs-actions">
        {mine
          ? <>{justAdded ? <Button variant="prominent" data-testid="cb-chat" onClick={() => onChat(mine)}>Chat Now</Button>
                        : <Button variant="prominent" data-testid="cb-open" onClick={() => onOpenCharacter(mine)}>Open in Characters</Button>}</>
          : <Button variant="prominent" data-testid="cb-add" disabled={working !== null} onClick={() => void add()}>{working === "add" ? "Adding…" : "Add to Characters"}</Button>}
        <Button data-testid="cb-png" disabled={working !== null} onClick={() => void png()}>{working === "png" ? "Saving…" : "Save as PNG"}</Button>
        <Button onClick={() => void openLink(item.url)}>Open on {source.name}</Button>
        {mine && <span className="cb-menu">
          <IconButton label="More" aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon name="dots" /></IconButton>
          {menu && <span className="cb-pop cb-pop-right" role="menu"><button type="button" role="menuitem" data-testid="cb-add-again" onClick={() => void add()}>Add Again</button></span>}
        </span>}
      </div>
      {justAdded && <p className="hint cb-in" data-testid="cb-in">In your Characters · <a href="#" onClick={(e) => { e.preventDefault(); onOpenCharacter(justAdded); }}>Open</a></p>}
      {!mine && (
        <div className="cb-add-options">
          <label className="row-line"><span className="field-label">Folder</span>
            {naming === null
              ? <select aria-label="Folder" data-testid="cb-folder" className="folder-select" value={folderValue}
                  onChange={(e) => { if (e.target.value === "+new") setNaming(""); else { const v = e.target.value; setPrefs((x) => ({ ...x, folder: v })); } }}>
                  <option value="web">From the Web</option>
                  <option value="">No Folder</option>
                  {rows.map(({ f, depth }) => <option key={f.id} value={f.id}>{"  ".repeat(depth)}{f.name}</option>)}
                  <option value="+new">New Folder…</option>
                </select>
              : <input autoFocus aria-label="New folder name" placeholder="Folder name" value={naming} onChange={(e) => setNaming(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { e.stopPropagation(); setNaming(null); }
                    if (e.key === "Enter" && naming.trim()) { const name = naming.trim(); setNaming(null); void onNewFolder(name).then((id) => setPrefs((x) => ({ ...x, folder: id }))); }
                  }} onBlur={() => setNaming(null)} />}
          </label>
          <label className="row-line cb-tags-switch"><span className="field-label">Import Tags</span>
            <Switch label="Import Tags" checked={prefs.importTags} onChange={(v) => setPrefs((x) => ({ ...x, importTags: v }))} />
          </label>
        </div>
      )}
      {tags.length > 0 && <div className="vs-tags">{tags.slice(0, 12).map((t) => <span key={t} className="gallery-tag">{t}</span>)}{tags.length > 12 && <span className="gallery-more">+{tags.length - 12}</span>}</div>}
      {d === null && <p className="hint">Loading…</p>}
      {(d === "failed" || full?.partial) && <p className="hint" data-testid="cb-partial">The details didn't load. You can still add it.</p>}
      {(full?.creatorNotes || (d === "failed" && item.tagline)) && <CardField title="Creator's Notes" prose><Linked text={full?.creatorNotes || item.tagline} /></CardField>}
      {full?.description && <CardField title="Description"><Linked text={full.description} /></CardField>}
      {greetings.length > 0 && (
        <CardField title="First Message" prose contentKey={greeting} toolbar={greetings.length > 1 && (
          <div className="cb-greet-nav" role="group" aria-label="Greetings">
            <IconButton label="Previous greeting" disabled={greeting === 0} onClick={() => setGreeting(greeting - 1)}><Icon name="back" size={13} /></IconButton>
            <span>{greeting + 1}/{greetings.length}</span>
            <IconButton label="Next greeting" disabled={greeting >= greetings.length - 1} onClick={() => setGreeting(greeting + 1)}><Icon name="chevron" size={13} /></IconButton>
          </div>
        )}>
          <Linked text={greetings[Math.min(greeting, greetings.length - 1)]!} />
        </CardField>
      )}
      {full?.scenario && <CardField title="Scenario" prose><Linked text={full.scenario} /></CardField>}
      {full?.personality && <CardField title="Personality"><Linked text={full.personality} /></CardField>}
      {full?.exampleDialogue && <CardField title="Example Dialogue"><Linked text={full.exampleDialogue} /></CardField>}
      {full?.systemPrompt && <CardField title="System Prompt"><Linked text={full.systemPrompt} /></CardField>}
      {full?.postHistory && <CardField title="Post-History Instructions"><Linked text={full.postHistory} /></CardField>}
    </div>
  );
}

// Full fields stay independently scrollable and keyboard-accessible. CODEX, 2026-11-02.
function CardField({ title, children, prose = false, toolbar, contentKey }: {
  title: string; children: ReactNode; prose?: boolean; toolbar?: ReactNode; contentKey?: number;
}) {
  return (
    <details className="vs-sec cb-field" open>
      <summary><h3>{title}</h3><Icon name="chevron" size={14} /></summary>
      {toolbar}
      <div key={contentKey} className={`vs-text cb-field-text${prose ? " prose" : ""}`} role="region" aria-label={title} tabIndex={0}>{children}</div>
    </details>
  );
}

// ------------------------------------------------------------------ panels
function Pop({ open, onClose, button, children }: { open: boolean; onClose: () => void; button: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open, onClose]);
  return <span className="cb-pop-wrap" ref={ref}>{button}{open && <div className="cb-pop" role="dialog">{children}</div>}</span>;
}

function SourcePicker({ source, open, onToggle, onPick, onClose }: { source: CardSource; open: boolean; onToggle: () => void; onPick: (id: SourceId) => void; onClose: () => void }) {
  return (
    <Pop open={open} onClose={onClose} button={
      <Button data-testid="cb-source" aria-haspopup="menu" aria-expanded={open} onClick={onToggle}><Icon name="globe" size={14} /> {source.name} <span className="cb-caret"><Icon name="chevron" size={11} /></span></Button>}>
      <div role="menu" className="cb-sources">
        {CARD_SOURCES.map((s) => (
          <button key={s.id} type="button" role="menuitemradio" aria-checked={s.id === source.id} className={`cb-source${s.id === source.id ? " on" : ""}`} onClick={() => onPick(s.id)}>
            <span className="cb-source-check">{s.id === source.id && <Icon name="check" size={13} />}</span>
            <span><strong>{s.name}</strong><span className="hint">{NSFW_NOTE[s.id]}</span></span>
          </button>
        ))}
      </div>
    </Pop>
  );
}

function TagPanel({ tags, include, exclude, onSet }: { tags: string[]; include: string[]; exclude: string[]; onSet: (t: string, mode: "include" | "exclude" | null) => void }) {
  const [q, setQ] = useState("");
  const low = q.trim().toLowerCase();
  const mode = (t: string) => (include.some((x) => x.toLowerCase() === t.toLowerCase()) ? "include" : exclude.some((x) => x.toLowerCase() === t.toLowerCase()) ? "exclude" : null);
  const shown = tags.filter((t) => !low || t.toLowerCase().includes(low)).sort((a, b) => Number(!!mode(b)) - Number(!!mode(a))).slice(0, 80);
  const known = tags.some((t) => t.toLowerCase() === low);
  return (
    <div className="cb-tag-panel" data-testid="cb-tag-panel">
      <label className="search-box"><Icon name="search" size={13} /><input autoFocus aria-label="Search tags" placeholder="Search tags" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      {low && !known && <div className="cb-tag-new">
        <Button small onClick={() => { onSet(q, "include"); setQ(""); }}>Must Have “{q.trim()}”</Button>
        <Button small variant="plain" onClick={() => { onSet(q, "exclude"); setQ(""); }}>Hide “{q.trim()}”</Button>
      </div>}
      <ul className="cb-tag-list">
        {shown.map((t) => {
          const m = mode(t);
          return <li key={t} className={m ? `on ${m}` : ""}>
            <button type="button" className="cb-tag-name" aria-pressed={m === "include"} onClick={() => onSet(t, m === "include" ? null : "include")}>
              <span className="cb-tag-mark">{m === "include" ? <Icon name="check" size={12} /> : m === "exclude" ? "−" : null}</span>{t}</button>
            <button type="button" className="cb-tag-hide" aria-label={`Hide ${t}`} title={`Hide cards tagged ${t}`} aria-pressed={m === "exclude"} onClick={() => onSet(t, m === "exclude" ? null : "exclude")}>−</button>
          </li>;
        })}
        {shown.length === 0 && !low && <li className="hint">Tags appear after searching.</li>}
      </ul>
    </div>
  );
}

function FilterPanel({ source, filters, onChange }: { source: CardSource; filters: CardFilters; onChange: (f: CardFilters) => void }) {
  const num = (v: string) => { const n = Number(v); return v.trim() && Number.isFinite(n) && n > 0 ? Math.round(n) : undefined; };
  return (
    <div className="cb-filter-panel" data-testid="cb-filter-panel">
      {source.mustHave.length > 0 && <fieldset><legend className="field-label">Must Have</legend>
        {source.mustHave.map((x) => <label key={x} className="cb-check"><input type="checkbox" checked={filters.must.includes(x)}
          onChange={(e) => onChange({ ...filters, must: e.target.checked ? [...filters.must, x] : filters.must.filter((y) => y !== x) })} />{MUST_SHORT[x]}</label>)}
      </fieldset>}
      {source.tokens && <div className="cb-token-row">
        <label><span className="field-label">Min Tokens</span><input type="number" min={0} step={100} placeholder="Any" value={filters.minTokens ?? ""} onChange={(e) => onChange({ ...filters, minTokens: num(e.target.value) })} /></label>
        <label><span className="field-label">Max Tokens</span><input type="number" min={0} step={100} placeholder="Any" value={filters.maxTokens ?? ""} onChange={(e) => onChange({ ...filters, maxTokens: num(e.target.value) })} /></label>
      </div>}
      {source.ascending && <label className="cb-check"><input type="checkbox" checked={filters.ascending} onChange={(e) => onChange({ ...filters, ascending: e.target.checked })} />Ascending Order</label>}
      {source.lowQuality && <label className="cb-check"><input type="checkbox" checked={filters.lowQuality} onChange={(e) => onChange({ ...filters, lowQuality: e.target.checked })} />Show Low Quality</label>}
    </div>
  );
}
