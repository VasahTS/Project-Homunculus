# Motion notes — what Daniel's references ask for (2026-11-02)

Source: Daniel's screen recording of the Coffra demo and a summary he asked Gemini to write about it (in Portuguese; translated and condensed here, D-038). Status per item: ✅ in the app · ⏳ later.

1. **Page and tab switches — staggered fade-up.** Content does not appear at once: blocks come up from below while fading in, one after another, guiding the eye. ✅ D-076 (`pageIn`); a light blur like Coffra's was tried and removed (Daniel didn't like it).
2. **Side panels (slide-over / drawer).** Details slide in from the right over a slightly darkened page, keeping the page in view. ⏳
3. **Menus and popovers — fade-scale from the click (transform-origin).** ✅ D-076. **Tooltips with a short delay** so they don't flicker when the mouse only passes by. ⏳
4. **Toasts** rise from the bottom, stay a few seconds, leave. ⏳ (today's notices rise in at the top of the page)
5. **Theme switch** as a soft transition, not a jump. ✅ D-076 (circle from the click). **Drag and drop** lifts the item (shadow, slight scale), follows the mouse and snaps into place. ⏳ (Sortable has the glide; no lift yet)
6. Also seen in Coffra: **figures count up** to their new value after a page switch. ⏳

The notes suggest Framer Motion, Radix/Headless UI and Tailwind. The app does not use them: its motion is the Web Animations API through `ui/motion.ts` (one curve, durations scaled by Customize → Motion), which already covers these patterns without a new dependency.
