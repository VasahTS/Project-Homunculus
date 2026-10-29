// Homunculus 2 — unit test settings. Author: CLAUDE, 2026-10-28.
// The reference projects downloaded by `npm run refs` (.refs/) have their own tests; never run those.
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: { exclude: [...configDefaults.exclude, ".refs/**", "e2e/**"] },
});
