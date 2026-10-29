// Homunculus 2 — tests for the release scripts (D-037). Author: CLAUDE, 2026-10-29.
import { describe, expect, it } from "vitest";
import { compare } from "./set-version.mjs";
import { sectionFor } from "./notes.mjs";
import { repoFromGitConfig } from "./updater-key.mjs";
import { buildManifest } from "./updater-json.mjs";

describe("release scripts", () => {
  it("compares versions by number, not by text", () => {
    expect(compare("0.10.0", "0.9.9")).toBeGreaterThan(0);
    expect(compare("1.0.0", "1.0.0")).toBe(0);
    expect(compare("0.2.0", "0.2.1")).toBeLessThan(0);
  });

  it("takes one version's section from the changelog", () => {
    const log = "# Changelog\n\n## 0.2.0 — 2026-11-01\n- Folders\n- Search\n\n## [0.1.0]\n- First\n";
    expect(sectionFor(log, "0.2.0")).toBe("- Folders\n- Search");
    expect(sectionFor(log, "0.1.0")).toBe("- First");
    expect(sectionFor(log, "0.1.1")).toBe("");
    expect(sectionFor("## 0.20.0\n- not this\n", "0.2.0")).toBe("");
  });

  it("finds owner/repo in .git/config (https and ssh)", () => {
    expect(repoFromGitConfig('[core]\n\tbare = false\n[remote "origin"]\n\turl = https://github.com/dan/Homunculus2.git\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n')).toBe("dan/Homunculus2");
    expect(repoFromGitConfig('[remote "origin"]\n\turl = git@github.com:dan/h2.git\n')).toBe("dan/h2");
    expect(repoFromGitConfig("[core]\n\tbare = false\n")).toBeNull();
  });

  it("lists the Windows installer and the Linux AppImage in latest.json, never the .deb", () => {
    const m = buildManifest({
      version: "0.2.0", notes: "n", repo: "VasahTS/Project-Homunculus", date: "D",
      assets: ["Homunculus_0.2.0_x64-setup.exe", "Homunculus_0.2.0_x64-setup.exe.sig", "Homunculus_0.2.0_amd64.AppImage",
        "Homunculus_0.2.0_amd64.AppImage.sig", "Homunculus_0.2.0_amd64.deb"],
      signature: (name) => `sig of ${name}`,
    });
    expect(Object.keys(m.platforms).sort()).toEqual(["linux-x86_64", "linux-x86_64-appimage", "windows-x86_64", "windows-x86_64-nsis"]);
    expect(m.platforms["linux-x86_64"].url).toBe("https://github.com/VasahTS/Project-Homunculus/releases/download/v0.2.0/Homunculus_0.2.0_amd64.AppImage");
    expect(m.platforms["windows-x86_64"].signature).toBe("sig of Homunculus_0.2.0_x64-setup.exe.sig");
  });
});
