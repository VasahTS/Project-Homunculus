# Try it — visual draft

Author: **CODEX**. Date: 2026-10-30. Status: **text plan approved; visual draft awaiting Daniel's review**.

Daniel explicitly authorized project examples for this draft, replacing HANDOFF's real-data requirement for this review stage. No private database, play folder or credentials were accessed.

## Open and review

Open [index.html](index.html) in a browser. It is portable and works directly from disk, including its fonts.

The controls beneath the preview are labeled **CODEX · visual draft**. They let you select a sample agent and demonstrate ready, loading, running, result, error, stopped, empty, outdated, unsupported and full-content states. These are review controls, not part of the proposed production feature.

Inside the preview:
- Run test simulates an answer; Stop and Escape cancel it.
- Change the message or connection after a result to see the outdated-result notice. The old answer and input remain attached to the old test until another run.
- Inspect Result, What it read, Raw answer, and the scripted example explanation.
- Try the project's text agent to see immediate macro expansion with no model connection.
- Close returns to the editor; Try it reopens a clean preview.

All model names, results, timings, usage, explanations and additional conversation lines are scripted review examples. No actual model call, provider test or story update occurs.

## Source and boundaries

- Current app: Quiet profile from `apps/desktop/src/theme/themes.ts`, tokens from `theme/tokens.css`, styles and shared editor/modal conventions.
- Four actual starter agent names, instructions, output kinds and history sizes are extracted from `apps/desktop/src/agents.ts`: Prose Polisher, Don't Write for User, CYOA Choices and Lorebook Keeper.
- Lyra and her opening come from the project's starter example. Additional old-mill dialogue, the full-state cast, model metadata and answers are authored fixtures for review, not Daniel's personal data.
- Literata is bundled from the project's existing font dependency; its OFL license is in `Literata-LICENSE.txt`.
- Production app files and behavior are unchanged. The core preview API and real Try it integration are not implemented by this draft.
- Global agent activation/scopes remain deferred.

## Captures

- [Ready, focused preview](previews/preview-ready.png)
- [Result, focused preview](previews/preview-result.png)

- [Ready](previews/desktop-ready.png)
- [Result](previews/desktop-result.png)
- [What it read](previews/desktop-input.png)
- [Running](previews/desktop-running.png)
- [Connection error](previews/desktop-error.png)
- [Long content at 620 px](previews/narrow-full.png)

## Build and verify

From the project root, with its existing dependencies installed:

```powershell
node docs/drafts/agent-try-it/build.mjs
node docs/drafts/agent-try-it/verify.mjs
```

The builder embeds the app's current styles, Quiet tokens, font files and source agent data in the portable HTML. The verifier uses a fresh headless Chromium context and records `validation.json`.

Verified: 54 layout combinations/checks across 1366×900, 1366×768, 620×800 and 390×844; reduced motion; simulated 150% text; keyboard focus, tab navigation, cancellation/late-result suppression, stale-result snapshots, error retry and typed previews. Minimum contrast across the sampled modal text styles: **8.32:1**. No page errors or HTTP(S) requests were observed. This is draft validation, not native Tauri or real model integration testing.

Signed: **CODEX**.
