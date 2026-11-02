# Design review: Card Browser details

Date: 2026-11-02. Author: **CODEX**. Scope: e19bf40 and its keyboard follow-up before gpt → ui publication.

## Summary

**Good after the keyboard correction.** The approved change makes the artwork larger and complete card fields independently readable and collapsible.
The review covers the Tauri app's web interface and shared accessibility principles, not macOS-specific application conventions.

## Resolved finding — Critical

- What: with Description focused, ArrowDown selected another card and moved focus into the grid. The new scrollable text could not use ordinary arrow-key reading.
- Evidence: the added browser regression failed with the field inactive before the correction.
- Why: the local Apple Design reference, scroll-views.md › Best practices, says: "Support default scrolling gestures and keyboard shortcuts."
- Fix: apps/desktop/src/ui/CardBrowser.tsx now leaves arrow keys to focused controls/text inside .cb-sheet. Existing Ctrl/Cmd+F and Escape handling is retained; arrows still navigate the card grid.
- Verification: the same regression now confirms retained text focus, actual scrolling, unchanged card selection while reading, and ArrowRight navigation from the grid.

## What works

- The contained portrait uses the available width; text wraps without horizontal page overflow.
- Native disclosure controls support folding by keyboard; all eight long fields remain available with bounded scrolling.
- Greeting changes reset text position, and another card starts with its own open sections.
- Independent scroll regions retain Daniel's approved design; this review does not redesign the sheet.

## Validation and limits

Typecheck and production frontend build pass; 488 unit tests pass (3 existing skips); 14 related browser flows pass, including the new regression.
Widths 1440 and 390 are browser checks; native windows, screen readers, contrast measurements and a new live-site round were not performed for this small follow-up.
The JannyAI native transport is unchanged from its previously validated commit.

Signed: **CODEX**.
