// Card Browser: find characters on ChubAI, JannyAI, Wyvern and Pygmalion and add them to Characters (UI-PLAN "Card Browser",
// docs/CARD-BROWSER.md, D-081). Built like the Characters page: a portrait grid and a sheet beside it. CLAUDE, 2026-11-02.
// Everything from the sites is shown as plain text; nothing from them runs here.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type RefObject } from "react";
import type { Avatar, Character, Folder } from "@homunculus/schemas";
import { bytesToBase64 } from "@homunculus/st-cards";
import { CARD_SOURCES, cardSource, datacatCopy, DEFAULT_TRIGGER, isSourceId, NO_FILTERS, pauses, SiteError, type DatacatCopy } from "@homunculus/card-browser";
import type { BotbooruAccountState, CardDetails, CardFile, CardFilters, CardItem, CardQuery, CardSource, MustHave, SiteTransport, SourceId, TriggerChoice } from "@homunculus/card-browser";
import { Button, Icon, IconButton, Switch } from "./kit.tsx";
import { recordMove, useLive } from "./back-button.ts";
import { BotbooruAccount } from "./BotbooruAccount.tsx";
import { JanitorAccount } from "./JanitorAccount.tsx";
import { Toolbar } from "./Toolbar.tsx";
import { Help } from "./Help.tsx";
import { CardPicture, GalleryCard } from "./Gallery.tsx";
import { CardReader } from "./CardReader.tsx";
import { SizeSwitch, type CollectionPrefs } from "./CollectionTools.tsx";
import { childrenOf } from "./Folders.tsx";
import { openLink } from "./MessageText.tsx";
import { siteIndex, type FolderChoice } from "../importCharacters.ts";
import { getPrefs } from "../prefs.ts";

// ------------------------------------------------------------------ remembered state
/** Between runs (a per-viewer convenience, D-068 style): never required, defaults apply without it. */
type BrowseSourceId = SourceId | "all";
const ALL_SITES = { id: "all", name: "All Sites" } as const;
const SOURCE_OPTIONS = [ALL_SITES, ...CARD_SOURCES];
interface Prefs { source: BrowseSourceId; sorts: Partial<Record<SourceId, string>>; nsfw: Partial<Record<BrowseSourceId, boolean>>; size: CollectionPrefs["size"]; folder: string; importTags: boolean; datacatOk?: boolean; janitorExtractOk?: boolean; janitorTrigger?: Omit<TriggerChoice, "extra"> }
const PREFS_KEY = "h2.cardBrowser";
const DEFAULT_PREFS: Prefs = { source: "chub", sorts: {}, nsfw: {}, size: "m", folder: "web", importTags: true };
function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>;
    return { ...DEFAULT_PREFS, ...raw, source: raw.source === "all" || isSourceId(raw.source) ? raw.source : "chub", size: raw.size === "s" || raw.size === "m" || raw.size === "l" ? raw.size : getPrefs().cardSize };
  } catch { return { ...DEFAULT_PREFS, size: getPrefs().cardSize }; }
}
const savePrefs = (p: Prefs) => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* storage unavailable */ } };

/** While the app is open: leaving the page and coming back shows the same place. */
interface Memory { source: BrowseSourceId; text: string; sort: string; include: string[]; exclude: string[]; filters: CardFilters; items: CardItem[]; total: number | null; hasMore: boolean; page: number; selected: string | null; scroll: number; key: string; seenTags: string[] }
let memory: Memory | null = null;
const details = new Map<string, CardDetails | "failed">();

// ------------------------------------------------------------------ pictures
/** Last 300 grid pictures and the last 12 full-size ones (as avatars). */
const pictures = new Map<string, Avatar | null>();
const fullPictures = new Map<string, Avatar | null>();
/** Grid pictures are shrunk to what a card shows (sharp on a 2× screen), so a page of full-size pictures stays light.
 *  Animated GIFs and pictures already small enough are kept as they are. CLAUDE, 2026-11-03. */
export async function shrinkPicture(bytes: Uint8Array, mime: string, maxHeight = 720): Promise<Avatar> {
  const original = () => ({ mime, base64: bytesToBase64(bytes) });
  if (mime === "image/gif" || typeof createImageBitmap === "undefined") return original();
  try {
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }));
    if (bitmap.height <= maxHeight) { bitmap.close(); return original(); }
    const width = Math.max(1, Math.round((bitmap.width * maxHeight) / bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = maxHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) { bitmap.close(); return original(); }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, maxHeight);
    bitmap.close();
    const url = canvas.toDataURL("image/webp", 0.88);
    const comma = url.indexOf(",");
    return comma > 0 ? { mime: url.slice(5, url.indexOf(";")), base64: url.slice(comma + 1) } : original();
  } catch { return original(); }
}

// Grid and sheet share an in-flight download for the same URL. Only queued pictures with a viewer
// can start, and the sheet has a slot of its own so it never waits behind the grid. CODEX, 2026-11-04.
type PictureListener = (avatar: Avatar | null) => void;
type PictureRequest = { transport: SiteTransport; url: string; started: boolean; grid: Set<PictureListener>; sheet: Set<PictureListener> };
const pictureRequests = new Map<string, PictureRequest>();
let loadingGrid = 0;
let loadingSheet = false;

function savePicture(cache: Map<string, Avatar | null>, limit: number, url: string, avatar: Avatar | null, listeners: Set<PictureListener>) {
  if (!listeners.size) return;
  cache.set(url, avatar);
  if (cache.size > limit) cache.delete(cache.keys().next().value!);
  for (const listener of listeners) listener(avatar);
}

async function loadPicture(job: PictureRequest, sheet: boolean) {
  job.started = true;
  if (sheet) loadingSheet = true;
  else loadingGrid++;
  let gridPicture: Avatar | null = null;
  let sheetPicture: Avatar | null = null;
  try {
    const r = await job.transport.request({ url: job.url, method: "GET", expect: "image" });
    if (r.status >= 200 && r.status < 300 && r.bytes && r.mime) {
      if (job.grid.size) gridPicture = await shrinkPicture(r.bytes, r.mime);
      if (job.sheet.size) sheetPicture = { mime: r.mime, base64: bytesToBase64(r.bytes) };
    }
  } catch { /* Leave the letter placeholder when a picture cannot be fetched. */ }
  pictureRequests.delete(job.url);
  if (sheet) loadingSheet = false;
  else loadingGrid--;
  savePicture(pictures, 300, job.url, gridPicture, job.grid);
  savePicture(fullPictures, 12, job.url, sheetPicture, job.sheet);
  loadWaitingPictures();
}

function loadWaitingPictures() {
  if (!loadingSheet) {
    const next = [...pictureRequests.values()].find((job) => !job.started && job.sheet.size);
    if (next) void loadPicture(next, true);
  }
  for (const job of pictureRequests.values()) {
    if (loadingGrid >= 4) break;
    if (!job.started && job.grid.size) void loadPicture(job, false);
  }
}

function watchPicture(transport: SiteTransport, url: string, full: boolean, listener: PictureListener) {
  const job = pictureRequests.get(url) ?? { transport, url, started: false, grid: new Set<PictureListener>(), sheet: new Set<PictureListener>() };
  pictureRequests.set(url, job);
  const listeners = full ? job.sheet : job.grid;
  listeners.add(listener);
  loadWaitingPictures();
  return () => {
    listeners.delete(listener);
    if (!job.started && !job.grid.size && !job.sheet.size) pictureRequests.delete(url);
  };
}
/** `full`: the sheet's picture (the site's biggest, `item.image`), falling back to the grid one while it loads or if it fails. */
function usePicture(t: SiteTransport, item: CardItem | null, visible: boolean, full = false): Avatar | undefined {
  const url = (full ? item?.image || item?.thumb : item?.thumb) ?? "";
  const cache = full ? fullPictures : pictures;
  const [result, setResult] = useState<{ url: string; avatar: Avatar | null }>();
  useEffect(() => {
    if (!url || !visible || cache.has(url)) return;
    return watchPicture(t, url, full, (avatar) => setResult({ url, avatar }));
  }, [t, url, visible, full, cache]);
  const a = result?.url === url ? result.avatar : cache.get(url);
  const small = item?.thumb ? pictures.get(item.thumb) : undefined;
  return a ?? (full ? small ?? undefined : undefined);
}

const onScreen = new Map<Element, (visible: boolean) => void>();
let pictureObserver: IntersectionObserver | undefined;
function useOnScreen<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setOn(true); return; }
    const io = pictureObserver ??= new IntersectionObserver((entries) => {
      for (const entry of entries) onScreen.get(entry.target)?.(entry.isIntersecting);
    }, { rootMargin: "200px" });
    onScreen.set(el, setOn);
    io.observe(el);
    return () => { onScreen.delete(el); io.unobserve(el); };
  }, []);
  return [ref, on];
}

// ------------------------------------------------------------------ helpers
const NSFW_NOTE: Record<BrowseSourceId, string> = { all: "Search across card sites", chub: "Adult cards with NSFW on", janny: "Adult cards with NSFW on", wyvern: "Adult cards with NSFW on", pygmalion: "Safe cards only", datacat: "Adult cards only", botbooru: "NSFW and NSFL with your account", janitor: "Adult cards with NSFW on" };
const MUST_LABEL: Record<MustHave, string> = { lorebook: "Has Lorebook", greetings: "Has Alternate Greetings", gallery: "Has Gallery", expressions: "Has Expressions" };
const MUST_SHORT: Record<MustHave, string> = { lorebook: "Lorebook", greetings: "Alternate Greetings", gallery: "Gallery", expressions: "Expressions" };
const fmt = (n: number | undefined) => (n === undefined ? "" : n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n));
function figures(i: CardItem): string {
  const s = i.stats;
  return [s.downloads !== undefined && `${fmt(s.downloads)} downloads`, s.likes !== undefined && `${fmt(s.likes)} likes`, s.stars !== undefined && s.downloads === undefined && `${fmt(s.stars)} stars`,
    s.tokens !== undefined && `${fmt(s.tokens)} tokens`].filter(Boolean).join(" · ");
}
const desktopOnly = (e: unknown) => e instanceof Error && /works in the desktop app/.test(e.message);
const cardKey = (item: CardItem) => `${item.source}:${item.id}`;

// Each batch keeps the earlier pages in place and interleaves the new pages in picker order. CODEX, 2026-11-04.
type SearchMode = "search" | "more" | "retry";
type SiteProgress = { nextPage: number | null; failure?: { message: string; desktop: boolean } };
type AllResults = { items: CardItem[]; progress: Map<SourceId, SiteProgress> };
const EMPTY_ALL_RESULTS: AllResults = { items: [], progress: new Map() };
const GUEST_ACCOUNT: BotbooruAccountState = { username: null, showNsfw: false, showNsfl: false };
function mergeSitePages(previous: CardItem[], pages: Map<SourceId, CardItem[]>): CardItem[] {
  const items = [...previous];
  const seen = new Set(previous.map(cardKey));
  const ordered = CARD_SOURCES.map((site) => pages.get(site.id) ?? []);
  const rows = Math.max(...ordered.map((page) => page.length));
  for (let row = 0; row < rows; row++) {
    for (const page of ordered) {
      const item = page[row];
      if (!item || seen.has(cardKey(item))) continue;
      seen.add(cardKey(item));
      items.push(item);
    }
  }
  return items;
}
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
  onAdd: (file: CardFile, item: CardItem, opts: { folder: FolderChoice; importTags: boolean; notes?: string[] }) => Promise<string | null>;
  /** One call to the default AI connection (rebuilds an extracted JanitorAI card's closed lorebook, D-099); none = no connection. */
  complete?: ((messages: Array<{ role: "system" | "user"; content: string }>) => Promise<string>) | undefined;
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
  const [sourceId, setSourceId] = useState<BrowseSourceId>(m?.source ?? prefs.source);
  const source = sourceId === "all" ? null : cardSource(sourceId);
  const sourceName = source?.name ?? ALL_SITES.name;
  const restore = m?.source === "all" || m?.source === "botbooru" ? null : m;
  const [text, setText] = useState(m?.text ?? "");
  const [sort, setSort] = useState(m?.sort ?? (source ? prefs.sorts[source.id] ?? source.defaultSort : ""));
  const [include, setInclude] = useState<string[]>(m?.include ?? []);
  const [exclude, setExclude] = useState<string[]>(m?.exclude ?? []);
  const [filters, setFilters] = useState<CardFilters>(m?.filters ?? NO_FILTERS);
  const [singleItems, setItems] = useState<CardItem[]>(restore?.items ?? []);
  const [total, setTotal] = useState<number | null>(restore?.total ?? null);
  const [hasMore, setHasMore] = useState(restore?.hasMore ?? false);
  const [page, setPage] = useState(restore?.page ?? 1);
  const [allResults, setAllResults] = useState(EMPTY_ALL_RESULTS);
  const [selected, setSelected] = useState<string | null>(restore?.selected ?? null);
  // M4 closes the card preview, M5 opens it again (D-097): opening it from the grid is a move; moving between cards is not
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const live = useLive();
  const openCard = (key: string) => {
    if (selectedRef.current === null) recordMove({ undo: () => setSelected(null), redo: () => setSelected(key),
      canUndo: () => live.current && selectedRef.current !== null, canRedo: () => live.current && selectedRef.current === null });
    selectedRef.current = key;
    setSelected(key);
  };
  const [seenTags, setSeenTags] = useState<string[]>(restore?.seenTags ?? []);
  const [busy, setBusy] = useState<"search" | "more" | null>(null);
  const [error, setError] = useState<{ message: string; paused: boolean; desktop: boolean } | null>(null);
  const [open, setOpen] = useState<"source" | "tags" | "filters" | null>(null);
  const [account, setAccount] = useState(GUEST_ACCOUNT);
  const lastAccount = useRef(GUEST_ACCOUNT);
  const [accountEpoch, setAccountEpoch] = useState(0);
  const botbooruNsfw = !!(account.username && account.showNsfw);
  const accountReady = sourceId !== "botbooru" || botbooruNsfw;
  const nsfw = source
    ? accountReady && (source.nsfw === "always" || (source.nsfw === "toggle" && prefs.nsfw[source.id] === true))
    : prefs.nsfw.all ?? true;
  const dataCatAllowed = !source && nsfw && prefs.datacatOk === true;
  const items = useMemo(() => source ? singleItems : nsfw ? allResults.items : allResults.items.filter((item) => !item.nsfw && !item.nsfl), [source, singleItems, nsfw, allResults.items]);
  const allFailures = CARD_SOURCES.flatMap((site) => {
    const failure = allResults.progress.get(site.id)?.failure;
    return failure ? [{ name: site.name, ...failure }] : [];
  });
  const allHasMore = [...allResults.progress.values()].some((site) => site.nextPage !== null && !site.failure);
  const [askAdult, setAskAdult] = useState(false);
  // tags the site lists itself (DataCat), loaded once per source
  const [siteTags, setSiteTags] = useState<string[]>([]);
  useEffect(() => {
    setSiteTags([]);
    if (!source?.loadTags) return;
    let live = true;
    source.loadTags(p.transport).then((xs) => { if (live) setSiteTags(xs); }, () => {});
    return () => { live = false; };
  }, [source, p.transport, accountEpoch]);
  const search = useRef<HTMLInputElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const added = useMemo(() => siteIndex(p.characters), [p.characters]);
  const accountChanged = useCallback((a: BotbooruAccountState) => {
    const initialGuest = lastAccount.current === GUEST_ACCOUNT && !a.username && !a.showNsfw && !a.showNsfl;
    lastAccount.current = a;
    if (initialGuest) return;
    ++seq.current; setBusy(null); setItems([]); setSelected(null); setSeenTags([]); setSiteTags([]);
    setAllResults((old) => ({ ...old, items: old.items.filter((item) => item.source !== "botbooru") }));
    for (const k of details.keys()) if (k.startsWith("botbooru:")) details.delete(k);
    for (const k of pictures.keys()) if (k.startsWith("https://botbooru.com/")) pictures.delete(k);
    pauses.verified("botbooru"); setAccount(a); setAccountEpoch((x) => x + 1);
  }, []);
  // JanitorAI's sign-in changed, or its browser check passed (Refresh): forget what came from it and search again (D-098)
  const janitorChanged = useCallback(() => {
    ++seq.current; setBusy(null); setItems([]); setSelected(null); setSeenTags([]); setError(null);
    for (const k of details.keys()) if (k.startsWith("janitor:")) details.delete(k);
    pauses.verified("janitor"); setAccountEpoch((x) => x + 1);
  }, []);
  const key = JSON.stringify([sourceId, text.trim(), sort, include, exclude, filters, nsfw, dataCatAllowed, sourceId === "botbooru" || sourceId === "janitor" || !source ? accountEpoch : 0]);
  const lastKey = useRef(restore?.key ?? "");

  const run = async (mode: SearchMode) => {
    if (mode !== "search" && key !== lastKey.current) return;
    const id = ++seq.current;
    // Let an in-flight request finish, but don't start another step for a superseded search. CODEX.
    const transport: SiteTransport = { ...p.transport, request: async (request) => {
      if (id !== seq.current) throw new DOMException("Search superseded.", "AbortError");
      return p.transport.request(request);
    } };
    const more = mode === "more";
    const nextPage = more ? page + 1 : 1;
    const query: CardQuery = { text: text.trim(), sort, page: nextPage, nsfw, include, exclude, filters };
    const rememberTags = (cards: CardItem[]) => setSeenTags((old) => [...new Set([...old, ...cards.flatMap((item) => item.tags)])].slice(0, 400));
    setBusy(mode === "search" ? "search" : "more"); setError(null);
    try {
      if (!source) {
        const base = mode === "search" ? EMPTY_ALL_RESULTS : allResults;
        const progress = new Map(base.progress);
        const pages = new Map<SourceId, CardItem[]>();
        if (mode === "search") {
          setAllResults(base); setSelected(null); setSeenTags([]);
          gridRef.current?.scrollTo?.({ top: 0 });
        }
        await Promise.all(CARD_SOURCES.map(async (site) => {
          if (site.nsfw === "always" && !dataCatAllowed) return;
          if (site.separate) return; // JanitorAI: its own window first (D-098)
          const state = progress.get(site.id);
          const sitePage = mode === "search" ? 1 : state?.nextPage;
          if (!sitePage || (mode === "retry" && !state?.failure) || (more && state?.failure)) return;
          const siteNsfw = nsfw && site.nsfw !== "never" && (site.id !== "botbooru" || botbooruNsfw);
          const siteNsfl = site.id !== "botbooru" || account.showNsfl;
          try {
            const result = await site.search({ ...query, page: sitePage, sort: site.defaultSort, nsfw: siteNsfw }, transport);
            if (id !== seq.current) return;
            const cards = result.items.filter((item) => {
              const adult = item.nsfw || item.nsfl;
              return (!adult || siteNsfw) && (!item.nsfl || siteNsfl);
            });
            progress.set(site.id, { nextPage: result.hasMore ? sitePage + 1 : null });
            pages.set(site.id, cards);
            rememberTags(cards);
          } catch (e) {
            if (id !== seq.current) return;
            progress.set(site.id, { nextPage: sitePage, failure: { message: e instanceof Error ? e.message : String(e), desktop: desktopOnly(e) } });
          }
          setAllResults({ items: mergeSitePages(base.items, pages), progress: new Map(progress) });
        }));
        return;
      }
      const r = await source.search(query, transport);
      if (id !== seq.current) return;
      setItems((old) => { if (!more) return r.items; const have = new Set(old.map(cardKey)); return [...old, ...r.items.filter((x) => !have.has(cardKey(x)))]; });
      setTotal(r.total); setHasMore(r.hasMore); setPage(nextPage);
      rememberTags(r.items);
      if (!more) { setSelected((s) => (s && r.items.some((x) => cardKey(x) === s) ? s : null)); gridRef.current?.scrollTo?.({ top: 0 }); }
    } catch (e) {
      if (id !== seq.current) return;
      setError({ message: e instanceof Error ? e.message : String(e), paused: e instanceof SiteError && e.paused, desktop: desktopOnly(e) });
      if (!more) setItems([]);
    } finally { if (id === seq.current) setBusy(null); }
  };

  // search by itself ½ s after typing stops (and at once when anything else changes); not again when coming back
  useEffect(() => {
    if (key === lastKey.current && !busy) return () => { ++seq.current; };
    const [lastSource, lastText] = lastKey.current ? JSON.parse(lastKey.current) : [];
    const typing = lastSource === sourceId && lastText !== text.trim();
    // marked as asked only when it runs, so a cancelled timer (typing on, or React's double effect) asks again
    const timer = setTimeout(() => { lastKey.current = key; void run("search"); }, typing ? 500 : 0);
    return () => { clearTimeout(timer); ++seq.current; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // keep the place while the app is open
  useEffect(() => {
    memory = { source: sourceId, text, sort, include, exclude, filters, items: source && sourceId !== "botbooru" ? singleItems : [], total, hasMore, page, selected, scroll: gridRef.current?.scrollTop ?? memory?.scroll ?? 0, key: busy ? "" : lastKey.current, seenTags };
  });
  useEffect(() => { if (m?.scroll && gridRef.current) gridRef.current.scrollTop = m.scroll; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const switchSource = (id: BrowseSourceId, confirmed = false) => {
    setOpen(null);
    if (id === sourceId) return;
    // DataCat lists adult cards only: asked once (remembered)
    if (id === "datacat" && !prefs.datacatOk && !confirmed) { setAskAdult(true); return; }
    setAskAdult(false);
    setSourceId(id); setPrefs((x) => ({ ...x, source: id }));
    if (id !== "all" && id !== "botbooru") {
      lastAccount.current = GUEST_ACCOUNT;
      setAccount(GUEST_ACCOUNT);
    }
    // the search text stays; tags and filters differ by site
    setInclude([]); setExclude([]); setFilters(NO_FILTERS); setSeenTags([]); setSelected(null); setItems([]);
    setAllResults(EMPTY_ALL_RESULTS);
    setSort(id === "all" ? "" : prefs.sorts[id] ?? cardSource(id).defaultSort);
  };
  const pickSort = (s: string) => { if (source) { setSort(s); setPrefs((x) => ({ ...x, sorts: { ...x.sorts, [source.id]: s } })); } };
  const setTag = (t: string, mode: "include" | "exclude" | null) => {
    const name = t.trim(); if (!name) return;
    const low = name.toLowerCase(); const drop = (xs: string[]) => xs.filter((x) => x.toLowerCase() !== low);
    setInclude((xs) => (mode === "include" ? [...drop(xs), name] : drop(xs)));
    setExclude((xs) => (mode === "exclude" ? [...drop(xs), name] : drop(xs)));
  };
  const clearAll = () => { setInclude([]); setExclude([]); setFilters(NO_FILTERS); };
  const activeFilters = filters.must.length + (filters.ascending ? 1 : 0) + (filters.minTokens ? 1 : 0) + (filters.maxTokens ? 1 : 0) + (filters.lowQuality ? 1 : 0);
  const hasFilters = source && (source.mustHave.length > 0 || source.ascending || source.tokens || source.lowQuality);
  const allDesktopOnly = !source && !busy && allFailures.length > 0 && allFailures.length === allResults.progress.size && allFailures.every((site) => site.desktop);
  const searchPending = busy !== null || key !== lastKey.current;
  const searchSucceeded = source ? !error : allResults.progress.size > allFailures.length;
  const emptyMessage = text.trim()
    ? `${source ? `Nothing on ${sourceName} matches` : "No cards match"} “${text.trim()}”.`
    : source ? `Nothing on ${sourceName} with these choices.` : "No cards match these choices.";
  const chosen = items.find((x) => cardKey(x) === selected) ?? null;
  // the card reading view (D-082) stays open while ← → move to other cards
  const [reading, setReading] = useState(false);
  useEffect(() => { if (!chosen) setReading(false); }, [chosen]);
  const at = chosen ? items.indexOf(chosen) : -1;
  const stepCard = (d: 1 | -1) => { const next = items[at + d]; if (next) setSelected(cardKey(next)); };

  const onKey = (e: ReactKeyboardEvent) => {
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") { e.preventDefault(); search.current?.focus(); return; }
    if (e.key === "Escape") { if (open) setOpen(null); else if (selected) setSelected(null); return; }
    const reading = e.target instanceof Element && e.target.closest(".cb-sheet");
    if (typing || reading || !items.length || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const cards = gridRef.current?.querySelectorAll<HTMLElement>("[data-testid=cb-card]");
    const perRow = cards && cards.length > 1 ? Math.max(1, [...cards].filter((c) => c.offsetTop === cards[0]!.offsetTop).length) : 1;
    const at = Math.max(0, items.findIndex((x) => cardKey(x) === selected));
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -perRow, ArrowDown: perRow }[e.key] ?? 0;
    const next = items[Math.min(items.length - 1, Math.max(0, selected ? at + step : 0))];
    if (next) { openCard(cardKey(next)); cards?.[items.indexOf(next)]?.focus(); }
  };

  return (
    <div className="page collection-page card-browser" data-testid="card-browser" data-region="collection" onKeyDown={onKey}>
      <Toolbar lead={p.lead} title="Card Browser" subtitle="Find public character cards."
        trailing={<>
          <Help text="Searches contact the selected site. All Sites contacts each enabled site. Card content displays as plain text." />
          <SourcePicker sourceId={sourceId} name={sourceName} open={open === "source"} onToggle={() => setOpen(open === "source" ? null : "source")} onPick={switchSource} onClose={() => setOpen(null)} />
        </>} />
      <div className="collection-tools cb-tools" data-region="collection-tools">
        <div className="cb-tools-left">
          <label className="search-box collection-search cb-search"><Icon name="search" size={15} />
            <input ref={search} data-testid="cb-search" aria-label={`Search ${sourceName}`} placeholder={`Search ${sourceName}…`} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          {source && <label className="cb-sort"><span className="sr-only">Sort</span>
            <select data-testid="cb-sort" aria-label="Sort" value={sort} onChange={(e) => pickSort(e.target.value)}>
              {source.sorts.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>}
          <Pop open={open === "tags"} onClose={() => setOpen(null)} button={
            <Button variant="plain" data-testid="cb-tags" aria-expanded={open === "tags"} onClick={() => setOpen(open === "tags" ? null : "tags")}>
              Tags{include.length + exclude.length > 0 && <span className="cb-count">{include.length + exclude.length}</span>}</Button>}>
            <TagPanel tags={[...new Set([...(source?.suggestedTags ?? []), ...siteTags, ...seenTags])]} include={include} exclude={exclude} onSet={setTag} />
          </Pop>
          {source && hasFilters && <Pop open={open === "filters"} onClose={() => setOpen(null)} button={
            <Button variant="plain" data-testid="cb-filters" aria-expanded={open === "filters"} onClick={() => setOpen(open === "filters" ? null : "filters")}>
              Filters{activeFilters > 0 && <span className="cb-count">{activeFilters}</span>}</Button>}>
            <FilterPanel source={source} filters={filters} onChange={setFilters} />
          </Pop>}
          <span className="cb-nsfw" data-testid="cb-nsfw" title={!accountReady ? "Sign in and enable NSFW in your BotBooru account." : source?.nsfwNote}>
            <Switch label="NSFW" checked={nsfw} disabled={!accountReady || (source !== null && source.nsfw !== "toggle")} onChange={(v) => setPrefs((x) => ({ ...x, nsfw: { ...x.nsfw, [sourceId]: v } }))} />
            <span>NSFW</span>
          </span>
        </div>
        <span className="collection-right"><SizeSwitch prefs={{ view: "everything", size: prefs.size }} onPrefs={(x) => setPrefs((y) => ({ ...y, size: x.size }))} /></span>
      </div>
      {(!source || sourceId === "botbooru") && <BotbooruAccount transport={p.transport} onChange={accountChanged} />}
      {sourceId === "janitor" && <JanitorAccount transport={p.transport} onChange={janitorChanged} />}
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
              <p className="hint">Its cards come from JanitorAI.</p>
              <div className="cb-notice-actions">
                <Button variant="prominent" onClick={() => { setPrefs((x) => ({ ...x, datacatOk: true })); switchSource("datacat", true); }}>Continue</Button>
                <Button onClick={() => setAskAdult(false)}>Back</Button>
              </div>
            </div>
          )}
          {!source && nsfw && !dataCatAllowed && !allDesktopOnly && (
            <div className="cb-account" data-testid="cb-datacat-opt-in">
              <span className="hint">DataCat lists adult cards only. Its cards come from JanitorAI.</span>
              <Button small onClick={() => setPrefs((x) => ({ ...x, datacatOk: true }))}>Include DataCat</Button>
            </div>
          )}
          {allDesktopOnly && <div className="cb-notice gallery-empty" data-testid="cb-notice"><p>The Card Browser works in the desktop app.</p></div>}
          {!source && !allDesktopOnly && allFailures.length > 0 && (
            <div className="cb-account" data-testid="cb-site-errors">
              <div className="hint" role="status">{allFailures.map((site) => <div key={site.name}>{site.name} · {site.message}</div>)}</div>
              <Button small disabled={searchPending} onClick={() => void run("retry")}>Retry Failed Sites</Button>
            </div>
          )}
          {source && error && (error.desktop
            ? <div className="cb-notice gallery-empty" data-testid="cb-notice"><p>The Card Browser works in the desktop app.</p></div>
            : <div className="cb-notice gallery-empty" data-testid="cb-notice">
                <p>{error.message}</p>
                <div className="cb-notice-actions">
                  {error.paused && source.id === "janitor"
                    ? <><Button onClick={() => void p.transport.janitorAccount?.("show")}>Open JanitorAI</Button>
                        <Button onClick={janitorChanged}>Try Again</Button></>
                    : error.paused
                    ? <><Button onClick={() => void openLink(source.site)}>Open {source.name}</Button>
                        <Button onClick={() => fileInput.current?.click()}>Import a Downloaded File…</Button></>
                    : <Button onClick={() => void run("search")}>Try Again</Button>}
                </div>
              </div>)}
          {!error && (items.length > 0 || busy === "search") && (
            <div className="collection-heading"><h2>{busy === "search" && (source || !items.length) ? "Searching…" : !source ? `${items.length.toLocaleString("en-US")} loaded` : total !== null ? `${total.toLocaleString("en-US")} cards` : `Page ${page}`}</h2><span>{sourceName}</span></div>
          )}
          <div className="gallery-cards" data-testid="cb-grid" aria-busy={busy === "search"}>
            {busy === "search" && items.length === 0
              ? Array.from({ length: 12 }, (_, i) => <div key={i} className="gallery-card cb-ghost" aria-hidden />)
              : items.map((it) => <ResultCard key={cardKey(it)} item={it} sourceLabel={!source ? cardSource(it.source).name : undefined} t={p.transport} selected={cardKey(it) === selected} added={added.has(cardKey(it))} onClick={() => openCard(cardKey(it))} />)}
          </div>
          {searchSucceeded && !searchPending && items.length === 0 && lastKey.current && (
            <div className="gallery-empty hint" data-testid="cb-empty">
              <p>{emptyMessage}</p>
              {(include.length + exclude.length + activeFilters > 0) && <Button onClick={clearAll}>Clear Tags and Filters</Button>}
            </div>
          )}
          {(source ? hasMore && items.length > 0 && !error : allHasMore) && (
            <div className="cb-more"><Button data-testid="cb-load-more" disabled={searchPending} onClick={() => void run("more")}>{busy === "more" ? "Loading…" : "Load More"}</Button></div>
          )}
          <input ref={fileInput} type="file" accept=".png,.json" multiple hidden onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) p.onImportFiles(files); }} />
        </div>
        <aside className={`gallery-sheet${chosen ? " has-card" : ""}`} data-region="sheet">
          <div className="collection-detail-label cb-sheet-label">Card details{chosen && <IconButton className="cb-sheet-close" label="Close" onClick={() => setSelected(null)}><Icon name="close" size={13} /></IconButton>}</div>
          {chosen
            ? <CardSheet key={cardKey(chosen)} item={chosen} source={cardSource(chosen.source)} {...p} onImportDownloaded={() => fileInput.current?.click()} prefs={prefs} setPrefs={setPrefs} addedId={added.get(cardKey(chosen)) ?? null}
                reading={reading} setReading={setReading} onCloseSheet={() => setSelected(null)}
                onPrev={at > 0 ? () => stepCard(-1) : undefined} onNext={at >= 0 && at < items.length - 1 ? () => stepCard(1) : undefined} />
            : <div className="empty-detail"><p>Select a card to preview it.</p></div>}
        </aside>
      </div>
    </div>
  );
}

function ResultCard({ item, sourceLabel, t, selected, added, onClick }: { item: CardItem; sourceLabel?: string | undefined; t: SiteTransport; selected: boolean; added: boolean; onClick: () => void }) {
  const [ref, on] = useOnScreen<HTMLSpanElement>();
  const pic = usePicture(t, item, on);
  const byline = [sourceLabel, item.creator ? `by ${item.creator}` : undefined].filter(Boolean).join(" · ");
  return (
    <span ref={ref} className="cb-card-wrap">
      <GalleryCard testId="cb-card" name={item.name} selected={selected} onClick={onClick} by={byline || undefined}
        summary={item.tagline || undefined} tags={item.tags} size={item.stats.tokens !== undefined ? `${fmt(item.stats.tokens)} tok` : item.stats.downloads !== undefined ? `${fmt(item.stats.downloads)} dl` : undefined}
        picture={<>
          <CardPicture name={item.name} avatar={pic} />
          {(item.nsfw || added) && <span className="cb-marks">{item.nsfw && <span className="cb-mark">{item.nsfl ? "NSFL" : "NSFW"}</span>}{added && <span className="cb-mark added" title="In your Characters" aria-label="In your Characters"><Icon name="check" size={12} /></span>}</span>}
        </>} />
    </span>
  );
}

// ------------------------------------------------------------------ the sheet
function CardSheet({ item, source, transport, characters: _c, folders, onAdd, complete, onSavePng, onOpenCharacter, onChat, onNewFolder, onError, onImportDownloaded, prefs, setPrefs, addedId, reading, setReading, onCloseSheet, onPrev, onNext }: CardBrowserProps & {
  onImportDownloaded: () => void; item: CardItem; source: CardSource; prefs: Prefs; setPrefs: (f: (x: Prefs) => Prefs) => void; addedId: string | null;
  reading: boolean; setReading: (v: boolean) => void; onCloseSheet: () => void; onPrev?: (() => void) | undefined; onNext?: (() => void) | undefined;
}) {
  const k = `${item.source}:${item.id}`;
  const [d, setD] = useState<CardDetails | "failed" | null>(details.get(k) ?? null);
  const [greeting, setGreeting] = useState(0);
  const [working, setWorking] = useState<"add" | "png" | "extract" | "datacat" | null>(null);
  const [phase, setPhase] = useState("");
  const [askExtract, setAskExtract] = useState(false);
  // what the lorebook trigger sends (D-100): the switches are remembered, the extra text belongs to this card
  const [extraText, setExtraText] = useState("");
  const trigger: TriggerChoice = { ...DEFAULT_TRIGGER, ...prefs.janitorTrigger, extra: extraText };
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const pic = usePicture(transport, item, true, true);
  useEffect(() => {
    if (details.has(k)) return;
    let live = true;
    source.details(item, transport).then((x) => { if (!x.partial) details.set(k, x); if (live) setD(x); }, () => { if (live) setD("failed"); });
    return () => { live = false; };
  }, [k]); // eslint-disable-line react-hooks/exhaustive-deps
  const full = d && d !== "failed" ? d : null;
  const mine = justAdded ?? addedId;
  // D-101: a hidden JanitorAI card may already be on DataCat (someone else extracted it). Looked up when the sheet opens,
  // only when DataCat is allowed (its adult-only notice was accepted); it never blocks the sheet.
  const [copy, setCopy] = useState<DatacatCopy | null | "looking">(null);
  const lookUp = !!full?.canExtract && !mine && prefs.datacatOk === true;
  useEffect(() => {
    if (!lookUp) { setCopy(null); return; }
    let live = true; setCopy("looking");
    void datacatCopy(item.id, item, transport).then((c) => { if (live) setCopy(c); });
    return () => { live = false; };
  }, [k, lookUp]); // eslint-disable-line react-hooks/exhaustive-deps
  const onDatacat = copy && copy !== "looking" && !copy.downloadsOff ? copy : null;
  const folderChoice = (): FolderChoice => (prefs.folder === "web" ? "from-the-web" : prefs.folder ? { id: prefs.folder } : null);
  const fetchFile = async () => onDatacat ? cardSource("datacat").download(onDatacat.item, transport) : source.download(item, transport);
  const add = async () => {
    setWorking("add"); setMenu(false);
    try {
      const id = await onAdd(await fetchFile(), item, { folder: folderChoice(), importTags: prefs.importTags });
      if (id) setJustAdded(id);
    } catch (e) { onError(`Could not add ${item.name}`, e instanceof Error ? e.message : String(e), e instanceof SiteError && e.paused ? onImportDownloaded : undefined); }
    finally { setWorking(null); }
  };
  const addFromDatacat = async () => {
    if (!onDatacat) return;
    setWorking("datacat"); setMenu(false);
    try {
      const notes = [`From DataCat's copy${onDatacat.date ? ` (${shortDate(onDatacat.date)})` : ""}; it may be older than the card on JanitorAI.`];
      const id = await onAdd(await fetchFile(), item, { folder: folderChoice(), importTags: prefs.importTags, notes });
      if (id) setJustAdded(id);
    } catch (e) { onError(`Could not add ${item.name} from DataCat`, e instanceof Error ? e.message : String(e)); }
    finally { setWorking(null); }
  };
  // JanitorAI hidden card (D-099): read through the person's account, then added like any other card
  const extract = async (confirmed = false) => {
    if (!source.extract) return;
    if (!prefs.janitorExtractOk && !confirmed) { setAskExtract(true); return; }
    setAskExtract(false); setWorking("extract"); setMenu(false);
    try {
      const r = await source.extract(item, transport, { onPhase: setPhase, complete, trigger });
      const notes = [r.closedEntries ? `Closed lorebook: ${r.closedEntries} ${r.closedEntries === 1 ? "entry" : "entries"} rebuilt by your AI connection; check their keys.` : "", r.loreNote].filter(Boolean);
      const id = await onAdd(r.file, item, { folder: folderChoice(), importTags: prefs.importTags, notes });
      if (id) setJustAdded(id);
    } catch (e) { onError(`Could not extract ${item.name}`, e instanceof Error ? e.message : String(e)); }
    finally { setWorking(null); setPhase(""); }
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
  const badges = [full?.hasLorebook && "Lorebook", greetings.length > 1 && `${greetings.length} Greetings`, item.nsfw && (item.nsfl ? "NSFL" : "NSFW")].filter(Boolean) as string[];
  const figs = figures(item);

  const mainActions = <>
        {mine
          ? <>{justAdded ? <Button variant="prominent" data-testid="cb-chat" onClick={() => onChat(mine)}>Chat Now</Button>
                        : <Button variant="prominent" data-testid="cb-open" onClick={() => onOpenCharacter(mine)}>Open in Characters</Button>}</>
          : full?.canExtract && source.extract && onDatacat
            ? <><Button variant="prominent" data-testid="cb-datacat-add" disabled={working !== null} onClick={() => void addFromDatacat()}>{working === "datacat" ? "Adding…" : "Add from DataCat"}</Button>
                <Button data-testid="cb-extract" disabled={working !== null} onClick={() => void extract()}>{working === "extract" ? `${phase || "Extracting"}…` : "Extract Yourself"}</Button></>
          : full?.canExtract && source.extract
            ? <Button variant="prominent" data-testid="cb-extract" disabled={working !== null} onClick={() => void extract()}>{working === "extract" ? `${phase || "Extracting"}…` : "Extract and Add"}</Button>
            : <Button variant="prominent" data-testid="cb-add" disabled={working !== null || !!full?.hidden} title={full?.hidden} onClick={() => void add()}>{working === "add" ? "Adding…" : "Add to Characters"}</Button>}
        <Button data-testid="cb-png" disabled={working !== null || (!!full?.hidden && !onDatacat)} title={onDatacat ? undefined : full?.hidden} onClick={() => void png()}>{working === "png" ? "Saving…" : "Save as PNG"}</Button>
        <Button onClick={() => void openLink(item.url)}>Open on {source.name}</Button>
  </>;
  const by = [item.creator && `by ${item.creator}`, figs].filter(Boolean).join(" · ");
  return (
    <div className="view-sheet cb-sheet" data-testid="cb-sheet">
      <div className="vs-actions cb-sticky-actions">
        <strong className="cb-action-name" title={item.name}>{item.name}</strong>
        {mainActions}
        <Button data-testid="cb-read" onClick={() => setReading(true)}>Read</Button>
        {mine && <span className="cb-menu">
          <IconButton label="More" aria-expanded={menu} onClick={() => setMenu(!menu)}><Icon name="dots" /></IconButton>
          {menu && <span className="cb-pop cb-pop-right" role="menu"><button type="button" role="menuitem" data-testid="cb-add-again" onClick={() => void add()}>Add Again</button></span>}
        </span>}
      </div>
      {full?.hidden && !mine && (onDatacat
        ? <p className="hint cb-hidden" data-testid="cb-datacat">Already on DataCat{onDatacat.date ? ` · ${shortDate(onDatacat.date)}` : ""} · {onDatacat.loreEntries ? `lorebook: ${onDatacat.loreEntries} ${onDatacat.loreEntries === 1 ? "entry" : "entries"}` : "no lorebook"}. Its copy may be older than the card here; Extract Yourself reads the current one.</p>
        : <p className="hint cb-hidden" data-testid="cb-hidden">{full.hidden}{copy === "looking" ? " Looking on DataCat…" : copy && copy.downloadsOff ? " It is on DataCat, but its creator turned downloads off there." : ""}</p>)}
      {askExtract && (
        <div className="cb-account" data-testid="cb-extract-ask" role="alertdialog" aria-label="Extract from JanitorAI">
          <span className="hint">Extracting opens a chat with this character on your JanitorAI account, through a temporary proxy setting, and puts everything back afterwards (about a minute; JanitorAI's window shows while it works). JanitorAI's rules don't allow this, and accounts can be limited for it.</span>
          <div className="cb-notice-actions">
            <Button variant="prominent" small onClick={() => { setPrefs((x) => ({ ...x, janitorExtractOk: true })); void extract(true); }}>Extract</Button>
            <Button small onClick={() => setAskExtract(false)}>Cancel</Button>
          </div>
        </div>
      )}
      <button type="button" className="vs-pic-read" aria-label={`Read ${item.name} full window`} onClick={() => setReading(true)}><CardPicture name={item.name} avatar={pic} className="vs-pic" /></button>
      {reading && <CardReader name={item.name} where={`Card Browser · ${source.name}`} byline={by} picture={pic} tags={tags}
        actions={mainActions} greetings={greetings} greetingLabel="First Message" renderText={(t) => <Linked text={t} />}
        sections={[
          { id: "notes", title: "Creator's Notes", text: full?.creatorNotes || (d === "failed" ? item.tagline : "") },
          { id: "description", title: "Description", text: full?.description ?? "" },
          { id: "scenario", title: "Scenario", text: full?.scenario ?? "", prose: true },
          { id: "personality", title: "Personality", text: full?.personality ?? "" },
          { id: "examples", title: "Example Dialogue", text: full?.exampleDialogue ?? "" },
          { id: "system", title: "System Prompt", text: full?.systemPrompt ?? "" },
          { id: "post", title: "Post-History Instructions", text: full?.postHistory ?? "" },
        ]}
        extra={d === null ? <p className="hint">Loading…</p> : undefined}
        onBack={() => setReading(false)} onClose={() => { setReading(false); onCloseSheet(); }} onPrev={onPrev} onNext={onNext} />}
      <div className="vs-head">
        <div className="vs-title"><h2>{item.name}</h2><span className="hint">{by}</span></div>
      </div>
      {badges.length > 0 && <div className="vs-tags cb-badges">{badges.map((b) => <span key={b} className="gallery-tag big">{b}</span>)}</div>}

      {justAdded && <p className="hint cb-in" data-testid="cb-in">In your Characters · <a href="#" onClick={(e) => { e.preventDefault(); onOpenCharacter(justAdded); }}>Open</a></p>}
      {!mine && (!full?.hidden || full.canExtract) && (
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
          {full?.canExtract && <TriggerOptions value={trigger} disabled={working !== null}
            onChange={(next) => { const { extra, ...rest } = next; setExtraText(extra); setPrefs((x) => ({ ...x, janitorTrigger: rest })); }} />}
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

function SourcePicker({ sourceId, name, open, onToggle, onPick, onClose }: { sourceId: BrowseSourceId; name: string; open: boolean; onToggle: () => void; onPick: (id: BrowseSourceId) => void; onClose: () => void }) {
  return (
    <Pop open={open} onClose={onClose} button={
      <Button data-testid="cb-source" aria-haspopup="menu" aria-expanded={open} onClick={onToggle}><Icon name="globe" size={14} /> {name} <span className="cb-caret"><Icon name="chevron" size={11} /></span></Button>}>
      <div role="menu" className="cb-sources">
        {SOURCE_OPTIONS.map((s) => (
          <button key={s.id} type="button" role="menuitemradio" aria-checked={s.id === sourceId} className={`cb-source${s.id === sourceId ? " on" : ""}`} onClick={() => onPick(s.id)}>
            <span className="cb-source-check">{s.id === sourceId && <Icon name="check" size={13} />}</span>
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

/** What the extraction sends to make a hidden card's closed lorebook fire (D-100, Glaze's trigger choices). Folded: the
 *  defaults (card, catalog page, scenario) fit most cards; the extra text reaches a world lorebook the card never names. */
const TRIGGER_PARTS: Array<[keyof Omit<TriggerChoice, "extra">, string]> = [["card", "Card"], ["catalog", "Catalog Page"], ["scenario", "Scenario"], ["greetings", "Greetings"], ["lorebooks", "Lorebook Descriptions"]];
function TriggerOptions({ value, onChange, disabled }: { value: TriggerChoice; onChange: (v: TriggerChoice) => void; disabled: boolean }) {
  const chosen = TRIGGER_PARTS.filter(([k]) => value[k]).map(([, l]) => l);
  if (value.extra.trim()) chosen.push("Extra Text");
  return <details className="cb-trigger" data-testid="cb-trigger">
    <summary><span className="field-label">Lorebook Trigger</span><span className="hint">{chosen.join(", ") || "Nothing (sends a dot)"}</span></summary>
    <p className="hint">What the extraction writes in the chat so JanitorAI fires the closed lorebook's entries. More names and places fire more entries.</p>
    <div className="cb-trigger-grid">
      {TRIGGER_PARTS.map(([k, label]) => <label key={k} className="row-line"><span>{label}</span>
        <Switch label={label} disabled={disabled} checked={value[k]} onChange={(v) => onChange({ ...value, [k]: v })} /></label>)}
    </div>
    <textarea aria-label="Extra Text" data-testid="cb-trigger-extra" rows={3} disabled={disabled} value={value.extra} placeholder="Extra Text: names, places or factions from the card's world"
      onChange={(e) => onChange({ ...value, extra: e.target.value })} />
  </details>;
}

/** "2026-10-03T…" → "3 Oct 2026" in the reader's locale. */
function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

