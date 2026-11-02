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
export interface SiteTransport { request(input: SiteRequest): Promise<SiteResponse> }

export type SourceId = "chub" | "janny" | "wyvern" | "pygmalion" | "datacat";
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
  nsfw: boolean;
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
  /** Tags to suggest before any search. */
  suggestedTags: string[];
  /** Tags the site lists itself (loaded once); used when there are no suggested ones. */
  loadTags?(t: SiteTransport): Promise<string[]>;
  search(q: CardQuery, t: SiteTransport): Promise<CardPage>;
  details(item: CardItem, t: SiteTransport): Promise<CardDetails>;
  download(item: CardItem, t: SiteTransport): Promise<CardFile>;
}
