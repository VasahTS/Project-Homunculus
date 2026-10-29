# Home with motion — round 2

Author: **CODEX**, 10/29/2026. Local drafts, no integration, commit or push. The previous round stays in `../homepage/`. (Translated to English by CLAUDE, D-038.)

## Context and critical reading

Homunculus 2 is a Tauri/React desktop app for narratives. This Home should let you pick a world, resume a specific chat and start another experience. The current request is to explore menus and animations with Apple Design; not to implement it in the app.

Review of the previous drafts, CODEX's judgment: resuming is clear, but almost every click ends in explanatory dialogs. That prevents trying the continuity of navigation. The new round will have Home → Story → chat, selection with a preview, a context menu and temporary creation in memory. Slogans, decorative labels and technical messages are removed from the proposed interface.

Skills applied: apple-design, frontend-design, animate and design-taste-frontend. The last one excludes app screens from its own scope: its criteria for composition, identity and visual inspection are used. Its eight-motion floor, mandatory video, landing-page lottery, no sidebar/glass or marketing typography do not apply; they contradict the request for Apple Design and the panel's daily use. The product comes first.

The `pick-ui-library` helper mentioned by animate is not in the catalog nor in the local folders searched. No need to install another package: menus use the native Popover API and the modal task uses `<dialog>`, with native focus/escape and menu keyboard handling added. No modal components drawn with divs only.

References read in apple-design: accessibility, layout, typography, color, designing-for-macos, motion, sidebars, menus, popovers, sheets, liquid-glass and cross-platform. Guidance applied and short quotes:

- `motion.md › Best practices`: "Add motion purposefully, supporting the experience without overshadowing it." Motion describes changes, without continuous effects.
- `motion.md › Providing feedback`: "Let people cancel motion." New actions interrupt transitions; nothing is blocked until the animation ends.
- `liquid-glass.md › The two layers`: "Content layer" / "Functional layer". Text and covers are solid; translucency lives in floating navigation and menus.
- `designing-for-macos.md › Best practices`: "Handle keyboard shortcuts". Full keyboard navigation; Ctrl/Cmd+K opens search without animation.
- `menus.md › Labels`: "write a label that clearly and succinctly describes it". Commands name the action and use the same language in the result.

It is not a native Liquid Glass implementation: it is a CSS approximation in a web prototype. In Tauri, native materials and preferences need their own integration.

## Visual plan

Semantic palette, light / dark: background `#f4f5f2` / `#191e1c`; surface `#ffffff` / `#242b27`; foreground `#24352c` / `#edf2ec`; secondary `#59665e` / `#b3c0b6`; accent `#34694f` / `#b5d4b5`; separator `#d7dfd5` / `#414e44`. Contrasts computed by the verifier and recorded in the result, including opaque navigation surfaces that limit translucency. Covers keep their own colors and carry no control text.

Typography: the system font for controls, 13–15 px; local Literata for narrative titles, 28–38 px, and excerpts, 15–17 px with line height 1.7. Minimum secondary text 12 px. Desktop targets of at least 28 px; 44 px at compact width. Text may wrap; the main content is never cut.

### D · Atelier

A gallery with a collapsible sidebar. The signature is the cover that turns into the Story's opening and back into place.

```text
Regular: [sidebar] [toolbar                         +]
                  [Continue: cover | excerpt + resume]
                  [Stories: cover  cover  cover]
Compact: [toolbar/menu] [Continue] [stacked Stories]
```

### E · Lantern

A reading space with light navigation floating over the side of the Story's world. The content area stays solid. The signature is the passage between world and menus, with no effects on reading.

```text
Regular: [navigation] [big cover | last chat]
                     [Recent as an open list]
Compact: [toolbar/menu] [cover + last chat] [Recent]
```

### F · Workspace

A split view inspired by document selection: a list of Stories to the left of the preview. The signature is selecting without opening a window or losing the list.

```text
Regular: [sidebar] [list of Stories | preview + chats]
Compact: [toolbar] [list] → [preview with back]
```

Critique of the plan: three simple color swaps would repeat the previous round. So the drafts differ in flow (gallery with an opening, reading with discreet navigation, selection/preview), sharing a motion vocabulary. No imitation of window traffic lights, Apple marks or fake system controls. The content comes from Homunculus: a Story with several chats, branch and last message, Library/Vault and creation with a play mode.

## Motion contract

Frequency/purpose: occasional menu and sheet = spatial consistency; opening/going back from a Story = avoid an abrupt change; daily selection = a very discreet state indication; press = feedback. Keyboard and typed search = immediate response. No autonomous effect on text, resting covers or the pointer.

Existing tokens reused: `--ease-out: cubic-bezier(0.22,1,0.36,1)` from the app; `--ease-in-out: cubic-bezier(0.77,0,0.175,1)`; `--dur-fast:160ms` and `--dur:280ms`. Extension: menu 180 ms, content/cover change 240 ms, drawer `cubic-bezier(0.32,0.72,0,1)` from the animate skill. No approximated curve or new library.

CSS transitions for press and selection; CSS `@starting-style` and discrete transitions for the popover; WAAPI for the cover and the sheet with cancellation and a symmetric exit. Transform/opacity are interpolated, with the exception the animate skill allows: `clip-path` on the cover's framing. The clip changes proportion while the illustration keeps a uniform scale, avoiding distortion. The clones' sizes are measured once before the animation. Focus, interaction and going back remain available during the transition.

Reduced motion removes travel/scale and keeps a short opacity. Reduced transparency uses opaque surfaces. Increased contrast strengthens outlines and text. The review panel can simulate reduced motion; it is not a new preference inside the product.

## States, data and limits

States to review: normal, a library with 12 Stories, first visit without stories, search without results; loading/error via the review panel. Fictional examples reuse names from the previous round. Creation, favorites and undo only change the prototype's temporary memory; no database, API, personal file or credential is read.

Planned validation: light/dark screenshots on desktop and compact; overflow and contrast measured; keyboard in menus, escape, focus return, instant shortcuts, Story open/exit, creation and undo, quick interruptions and reduced motion/transparency. The feel will be checked with mid-transition screenshots, not inferred from a resting image.

Signed: **CODEX**.
