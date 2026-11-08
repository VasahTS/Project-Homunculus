# Card Browser — technical plan

Author: CLAUDE, 2026-11-02. Status: **built** on `ui` (T-007 by CODEX; T-008 … T-012 by Claude the same night, at Daniel's request). The screen's behaviour is in `docs/UI-PLAN.md` → "Card Browser" (waits for Daniel's OK);
the work is split into CODEX cards T-007 … T-013 in `docs/CODEX-TASKS.md`, in this order: T-007 native request → T-008 package + ChubAI → T-009 import path → T-010 the screen, finished (usable with ChubAI from here) → T-011 Wyvern, Pygmalion, DataCat → T-012 JannyAI. T-013 JanitorAI (sign-in window) was built on 2026-11-08 (D-098). Claude reviews each card's diff. BLUEPRINT §8 (`card-browser` module), §10 slice 9.

**What it is:** find character cards on public sites (ChubAI, JannyAI, Wyvern, Pygmalion, DataCat), read them, and add them to
Characters in one click — without downloading a file and importing it by hand. v1 had it (`classic-card-browser.js`); Marinara too
(`bot-browser*`). We port the **site knowledge** (addresses, query parameters, field mapping, refusals); the screen is ours.

## 1. Shape

```
UI (apps/desktop/src/ui/CardBrowser.tsx)          ← T-010, looks like the Characters page
  │  uses
packages/card-browser  (pure TypeScript, module "card-browser")   ← T-008 (Chub), T-011, T-012
  │  sources/{chub,janny,wyvern,pygmalion,datacat}.ts · pauses.ts · build.ts · types.ts
  │  talks through an injected SiteTransport
apps/desktop/src/cardSites.ts  (desktop transport + test fake)    ← T-007
  │  invoke("card_site_request")
apps/desktop/src-tauri/src/lib.rs  card_site_request              ← T-007 (Rust, small, D-003)
```

Import goes through the **same path as "Import" files** (T-009): one shared function, so embedded lorebooks, linked books,
warnings and notices behave exactly as today (`App.tsx` `importFiles`, D-027/D-028).

## 2. Native request (T-007)

One Tauri command, `card_site_request`, next to `web_get` (D-067), reusing its public-address resolver, crypto setup and
`Retry-After` parser. Why not `web_get`: it is GET-only, sends no headers and returns text; the sites need POST + a few headers
(JannyAI search, DataCat session) and the cards/pictures are bytes.

- **Input:** `{ url, method: "GET" | "POST", headers?: {name: value}, body?: string, expect: "json" | "text" | "image" | "card" }`.
- **Hosts:** `https` only, port 443, and only these hosts (constant in Rust; `*.` = any subdomain):
  `api.chub.ai`, `avatars.charhub.io`, `*.charhub.io`, `*.chub.ai`, `jannyai.com`, `api.jannyai.com`, `search.jannyai.com`,
  `image.jannyai.com`, `api.wyvern.chat`, `*.wyvern.chat`, `imagedelivery.net`, `*.imagedelivery.net`, `server.pygmalion.chat`,
  `pygmalion.chat`, `*.pygmalion.chat`, `datacat.run`, `media.datacat.run`, `ella.janitorai.com`.
  Exception, `expect: "card"` only: any **public** https host (JannyAI's download link points at its file storage, v1
  `jannyCardFile`), and the answer must be a PNG carrying a `chara` or `ccv3` text chunk — checked in Rust before returning.
- **Headers allowed in:** `Accept`, `Content-Type`, `Authorization`, `Origin`, `Referer`, `Cache-Control`, `X-Session-Token`,
  `x-meilisearch-client`. Anything else = refused (programming error). Same browser user agent as `web_get`.
- **Redirects:** followed up to 5 times when the new host is also allowed (or public, for `card`); each hop is re-checked.
- **Caps and time:** json/text 8 MB, image 15 MB, card 64 MB (v1's values); 30 s, 60 s for `card`.
- **Images:** the bytes must start like PNG, JPEG, WebP or GIF; otherwise an error. Returned as base64 + mime.
- **Output:** `{ status, finalUrl, contentType, retryAfterSecs?, cfMitigated: bool, text?, base64?, mime? }`. Non-2xx answers are
  returned (not thrown), so TypeScript can tell a rate limit from a Cloudflare page (`pauses.ts`).
- **Browser preview / click tests:** `globalThis.__h2FakeCardSites` (same pattern as `__h2FakeWeb`); without it the preview says
  "The Card Browser works in the desktop app."

## 3. The package (T-008, T-011, T-012)

```ts
interface CardSource {
  id: "chub" | "janny" | "wyvern" | "pygmalion" | "datacat";
  name: string;              // "ChubAI"
  site: string;              // "https://chub.ai"
  sorts: { id: string; label: string }[]; defaultSort: string;
  nsfw: "toggle" | "always" | "never";
  pageSize: number;
  filters: ("must" | "direction" | "tokens" | "lowQuality")[];
  mustHave?: ("lorebook" | "greetings" | "gallery" | "expressions")[];
  tags(t: SiteTransport): Promise<string[]>;               // suggested tags (static list or loaded once, cached 1 h)
  search(q: CardQuery, t: SiteTransport): Promise<CardPage>;
  details(item: CardItem, t: SiteTransport): Promise<CardDetails>;
  download(item: CardItem, t: SiteTransport): Promise<CardFile>;
}
interface CardQuery { text: string; sort: string; page: number; nsfw: boolean; include: string[]; exclude: string[];
  filters: { must: string[]; ascending: boolean; minTokens?: number; maxTokens?: number; lowQuality: boolean } }
interface CardPage { items: CardItem[]; total: number | null; hasMore: boolean }
interface CardItem { source: string; id: string; name: string; creator: string; tagline: string; tags: string[];
  thumb: string;  /* a URL the transport can fetch with expect "image" */  nsfw: boolean; url: string;
  stats: { downloads?: number; chats?: number; tokens?: number; likes?: number } }
interface CardDetails { description: string; personality: string; scenario: string; firstMessage: string;
  alternateGreetings: string[]; exampleDialogue: string; creatorNotes: string; systemPrompt: string; postHistory: string;
  hasLorebook: boolean; tags: string[] }
type CardFile = { kind: "png"; bytes: Uint8Array } | { kind: "json"; card: object; avatar?: { mime: string; bytes: Uint8Array } }
```

- **`pauses.ts`** — port of v1 "Site pauses" (`src/endpoints/classic-card-browser.js` L60–L126 at 0884338a): 429 = the whole site
  pauses (Retry-After, else 10 min); Cloudflare page / `cf-mitigated` = that part pauses 5 min; a human check (`"turnstile"`)
  = 30 min. While paused, no request leaves; the error carries `{ kind, retryInMs, message }` with v1's sentences
  (`blockMessage`). In memory only (a restart clears it).
- **`build.ts`** — port of v1 `buildCard` (L288–L313): loose definition → Character Card V2 object. The app imports it with
  `importCardJson`; the picture is imported separately (no Jimp: the app already converts pictures to PNG avatars).
- **Text is data.** Every string from a site is shown as plain text by the UI (never HTML) and never sent to the AI until the
  card is imported. `creatorNotes` is HTML on Chub: `build.ts`/the sources strip tags for display (`plain()` as in v1).
- **Thumbnails:** fetched through the transport (`expect: "image"`) and shown as `data:` URLs; an in-memory cache of the last
  300; at most 4 at a time; only cards on screen load (IntersectionObserver).

### Sources (all from v1 at 0884338a; Marinara e5ead06 for comparison)

| Source | Card | Search / details / file | Sorts (default first) | NSFW | Notes |
|---|---|---|---|---|---|
| **ChubAI** | T-008 | v1 server `chub*` L338–L414, client `SOURCES.chub` L202–L262 | v1 `CHUB_SORTS` (Most Downloaded …) | toggle (off) | Card file: `avatars.charhub.io/avatars/<path>/chara_card_v2.png`; when it has no card inside, build one from `definition` (v1 `chubCard`). Filters: must have, direction, tokens. |
| **Wyvern** | T-011 | server L668–L726, client `SOURCES.wyvern` | Popular, Popular NSFW, Recommended, New, Most Likes, Most Messages | toggle | Built card + `imagedelivery.net` picture (`wyvernAvatarUrl`). |
| **Pygmalion** | T-011 | server L871–L930, client `SOURCES.pygmalion` | Downloads, Stars, Views, Newest, Tokens, Name | never | No login (v1 keeps it out; Marinara's token login is **not** ported). |
| **DataCat** (added 11/02 at Daniel's request, D-081) | T-011b | server L728–L869, client `SOURCES.datacat` | Relevance, Fresh (Last 24h) | always | Session token (`/api/liberator/identify`, new one on 401); tags loaded once (32 MB cap, 1 h cache). |
| **JannyAI** | T-012 | server L416–L666, client `SOURCES.janny` | Newest, Oldest, Most Tokens, Fewest Tokens, Relevance | toggle (off) | Meilisearch key read from the site's page bundle (fallback key in v1), details from the page's `astro-island` props, card via `api.jannyai.com/api/v1/download` → file link (`expect: "card"`). Often behind Cloudflare → the pause message offers "Open on JannyAI" and "Import a Downloaded File…". The Node/Bun trick in v1 does not apply. |

Left out on purpose: CharacterTavern (no API; Marinara shows a notice), PlotLight (new in Marinara, not in v1 — later if Daniel
wants it), Pygmalion login, card "galleries"/expressions download.

**DataCat (checked live on 2026-11-02):** its characters are JanitorAI cards whose hidden definitions were extracted
(`llm_request_payload`, `intercepted_chat_data`, `extraction_session_id`, "recovered" badges). Left out at first for the reason §7
gives; Daniel then chose to add it. It is adult only (asked once), pages are 50 (the site's cap), tags come from
`/api/tags/faceted?limit=200` (ids for the search), and a card whose creator turned downloads off (`downloadsDisabled`,
`deletedByCreatorPolicy`) is not added. The ready-made `/download` (often a human check) is not used: the card is built from the
character page, as v1's fallback does.

**What changed while building:** the grid shows tokens like Characters (downloads stay in the sheet); clicking a card does not
close the sheet; in a window under 1000 px the sheet comes over the grid from the right with a Close button (on Characters it sits
under every card, which with 48+ results is far away). Chub and JannyAI refuse the cloud test machine (Cloudflare), so their
fixtures follow v1's shapes; Wyvern and Pygmalion fixtures were recorded live.

## 4. Import and "already in your Characters" (T-009)

- **One function** `importCharacterFile(svc, bytes, fileName, opts?)` in `apps/desktop/src/importCharacters.ts`, extracted from
  `App.tsx` `importFiles` with no behaviour change for files. `opts = { source?, folderId?, tags? }`.
- **Schema (allowed in T-009 only):** `Character.source?: { site: string; id: string; url: string; addedAt: number }` — optional,
  stored in the JSON blob, **no migration**, kept by every version, not written into exported cards.
- **Already added:** a map `site:id → character id` built from the characters list (`source`). Grid and sheet use it.
- **From a site:** `CardFile.png` → the same path as a PNG file. `CardFile.json` → `importCardJson` bytes + the picture turned
  into a PNG avatar (the canvas helper behind `imageFileToPngAvatar`, given a Blob).
- **Tags from the site:** `importTags: boolean` (Daniel: a choice to import them or not; default on) — applied before saving.
- **Folder:** default a Characters folder named **From the Web**, created the first time it is needed (found again by name, so
  renaming it makes a new one next time — acceptable); or any folder the user picks, or none. Existing folder functions (D-036/D-068),
  in the same step.
- **Save as PNG** (no import): build the character with `parseCard`, `exportCardPng(character, pngAvatar)`, `saveExport`.
- The notice is the existing import notice (lorebook adopted, warnings), title "Added <name> to Characters".

## 5. Remembered state

- While the app is open (module-level store, like Marinara): source, search text, sort, tags, filters, the loaded results,
  the selected card and the scroll position. Leaving and coming back shows the same place.
- Between runs (browser storage `h2.cardBrowser`, try/catch, a per-viewer convenience like `h2.collectionPrefs` in D-068):
  last source, sort per source, NSFW per source, card size, folder for new cards, tags choice, "DataCat warning seen".
  **No `appSettings` key, no table.**

## 6. Tests

- **Rust** (`lib.rs` tests): host allowlist incl. wildcards and look-alikes (`chub.ai.evil.com`), https-only, header allowlist,
  `card` requires a PNG with `chara`/`ccv3`, image magic bytes, size caps.
- **Unit** (`packages/card-browser/test`): per source, the request it builds for a query (URL, method, body) and the mapping of a
  recorded answer (fixtures in `test/fixtures/<source>-*.json`, trimmed to 2–3 items, **text only**, no adult pictures);
  `pauses.ts` timings and messages; `build.ts` against v1's output for the same input.
- **Click tests** `e2e/card-browser.e2e.ts` with `__h2FakeCardSites`: open from Characters, search, Load More, tags include/exclude,
  select → sheet → Add → appears in Characters with the ✓ mark, Add again is a copy, Save as PNG, a paused site, empty results,
  DataCat warning, preview without desktop.
- **Live check** (CODEX on Daniel's PC, desktop app): one search + one import per source; write what worked in the report. Sites
  change without warning; a failing source must fail with its message, never break the screen.

## 7. JanitorAI (T-013) — from Glaze · ✅ built 2026-11-08 (D-098); the notes below are the plan it followed

Reference: Glaze (github.com/hydall/Glaze, Flutter, AGPL-3.0) at f1fe39e, `lib/features/catalog/services/`:
`janitor_webview_proxy.dart` (2,047 lines), `janitor_provider.dart`, `janitor_public_lorebook.dart`, `janitor_session.dart`;
Glaze in turn credits SillyTavern-CharacterLibrary.

**How Glaze does it.** JanitorAI's API (`janitorai.com/hampter/...`) is behind Cloudflare, and Cloudflare ties its clearance cookie
to the browser that solved the check — a request from Rust/Dart with the same cookie still gets 403. So Glaze keeps a **hidden
WebView on janitorai.com** and runs `fetch()` *inside the page*; the account token is read from the page's Supabase cookies
(`sb-<ref>-auth-token`, chunked, `base64-` JSON). Search: `GET /hampter/characters?...`; one card: `GET /hampter/characters/{id}`;
public lorebooks: `GET /hampter/script/{id}`; pictures from `ella.janitorai.com/bot-avatars/`. A card's fields are only there when
`showdefinition == true` (`janitorDefinitionPublic`).

**What we take:** the hidden-WebView idea, the endpoints, the field mapping (`_convertToGlaze`, greetings normalisation, tag ids),
public lorebooks, the "signed in / signed out / Cloudflare" states.

**As built (D-098):** it reuses BotBooru's account-window shape (`botbooru.rs`, CODEX) rather than a nonce map: `janitor.rs` / `janitor.js`,
`janitor_window` (Sign In… / show), `janitor_request` (fixed GET paths only), `janitor_report`; sign-in is optional; All Sites skips it.

**In Tauri (plan):** a second webview window labelled `janitor` on `https://janitorai.com` (shown for sign-in, hidden otherwise). The app
asks it to run a fixed request script with `eval`; the script posts its answer back through **one** command,
`janitor_report({ nonce, status, body })`, the only command that capability grants to the remote origin `https://janitorai.com`
(Tauri `remote.urls`). Rust keeps a map nonce → waiting request (random nonce per request, 30 s timeout, 8 MB cap); anything
without a known nonce is dropped. The window's cookies live in the app's own webview profile, never read by the app except the
token inside the page script. Spike first: if Tauri cannot do this cleanly on Windows **and** Linux (WebKitGTK), stop and report.

**Hidden definitions — taken after all (D-099, Daniel 2026-11-08):** `janitor-extract.ts` / `janitor-prompt.ts`, see D-099 for
what was ported and what was not. The paragraph below is the original reasoning (D-081), kept for the record.

**What we do not take — hidden definitions (D-081, reversed by D-099).** Glaze's main JanitorAI feature (`janitor_extractor.dart`) recovers cards whose
creator chose to **hide** the definition and closed lorebooks: it adds a dummy proxy preset to the user's JanitorAI account,
opens a chat with the character, types messages into the page by simulated clicks, captures the assembled prompt that JanitorAI
sends to the "proxy", and has an AI rebuild the lorebook from it. Left out: it goes around a protection the creator set on
purpose (and JanitorAI's terms), it changes the user's account (presets, chats) and can get it banned, it needs AI calls per card,
and it is the most fragile code in Glaze (DOM selectors, a July 2026 API move already broke it once). Claude's recommendation;
Daniel can reopen it as its own decision.

## 8. Credits

`CREDITS.md`: Glaze (hydall/Glaze f1fe39e, AGPL-3.0) for JanitorAI (T-013). Homunculus v1 `public/scripts/classic-card-browser.js` and `src/endpoints/classic-card-browser.js` (VasahTS/Homunculus
0884338a), itself following Marinara Engine's bot browser (Pasta-Devs/Marinara-Engine e5ead06, AGPL-3.0).
