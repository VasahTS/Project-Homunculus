# unslop audit of the current UI — CLAUDE, 2026-11-01

Daniel asked to review the app with the unslop skill (github.com/heydamir/unslop, by Damir Sokolovsky, CC BY 4.0). Method: the skill's `references/signs.md`, checked on the running app (browser preview, demo data: Chat, Characters, character editor, Library → Agents, Settings, Assistant) and on `apps/desktop/src/styles.css` and `ui/*.tsx`.
**Nothing below is changed yet** except what D-073 already did (Mono). The skill says to show the audit and the direction and wait for an answer before the fixes.

## Verdict

**Light-to-medium slop.** The structure is designed (one shell, one kit, tokens, real content); the slop sits in details: AI sparkles and emoji as icons, uppercase tracked labels, too many type sizes and weights, a greeting headline, off-scale spacing. So: **polish mode** — fix what is listed, keep the layout, the features and Daniel's approved choices.

## Direction (five lines)

- **Product.** A desktop app for one person to write roleplay and stories with AI characters: chats and stories in front, the cards, lorebooks, presets, trackers and agents behind them.
- **Character.** Literary, exact, nocturnal.
- **World.** A type foundry at night: black paper, white ink, specimen sheets (Daniel's own reference).
- **Moments.** The story text itself (Literata, dialogue and narration) and the characters' portraits. Chrome stays black, grey and white.
- **Signature.** Figures set in Geist Mono like a printer's slug — the reply receipt, token counts, dates — and nowhere else.

## Signs found

### Surfaces and color
- Green accent and green/blue gradients on letter avatars, the character portrait wash, the Assistant's glowing orb and the Assistant page's radial wash (`styles.css` `.story-cover.letter`, `.cast-pic.letter`, `.ip-letter`, `.ce-portrait .avatar-big`, `.asst-orb`, `.assistant` wash). **Fixed in Mono (D-073)**; Quiet keeps them.
- Glass panels with blur and floating shadows (Graphite). **Mono: hairlines and surface steps.**
- Library → Agents: every kind of agent has its own dot color (purple, pink, green, amber, blue). Many hues in the chrome; proposal: neutral dots, color only where it is a real series (prompt sources in Preview/Reply stay colored).
- Quiet's gold dialogue color. Mono: white dialogue, grey narration.

### Type
- 18 rules at weight 700 and one at 800 (`.toolbar-name` and others). Proposal: 400/500, 600 for rare emphasis; hierarchy by size and color.
- About 20 uppercase tracked labels: Assistant "QUICK START", Details "MODEL / INSTRUCTIONS / PRESET / MEMORY", `.kicker`, `.ce-k`, `.ce-lab`, `.av-name`, `.gallery-group`, `.palette-group-name`, `.pk-label`, `.run-role`, `.trash-kind`, `.qc-title`, `.det-item-h`, `.asst-pop-h`… Proposal: sentence case, normal tracking.
- About 25 different font sizes (8 px to 16.5 px in half steps). Proposal: 11 · 12 · 13 · 14 · 16 · 20 · 28 · 36.
- Narration in italics is content (the prose convention), not emphasis: kept.

### Icons
- Emoji and dingbats used as icons: 📘 preset, 📄 file, 📎 Files, ⚙ Tools, 🌐 Web, 🗑, 📖 (folders), ✎ Drafts, ✒ ❖ (Quick start), ★ ☆ (agent favorite), ⚑ (lorebook), ✓ ✗ (`Assistant.tsx`, `AssistantDetails.tsx`, `AgentEditor.tsx`, `LorebookEditor.tsx`, `Folders.tsx`, `SettingsPage.tsx`). Proposal: the kit's own line icons (`Icon` in `ui/kit.tsx`), one size and stroke, text color.
- **✦ sparkle for the AI** in the mode switch ("✦ Assistant"), the assistant's name and the Agents page (17 places). Proposal: plain "Assistant", no sparkle.

### Spacing
- Off-scale paddings and gaps: `1px 7px`, `3px 10px`, `7px 10px`, `9px 10px`, `9px 12px`, sizes like 10.5/11.5/12.5 px. Proposal: the 4 px grid (2 px only inside small controls); navigation rows 32–36 px with 2–4 px between them.

### Copy
- **Greeting headline** "Good evening" on the Assistant's start screen, with a pill above it ("Knows your library · 15 items"). Proposal: the title names the place ("Assistant"), the library line becomes quiet text under the box.
- Quick start = four cards with an icon tile, a bold title and a line each (the "feature cards" pattern). Proposal: a short list of actions in text.
- Trailing periods on short hints ("Your chats will show here.") — small; fix while passing.

### Components
- Count pills ("~108 tok", "MAIN" badge, "default" tag). Proposal: quiet mono text.

### Motion
- Springs with overshoot (`--ease-spring`, 5 uses: switch thumb, pop-ins). Proposal: one ease-out curve.
- Pulses are only on live states (writing, an agent running, the Assistant replying): allowed.
- **Disagreement to settle with Daniel:** unslop wants "at most one entrance on load", while D-072 (Daniel's Coffra reference) has titles rising letter by letter and cascades on page open, layout switch and tab switch. Proposal: keep Daniel's motion for page opens and chat opens; drop the cascade on tab switches inside an editor (the most repeated one).

### Daniel's choices kept even where unslop differs
- **Square corners** (Mono, from his reference). unslop's default is 8–10 px controls; Daniel's look wins.
- **A display face** for page titles (Archivo, 600, 112 % width): within unslop's 600 limit.

## Pass order once Daniel agrees
Spacing → color (Agents dots) → icons (emoji/sparkle out) → copy (Assistant start) → type (sizes, weights, uppercase labels) → details (count pills) → motion (springs, tab cascades). Every pass across the whole app, then compare screenshots with this list.

---
unslop by Damir Sokolovsky ([@heydamir](https://x.com/heydamir)), CC BY 4.0.
