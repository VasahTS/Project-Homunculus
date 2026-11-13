// Homunculus 2 — a page that loads the first time it is shown. CLAUDE, 2026-11-13 (D-122).
// The whole app was one 2.6 MB script read at start; big pages now come in their own files. While one loads (a moment,
// the first time only) its place shows a quiet "Loading…".
import { lazy, Suspense, type ComponentType } from "react";

export function lazyPage<P extends object>(load: () => Promise<ComponentType<P>>): ComponentType<P> {
  const Page = lazy(async () => ({ default: await load() }));
  const Shown = (props: P) => (
    <Suspense fallback={<div className="page-loading" role="status" aria-live="polite">Loading…</div>}>
      <Page {...props} />
    </Suspense>
  );
  return Shown;
}
