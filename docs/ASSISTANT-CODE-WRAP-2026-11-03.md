# Assistant code word wrap — 2026-11-03

Author: **CODEX**. Status: **local, uncommitted, unpublished on gpt**.

Daniel supplied a screenshot of a long paragraph in a fenced code block continuing beyond the visible area. The previous Assistant overflow fix constrained the block's width and allowed internal horizontal scrolling; it did not enable word wrap. The shared `.msg-format pre` rule used `white-space: pre`.

| Before | After | Why |
| --- | --- | --- |
| Long code lines stayed on one visual line with horizontal scrolling. | Assistant code blocks use `white-space: pre-wrap` and `overflow-wrap: anywhere`. | Long paragraphs wrap at spaces; unbroken identifiers also fit. Spaces, indentation, blank lines and copied text are preserved. |

The product change is one scoped rule and an updated adjacent CODEX comment in `apps/desktop/src/styles.css`. It applies to already-rendered, streaming and completed Assistant code. Shared roleplay message styles, Markdown parsing, React components and storage are unchanged. Earlier local CSS changes remain preserved and are not attributed to this follow-up.

`e2e/assistant-overflow.e2e.ts` updates the existing desktop/390px cases to require actual word wrap instead of horizontal scrolling. Each test holds a synthetic stream open until its assertions complete, verifies that the original first line occupies multiple rendered rows, and checks the code block and conversation for horizontal overflow both during streaming and after completion. A line without spaces, indentation and blank lines are included. The Copy handler writes to a test-local mock, proving exact original text preservation without changing the real clipboard. The completed response is checked again after resizing to 820/620px. At 390px, existing Details and Sidebar controls are closed before testing the usable conversation width.

Both cases failed at the no-horizontal-code-overflow assertion before the CSS fix. After the fix, the test was refined to scroll vertically to the final message action before checking visibility; word wrap increases the response height. The narrow screenshot setup was also corrected to close the overlaid Details panel before the Sidebar. These refinements changed tests only.

Validation: **615 unit passes, 3 skips**; TypeScript and desktop frontend build passed. Final word-wrap browser cases: **2/2 passed**; shared message-format regression: **1/1 passed**. Screenshots at `e2e/.results/assistant-code-wrap-1366.png` and `assistant-code-wrap-390.png` were visually inspected. The final screenshots disable animations only in the tests. Existing build bundle-size/static-and-dynamic-import warnings remain.

The ui-ux-pro-max UX search matched long-token wrapping and fitting content to the viewport. Its React-stack search had no relevant match; the implementation uses the verified UX guidance and the actual CSS cascade rather than applying unrelated React recommendations.

No personal/portable data, API keys, real provider, native Tauri app or native executable was accessed or tested. No dependency, lockfile, schema, stored chat, commit, push or merge change was made. Previous unrelated local work was preserved.

Signed: **CODEX**.
