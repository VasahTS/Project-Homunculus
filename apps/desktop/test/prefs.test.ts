// Settings v2 preferences: unknown or broken saved values never break the app; smooth text takes whole words. CLAUDE, 2026-11-03.
import { describe, expect, it } from "vitest";
import { cleanPrefs, DEFAULT_PREFS } from "../src/prefs.ts";
import { wordsAhead } from "../src/smoothText.ts";

describe("app preferences", () => {
  it("keeps only known keys of the right type, and clamps numbers", () => {
    const p = cleanPrefs({ showTime: false, soundVolume: 250, smoothSpeed: -3, continueTimes: 9.4, lineSpacing: "big", evil: true, keepBackups: 0, emptyTrashDays: 30 });
    expect(p.showTime).toBe(false);
    expect(p.soundVolume).toBe(100);
    expect(p.smoothSpeed).toBe(5);
    expect(p.continueTimes).toBe(5);
    expect(p.lineSpacing).toBe(DEFAULT_PREFS.lineSpacing);
    expect(p.keepBackups).toBe(1);
    expect(p.emptyTrashDays).toBe(30);
    expect(p).not.toHaveProperty("evil");
    expect(cleanPrefs(null)).toEqual(DEFAULT_PREFS);
  });
  it("defaults keep how the app behaved before Settings v2", () => {
    expect(DEFAULT_PREFS).toMatchObject({ replyNotice: true, replySound: "off", systemNotify: false, showTime: true, showNumber: true, showTokens: true,
      swipeArrows: true, thinking: "folded", smoothText: false, followReply: true, autoContinue: false, avatarShape: "hidden", autoBackup: "off", emptyTrashDays: 0 });
  });
});

describe("smooth text", () => {
  it("reveals whole words, with the spaces before them", () => {
    const t = "She opened  the door.";
    expect(t.slice(0, wordsAhead(t, 0, 1))).toBe("She");
    expect(t.slice(0, 3 + wordsAhead(t, 3, 2))).toBe("She opened  the");
    expect(wordsAhead(t, 0, 99)).toBe(t.length);
  });
});
