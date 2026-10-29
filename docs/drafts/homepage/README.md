# HomePage — composition studies

Author: **CODEX** · 10/29/2026. Local work, unpublished. A prototype separate from the app; no commit or push. (Translated to English by CLAUDE, D-038.)

**File to review: `home-drafts.html`** — a single HTML with embedded styles, scripts, illustrations and fonts. Open it directly in the browser; it can be copied on its own. No need to install, start Tauri or set up a connection. `index.html`, `styles.css` and `app.js` are the separate sources of the same version. Alternative: `node docs/drafts/homepage/serve.mjs` at the project root starts a local server at `http://127.0.0.1:4492`. The top bar belongs to the review; the proposed interface is in English, like the app. Literata's license in `assets/`.

## Reading the project

References read: `README.md`, the handoff notes (now `HANDOFF.md`), `docs/BLUEPRINT.md`, `docs/UI-PLAN.md`, `docs/ARCHITECTURE.md`, `apps/desktop/src/App.tsx`, `ui/Sidebar.tsx`, `ui/kit.tsx`, `ui/Vault.tsx` and `theme/`.

Homunculus 2 is a Tauri/React app, with Graphite, a discreet green, Literata and Library/Vault/Stories/Chats navigation. Today the state with no open session only offers "No session open". The blueprint already reserves a Home for the UI phase. The proposals do not change the screens Daniel approved nor attribute CLAUDE's pre-existing work to CODEX.

## Panel plan

- Purpose: resume a chat, open a Story or start something new. Looked at when opening the app without an active conversation or when going back Home.
- Primary: the exact Story and chat that will be resumed, with the last excerpt; a Continue action. The Story is still the template for several chats.
- Secondary: the other Stories, 1:1 chats and ways to Library/Vault. Opening the Story shows its chats; Continue opens a specific chat.
- On demand: creation, character picking, import and settings. Setup and trackers stay on the existing screens.
- States in the prototype: first use, normal use, a full library with 12 Stories and long titles, loading, error with recovery and search without results. Search filters the example Stories by title, excerpt and mode.
- Simulated actions: switch proposals/states, search, filter the library, open the Story, pick a chat, continue, start a Story/chat, import and shortcuts. The dialogs explain the destination; they do not implement editors or AI generation.
- Inherited from the project: the Sidebar hierarchy, the Story/chat distinction and the Literata/green identity. The new Home entry and its compositions are proposals. A/B keep a dark family; C explores paper and green. They are alternative layouts, not installed profiles.
- Questions for the next review: which hierarchy favors daily use; whether Home should always open or only without an active chat; whether the light direction C should exist as an optional profile.

## The three proposals

**A · Resume (initial recommendation):** the last chat takes the highlight, with Story, chat name, branch and excerpt. The other Stories in a list and creation actions beside it. Little conceptual change from the current app.

**B · Library:** illustrated covers and a shelf of Stories; opening the Story and continuing a chat are separate actions. Better for recognizing worlds by image and switching between several stories. Filters All / In progress / Not started.

**C · Refuge:** an editorial composition, paper and green; fewer elements, a resume list and discreet creation. Uses more space for reading and introduces an optional light direction.

## Data and limits

All names, numbers and excerpts are fictional, marked as such in the review bar. No personal database, chat, character or credential was accessed. The vector illustrations are original to this prototype (CODEX); character initials replace portraits that were not provided. They are denser examples than the app's offline mode, but do not replace future validation with data Daniel authorizes.

The current request authorizes HTML drafts. Integration into React depends on Daniel's choice/review. The local rule of planning the hierarchy was applied in this document; no screen was implemented in the app.

## Validation

`node docs/drafts/homepage/verify.mjs`: **PASS**, using Playwright with installed Chrome in an isolated context, without a personal profile. The same check also passed with `HOME_DRAFT_FILE=home-drafts.html`, confirming the delivered single file.

- 45 combinations: three proposals × widths of 1440, 900 and 390 px × five states. No horizontal overflow in the document or main content.
- No JavaScript or console errors. Font loaded from the prototype itself.
- Checked: resume chat, open Story and pick a chat, positive/no-result search, filter of not-started Stories, library with 12 Stories, error recovery, create/import/navigation dialogs, narrow sidebar and respect for reduced motion.
- Screenshots in `previews/`: three proposals at three widths, first use on desktop and B with a full library. Visual inspection of A/B/C on desktop and narrow A; titles and excerpts wrap without truncating the main content.
- Validation limited to the HTML prototype. The React/Tauri app and its tests were not changed or run.
- The built-in browser did not reach the loopback HTTP preview in this environment; the review server was stopped. Delivery uses the HTML opened directly from disk, validated in Chrome.

Authorship of the notes, illustrations and new files: **CODEX**.
