// Card Browser — the shapes every card site is turned into (docs/CARD-BROWSER.md §3). CLAUDE, 2026-11-02 (T-008).
// The package never calls fetch: everything goes through an injected SiteTransport (the desktop app's card_site_request).

export interface SiteRequest {
  url: string;
  method: "GET" | "POST";
  headers?: Record<string, string>;
  body?: string;
  expect: "json" | "text" | "image" | "card";
}
export interface SiteResponse {
  status: number;
  finalUrl: string;
  contentType: string;
  retryAfterSecs?: number;
  cfMitigated: boolean;
  text?: string;
  bytes?: Uint8Array;
  mime?: string;
}
export interface BotbooruAccountState { username: string | null; showNsfw: boolean; showNsfl: boolean }
/** JanitorAI's own window: who is signed in there (null = browsing as a guest). D-098. */
export interface JanitorAccountState { username: string | null }
export interface SiteTransport {
  request(input: SiteRequest): Promise<SiteResponse>;
  decodeCard?(bytes: Uint8Array): Record<string, unknown>;
  botbooruAccount?(action: "status" | "open" | "logout"): Promise<BotbooruAccountState>;
  /** "open" shows its sign-in page, "show" the window as it is (for its browser check). */
  janitorAccount?(action: "status" | "open" | "show" | "logout"): Promise<JanitorAccountState>;
  /** JanitorAI's window for an extraction (D-099): the account calls it may make and the steps on its chat page. */
  janitor?: JanitorBridge;
}

export type JanitorPageOp = "open-chat" | "reload" | "composer" | "send" | "alpha" | "reset" | "show" | "hide";
export interface JanitorBridge {
  call(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<{ status: number; text: string }>;
  page(op: JanitorPageOp, text?: string): Promise<{ status: number; text: string }>;
}
export type SourceId = "chub" | "janny" | "wyvern" | "pygmalion" | "datacat" | "botbooru" | "janitor";
export type MustHave = "lorebook" | "greetings" | "gallery" | "expressions";

export interface CardFilters { must: MustHave[]; ascending: boolean; minTokens?: number; maxTokens?: number; lowQuality: boolean }
export interface CardQuery { text: string; sort: string; page: number; nsfw: boolean; include: string[]; exclude: string[]; filters: CardFilters }
export const NO_FILTERS: CardFilters = { must: [], ascending: false, lowQuality: false };

export interface CardStats { downloads?: number; chats?: number; tokens?: number; likes?: number; views?: number; stars?: number }
export interface CardItem {
  source: SourceId;
  id: string;
  name: string;
  creator: string;
  tagline: string;
  tags: string[];
  /** A picture address the transport can fetch with expect "image"; "" = none. */
  thumb: string;
  /** The full-size picture for the details sheet, when the site has a bigger one than `thumb`. CLAUDE, 2026-11-03. */
  image?: string;
  nsfw: boolean;
  nsfl?: boolean;
  /** The card's page on the site. */
  url: string;
  stats: CardStats;
}
export interface CardPage { items: CardItem[]; total: number | null; hasMore: boolean }
export interface CardDetails {
  description: string;
  personality: string;
  scenario: string;
  firstMessage: string;
  alternateGreetings: string[];
  exampleDialogue: string;
  creatorNotes: string;
  systemPrompt: string;
  postHistory: string;
  hasLorebook: boolean;
  tags: string[];
  /** Only the basics came back (the site refused the full details). */
  partial?: boolean;
  /** Why this card can't be added (e.g. the creator hides its definition); the sheet shows it and turns Add off. */
  hidden?: string;
  /** The hidden card can be read through the person's account (source.extract, D-099). */
  canExtract?: boolean;
}
/** A ready card PNG, or a V2 card object built from the site's fields plus its picture. */
export type CardFile =
  | { kind: "png"; bytes: Uint8Array }
  | { kind: "json"; card: Record<string, unknown>; avatar?: { mime: string; bytes: Uint8Array } };

export interface CardSource {
  id: SourceId;
  name: string;
  /** The site's home page (for "Open <name>"). */
  site: string;
  sorts: { id: string; label: string }[];
  defaultSort: string;
  /** toggle = the NSFW switch works; never = safe cards only; always = adult cards only. */
  nsfw: "toggle" | "never" | "always";
  /** Why the switch is off, when it is not a toggle. */
  nsfwNote?: string;
  pageSize: number;
  mustHave: MustHave[];
  ascending: boolean;
  tokens: boolean;
  lowQuality: boolean;
  /** Left out of All Sites (it needs its own window first). */
  separate?: boolean;
  /** Tags to suggest before any search. */
  suggestedTags: string[];
  /** Tags the site lists itself (loaded once); used when there are no suggested ones. */
  loadTags?(t: SiteTransport): Promise<string[]>;
  search(q: CardQuery, t: SiteTransport): Promise<CardPage>;
  details(item: CardItem, t: SiteTransport): Promise<CardDetails>;
  download(item: CardItem, t: SiteTransport): Promise<CardFile>;
  /** Cards the site hides (JanitorAI, D-099): read through the person's own account. */
  extract?(item: CardItem, t: SiteTransport, opts: ExtractOptions): Promise<{ file: CardFile; closedEntries: number; loreNote: string }>;
}
/** What goes into the message that makes a hidden card's closed lorebook fire (Glaze `JanitorTriggerContext`, D-100). */
export interface TriggerChoice {
  /** The card recovered by the "." probe. */
  card: boolean;
  /** Name, tags, catalog description, scenario and the attached lorebooks' titles. */
  catalog: boolean;
  scenario: boolean;
  greetings: boolean;
  /** Titles and descriptions of the lorebooks attached to the card. */
  lorebooks: boolean;
  /** Free text: the only way to fire entries of a world lorebook the card never names. */
  extra: string;
}
export const DEFAULT_TRIGGER: TriggerChoice = { card: true, catalog: true, scenario: true, greetings: false, lorebooks: false, extra: "" };
export interface ExtractOptions {
  onPhase?: (phase: string) => void;
  /** Defaults to DEFAULT_TRIGGER. */
  trigger?: TriggerChoice;
  /** One call to the person's AI connection (rebuilds the closed lorebook). */
  complete?: (messages: Array<{ role: "system" | "user"; content: string }>) => Promise<string>;
  sleep?: (ms: number) => Promise<void>;
  limits?: { composer?: number; card?: number; lore?: number };
}
