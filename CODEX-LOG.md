# Work log — CODEX

(Translated to English by CLAUDE on 2026-10-29, D-038: everything in the repository is in English. Content unchanged.)

## 2026-10-29 · Round 2: Apple Design, navigation and motion

Author: **CODEX**. State: local / unpublished, no commit or push. Daniel's request: more drafts with apple-design, frontend-design, design-taste-frontend and animate, focused on the menu experience.

New files in `docs/drafts/homepage-motion/`: `CODEX-PLAN.md`, `README.md`, `index.html`, `styles.css`, `app.js`, `build.mjs`, `verify.mjs`, `home-motion-drafts.html`, `validation.json`; Literata fonts and license and four SVGs in `assets/`; screenshots in `previews/`. CODEX SVGs reused from round 1, noted in the files; the font's original copyright preserved. No pre-existing CLAUDE work was attributed to CODEX. The previous round preserved.

Three drafts: D Atelier (gallery and cover transition), E Lantern (reading and discreet navigation), F Workspace (list and preview). Native popovers and dialog, immediate shortcuts, temporary changes with undo, keyboard and accessibility variants. The taste landing-page workflow was adapted to the explicit request for Apple Design in an app; the reasoning is in the plan.

Validation: `node --check docs/drafts/homepage-motion/app.js`; the Playwright/Chrome verifier passed for the separate sources and for the final portable HTML. 18 layout/color combinations per run, extra states, no overflow/broken images/JavaScript errors. Minimum contrast of the solid semantic pairs: 4.76:1. Checked focus/arrows/Escape, shortcuts without animation, create and Undo, pin and Undo, split view/tabs/filter, cover transition/cancellation, reduced motion, reduced transparency and increased contrast. Resting and mid-transition screenshots inspected. FPS and native Tauri behavior not measured. No database, personal installation, API or credential accessed; no app screen was implemented. Signed: **CODEX**.

## 2026-10-29 · Homunculus 2 HomePage drafts

Author: **CODEX**. State: local / unpublished, no commit or push.

Request: look at the project and suggest an HTML with alternatives for the app's start screen, confirmed by Daniel.

New files: `docs/drafts/homepage/index.html`, `styles.css`, `app.js`, `README.md`, `verify.mjs` (isolated verification), `serve.mjs` (loopback preview); local Literata font resources and their license in `assets/`; screenshots in `previews/`; this log. Three proposals independent from the current app: A Resume, B Library, C Refuge. The data is fictional; there was no access to the personal installation, the app's database or credentials. Fonts copied from dependencies already present; Literata's original authorship preserved in the license. No pre-existing CLAUDE work was attributed to CODEX.

Additional delivery file: `docs/drafts/homepage/home-drafts.html`, a single version that embeds the CSS, JavaScript, fonts and illustrations of the separate sources.

Validation: `node --check docs/drafts/homepage/app.js` and `node docs/drafts/homepage/verify.mjs` passed, for both `index.html` and `home-drafts.html`. Playwright + Chrome in an isolated context: 45 combinations per file (3 proposals, 3 widths, 5 states), no horizontal overflow or console/JavaScript errors; checked search, filter, Story/chat, resume, create/import and simulated navigation actions, error recovery, narrow sidebar and reduced motion. Visual inspection of the desktop A/B/C screenshots and narrow A. App tests not run: no application code was changed. The HTTP preview was not reachable in the built-in browser; server stopped, delivery through the local HTML. Signed: **CODEX**.
