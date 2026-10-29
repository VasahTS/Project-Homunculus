// Homunculus 2 — a picture you click to change (NPCs, narrators, stories). Author: CLAUDE, 2026-10-29.
// (Daniel: "ser possível botar imagens para os NPCs, Narradores e Stories".) Same storage as characters' pictures
// (the avatars table, keyed by the item's id); any image becomes a PNG (files.ts imageFileToPngAvatar).
import { useRef } from "react";
import type { Avatar } from "@homunculus/schemas";
import { avatarUrl } from "../files.ts";
import { Icon } from "./kit.tsx";

export function ImagePicker({ name, avatar, own = !!avatar, onChange, shape = "round", size = 64, testId }: {
  name: string;
  avatar?: Avatar | undefined;
  /** The picture shown is this item's own (else it is borrowed, e.g. a story showing its narrator's): only then "Remove". */
  own?: boolean;
  /** A file to use, or null to remove the picture. Undefined = read-only (not saved yet). */
  onChange?: ((file: File | null) => void) | undefined;
  shape?: "round" | "square";
  size?: number;
  testId?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  const picture = avatar
    ? <img src={avatarUrl(avatar)} alt="" style={style} />
    : <span className="ip-letter" aria-hidden style={style}>{(name || "?").slice(0, 1).toUpperCase()}</span>;
  if (!onChange) return <span className={`image-picker ${shape} readonly`}>{picture}</span>;
  return (
    <span className={`image-picker ${shape}`} data-testid={testId}>
      <button type="button" className="ip-button" onClick={() => input.current?.click()}
        aria-label={own ? `Change the image of ${name || "this"}` : `Add an image for ${name || "this"}`}
        title={own ? "Change the image" : "Add an image"}>
        {picture}
        <span className="ip-badge" aria-hidden><Icon name={own ? "pencil" : "plus"} size={12} /></span>
      </button>
      {avatar && own && <button type="button" className="link quiet ip-remove" onClick={() => onChange(null)}>Remove</button>}
      <input ref={input} type="file" accept="image/*" hidden data-testid={testId ? `${testId}-input` : undefined}
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onChange(f); }} />
    </span>
  );
}
