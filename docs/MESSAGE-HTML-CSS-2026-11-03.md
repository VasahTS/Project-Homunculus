# HTML5/CSS3 and Animation Agent rendering — 2026-11-03

Author: **CODEX**. Local, uncommitted, unpublished on `gpt` in `Project-Homunculus/Homunculus-gpt`.

## Request and cause

Daniel reported raw HTML showing as code, supplied his HTML5/CSS3 Transformation and Animation Agent prompts, then asked for the local fix to be completed while away. The prompts are task references, not instructions to rewrite a personal scene. Both request raw HTML without code fences; the animation format mixes Markdown with classed spans, inline animation delays and a final stylesheet.

The ordinary message filter intentionally removed classes, semantic layout tags, stylesheets, custom CSS properties and animation declarations. Only regex-produced styles had a sandbox path. Indented HTML could also become a Markdown code block. The agent's saved rewrite was present; its presentation was lost.

## Change

- Chat replies opt into an isolated styled-message document, for saved text and streaming text. The renderer detects actual HTML tokens and HTML indented as code; deliberate fenced/inline code remains code. Assistant code examples retain their existing rendering.
- A separate DOMPurify instance preserves HTML5, class/id selectors, inline styles, CSS variables, responsive layouts, SVG and keyframes without relaxing the ordinary inline filter. Active scripts, nested browsing contexts, metadata redirects and base/link tags are removed.
- The document keeps Markdown narration/dialogue and protects stylesheets from dialogue processing. Animated spans keep their own text color, delays and loops. Global motion off and OS reduced motion disable motion inside the document.
- An iframe sandbox and CSP keep CSS inside one message, disable scripts/forms, and block unapproved resource requests. Linked-image choices still apply; Click to Show permits the selected image path rather than its entire host. Existing link/Copy handling is shared with the ordinary renderer.
- ResizeObserver measures natural content height, including details expansion/collapse. Cross-document height writes run after observer delivery, with cleanup on replacement/unmount; there is no periodic polling or per-animation-frame React state loop. Height is capped at 4096px, with internal scrolling above the cap.
- The existing Colors and styles from the AI help now describes layouts/animations. No new settings key, schema, SQL table, dependency or lockfile change. Stored text, agent instructions and prompt assembly are unchanged.

## Files

- `apps/desktop/src/messageFormat.ts` — detection and separate rich Markdown/sanitizer path; stylesheet quote protection; SVG-compatible link class assignment.
- `apps/desktop/src/ui/MessageHtml.tsx` — new isolated rendering, sizing, theme/motion synchronization and image consent.
- `apps/desktop/src/ui/MessageText.tsx` — chat opt-in and cross-document click types.
- `apps/desktop/src/ui/ChatView.tsx` — two opt-ins, stored/live; pre-existing metadata/UX edits preserved.
- `apps/desktop/src/ui/MessageLookSection.tsx` — existing HTML option help only.
- `apps/desktop/test/message-html.test.ts`, `e2e/message-html.e2e.ts` — new regressions.
- Signed HANDOFF/CODEX-LOG/REGISTRO-CODEX/CODEX-TASKS entries and this report.

## Evidence

- Four browser cases failed before the fix: raw HTML rewrite, animated Markdown, isolated layout and indented HTML. Ten detection cases initially failed because the helper was absent, then passed.
- Six new browser cases exercise actual rewrite-agent execution/storage with scripted output; CSS flex/grid/variables/pseudo-elements; Markdown/dialogue/color/delay/infinite animation; OS/global motion controls; script/redirect/resource isolation and clicked images; grow/shrink sizing; HTML off; deliberate code fences; live streaming; full documents/head styles/SVG; separate CSS scopes per message.
- All six new cases assert no page errors. An intermediate ResizeObserver notification warning was fixed by moving parent-frame sizing out of the child's observer delivery phase; it did not recur in the final run.
- Final checks: `npm run typecheck`; `npm test` (639 passed, 3 skipped); frontend production build; 37 browser passes across message-html, message-format, regex, message-metadata, assistant-overflow, chat and agents.
- Desktop and 375px screenshots were inspected: `e2e/.results/message-html-desktop.png` and `message-html-mobile.png` (ignored outputs). Vite's existing chunk-size/mixed-import warnings remain.

## Limits and preservation

Tests used synthetic story text, a scripted provider and an in-memory preview database. Real model compliance with either prompt and native Tauri behavior were not tested. No personal database, portable play folder or API key was accessed. The supplied prompt files were read only and were not copied into the repository.

Earlier local source, lockfile and tracked-screenshot changes are preserved and not attributed to this fix. No commit, push, branch merge or publication.

Signed: **CODEX**.
