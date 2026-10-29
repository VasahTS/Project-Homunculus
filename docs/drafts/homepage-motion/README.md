# Homunculus — Home and menus, round 2

Author: **CODEX**, 10/29/2026. Local / unpublished. No commit, push or change to the app's code. (Translated to English by CLAUDE, D-038.)

## Open and try

Open **`home-motion-drafts.html` directly in Chrome or Edge**. It is a single offline file, with fonts, scripts, illustrations and Literata's license embedded. The separate sources are `index.html`, `styles.css` and `app.js`. To repackage: `node docs/drafts/homepage-motion/build.mjs`.

The D/E/F tabs are in the review bar, outside the product:

- **D · Atelier:** gallery; a cover follows the entry into the Story page and back Home.
- **E · Lantern:** reading first; discreet navigation and menus close to the action.
- **F · Workspace:** selection and preview without leaving the list; Chats and Setup live in the details panel.

Try the toolbar's **+**, a **cover's menu**, **opening a Story and going back**, **Ctrl/Cmd+K**, creating a temporary Story and **Undo**. In F, select Stories and switch **Chats / Setup**. In the review bar, try the full library, first use and reduced motion. Light/dark follows the browser/system preference.

Everything uses fictional data. Creating, duplicating, pin/unpin, adding a chat or writing a message only affects the prototype's temporary memory. Import only picks a file's name, without reading its content. Reloading resets the examples. No database, personal installation, API or credential was accessed.

## What guided this round

**Apple Design:** familiar sidebar and toolbar, opaque content surfaces, discreet materials only in navigation and menus, one dialog per task, focus and keyboard. The app is Tauri/Windows; this CSS prototype does not implement Apple's native materials nor imitate macOS window controls.

**frontend-design:** Literata in narrative titles, the system font in controls, the Story → several chats hierarchy as the organizing principle. The difference between drafts is in the navigation flow, beyond the composition.

**animate:** brief feedback, a readable spatial origin and a symmetric exit; shortcuts and search without animation. The project's easing tokens were reused. Press 120 ms, selection 160 ms, menu 180 ms, cover 240 ms, sheet 280 ms and exit 200 ms. The cover uses clipping and uniform scale to preserve the illustration.

**design-taste-frontend:** composition, identity, screenshot critique and reduction of accessories. Its landing-page workflow was adapted to an app's scope: no direction lottery, eight-animation floor, mandatory video or ban on sidebar/glass. The reasons and Apple references are in the [plan](CODEX-PLAN.md).

The cover SVGs are CODEX illustrations reused from the first round. No external photographs, new dependencies or image generation in this round. The Literata fonts keep their original license in `assets/Literata-LICENSE.txt` and in the portable HTML.

## Verification and limits

`node docs/drafts/homepage-motion/verify.mjs`: passed with the separate sources. The final portable version passed with `HOME_MOTION_FILE=home-motion-drafts.html`.

- 18 layout combinations: D/E/F × 1440/900/390 px × light/dark. Extra states: full, first use, loading, error with recovery and search without results. No horizontal overflow or broken images.
- Contrast of the semantic text/surface pairs: minimum **4.76:1**. Computed with the real hex values of the solid surfaces; it is not an audit of every composited pixel over translucency/images.
- Native menu: arrows, Escape, focus return and immediate keyboard opening. Keyboard sheet and Ctrl+K search also immediate.
- Cover open/back: frames measured with a 240 ms duration; mid-transition screenshot inspected. Another navigation cancels the transition and cleans up the clones. No width/height/margin/top/left animation.
- Temporary creation and undo, pin/unpin and undo; split view with arrows, filter, tabs and back at the compact width.
- System and review-bar reduced motion: only opacity in content transitions, no cover travel. Reduced transparency and increased contrast preferences emulated in Chrome: opaque navigation, no blur, with a selection outline.
- Zero JavaScript/console errors. Screenshots in `previews/`; detailed result in `validation.json`.

Visual inspection: D/E/F on light desktop; E on dark desktop; D compact dark; F at 900 px and compact light; menu open and transition halfway. CODEX review: **Good** for this prototype. Strong point: the navigation can now be walked through, with a clear way back. Possible improvements: test density and titles with content Daniel authorizes, and decide whether the duplication between the sidebar's Story list and the Workspace's list should be removed in the integration. Character initials still replace portraits that were not provided.

FPS and smoothness in native Tauri were not measured. The final feel of the rhythm must be judged by opening the HTML, repeating entries/exits and cancelling quickly; an isolated screenshot does not show smoothness. The app's tests were not run because no production screen was changed. No claim of full HIG conformance, VoiceOver or real devices is made.

Signed: **CODEX**.
