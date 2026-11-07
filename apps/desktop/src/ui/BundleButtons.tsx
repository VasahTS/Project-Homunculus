// Homunculus 2 — the Import button of the Library pages that keep Homunculus's own things (narrators, NPCs, stories,
// Kits, agents, trackers, Directors). D-094. Author: CLAUDE, 2026-11-07.
// Any Homunculus file works on any of these pages: what is in the file is what comes in.
import { useRef } from "react";
import { Button, Icon } from "./kit.tsx";

export function ImportButton({ what, onFiles, small = false }: { what: string; onFiles: (files: File[]) => void; small?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  return <>
    <Button small={small} onClick={() => input.current?.click()} data-testid="bundle-import"
      title={`Add ${what} from a Homunculus file (.h2.json), made with Export. Several files at once work too.`}>
      <Icon name="import" size={14} /> Import
    </Button>
    <input ref={input} type="file" accept=".json,application/json" multiple hidden aria-label={`Import ${what} from a file`}
      onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) onFiles(files); }} />
  </>;
}
