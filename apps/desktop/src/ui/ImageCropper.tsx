// Homunculus 2 — crop and zoom a picture before it is used (characters, personas, stories, narrators, NPCs, Kits).
// Daniel, 11/04: "add the option to crop the image, zoom etc. when you pick an image for some place".
// Every place that picks a picture calls cropImage(file); <CropHost /> (once, in App) shows the sheet. The frame is
// Portrait 2:3 by default (the shape cards, stories and the chat use), or Square, or the picture's own shape.
// Drag to move, the wheel or the slider to zoom, Enter to crop, Esc to cancel. CLAUDE, 2026-11-04 (D-088).
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Button, Segmented } from "./kit.tsx";

export type CropShape = "portrait" | "square" | "original";
interface Request { file: File; shape: CropShape; resolve: (f: File | null) => void }

let show: ((r: Request) => void) | null = null;

/** Opens the crop sheet for a picked picture. Resolves to the cropped picture, the same file ("Use Whole Image"), or
 *  null (Cancel). Without a <CropHost /> on screen the file comes back as it was. */
export function cropImage(file: File, shape: CropShape = "portrait"): Promise<File | null> {
  if (!show || !file.type.startsWith("image/")) return Promise.resolve(file);
  return new Promise((resolve) => show!({ file, shape, resolve }));
}

/** Mounted once by the app. */
export function CropHost() {
  const [req, setReq] = useState<Request | null>(null);
  useEffect(() => { show = setReq; return () => { if (show === setReq) show = null; }; }, []);
  if (!req) return null;
  const done = (f: File | null) => { req.resolve(f); setReq(null); };
  return createPortal(<CropSheet key={req.file.name + req.file.size} file={req.file} startShape={req.shape} onDone={done} />, document.body);
}

const BOX_W = 440;
const BOX_H = 480;
const MAX_OUT = 2048;
const MAX_ZOOM = 5;

function frameOf(aspect: number): { w: number; h: number } {
  return aspect >= BOX_W / BOX_H ? { w: BOX_W, h: Math.round(BOX_W / aspect) } : { w: Math.round(BOX_H * aspect), h: BOX_H };
}

function CropSheet({ file, startShape, onDone }: { file: File; startShape: CropShape; onDone: (f: File | null) => void }) {
  // made in an effect (not in state) so React's double run in development can't revoke the address the picture uses
  const [url, setUrl] = useState("");
  useEffect(() => { const u = URL.createObjectURL(file); setUrl(u); return () => URL.revokeObjectURL(u); }, [file]);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [error, setError] = useState("");
  const [shape, setShape] = useState<CropShape>(startShape);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const img = useRef<HTMLImageElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  const aspect = shape === "portrait" ? 2 / 3 : shape === "square" ? 1 : nat ? nat.w / nat.h : 2 / 3;
  const frame = frameOf(aspect);
  // at zoom 1 the picture just covers the frame
  const base = nat ? Math.max(frame.w / nat.w, frame.h / nat.h) : 1;
  const scale = base * zoom;
  const shown = nat ? { w: nat.w * scale, h: nat.h * scale } : { w: 0, h: 0 };
  const clamp = (p: { x: number; y: number }, w = shown.w, h = shown.h) => ({
    x: Math.min(0, Math.max(frame.w - w, p.x)),
    y: Math.min(0, Math.max(frame.h - h, p.y)),
  });

  // a new shape (or the picture's size arriving) centers it again
  useLayoutEffect(() => {
    if (!nat) return;
    const s = Math.max(frame.w / nat.w, frame.h / nat.h);
    setZoom(1);
    // portraits are usually faces: keep the top in view rather than the middle
    setPos({ x: (frame.w - nat.w * s) / 2, y: shape === "portrait" ? 0 : (frame.h - nat.h * s) / 2 });
  }, [nat, shape]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { sheet.current?.focus(); }, []);

  /** Zooms around a point of the frame (its center by default), so what is under it stays there. */
  const zoomTo = (z: number, at = { x: frame.w / 2, y: frame.h / 2 }) => {
    if (!nat) return;
    const next = Math.min(MAX_ZOOM, Math.max(1, z));
    const k = next / zoom;
    const w = nat.w * base * next; const h = nat.h * base * next;
    setPos((p) => clamp({ x: at.x - (at.x - p.x) * k, y: at.y - (at.y - p.y) * k }, w, h));
    setZoom(next);
  };

  const down = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y };
  };
  const move = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setPos(clamp({ x: d.x + e.clientX - d.px, y: d.y + e.clientY - d.py }));
  };
  const up = () => { drag.current = null; };

  const crop = async () => {
    if (!nat || !img.current) return;
    const sx = -pos.x / scale; const sy = -pos.y / scale;
    const sw = frame.w / scale; const sh = frame.h / scale;
    const k = Math.min(1, MAX_OUT / Math.max(sw, sh));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(sw * k));
    canvas.height = Math.max(1, Math.round(sh * k));
    const ctx = canvas.getContext("2d");
    if (!ctx) { onDone(file); return; }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img.current, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) { setError("Could not crop this picture. Use Whole Image instead."); return; }
    onDone(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".png", { type: "image/png" }));
  };

  return (
    <div className="crop-scrim" onPointerDown={(e) => { if (e.target === e.currentTarget) onDone(null); }}>
      <div className="crop-sheet" role="dialog" aria-modal="true" aria-label="Crop the picture" data-testid="crop-sheet" tabIndex={-1} ref={sheet}
        onKeyDown={(e) => {
          if (e.key === "Escape") { e.preventDefault(); onDone(null); }
          else if (e.key === "Enter") { e.preventDefault(); void crop(); }
          else if (e.key === "+" || e.key === "=") zoomTo(zoom * 1.15);
          else if (e.key === "-") zoomTo(zoom / 1.15);
        }}>
        <div className="crop-head">
          <h2>Crop the picture</h2>
          <Segmented small label="Shape" value={shape} onChange={setShape}
            options={[{ value: "portrait", label: "Portrait" }, { value: "square", label: "Square" }, { value: "original", label: "Original" }]} />
        </div>
        <div className="crop-stage">
          <div className="crop-frame" style={{ width: frame.w, height: frame.h }} data-testid="crop-frame"
            onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
            onWheel={(e) => { const r = e.currentTarget.getBoundingClientRect(); zoomTo(zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1), { x: e.clientX - r.left, y: e.clientY - r.top }); }}>
            {url && <img ref={img} src={url} alt="" draggable={false}
              onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
              onError={() => setError(`"${file.name}" is not a picture this app can open.`)}
              style={{ width: shown.w || undefined, height: shown.h || undefined, transform: `translate(${pos.x}px, ${pos.y}px)` }} />}
            <span className="crop-grid" aria-hidden />
          </div>
        </div>
        <label className="crop-zoom">
          <span>Zoom</span>
          <input type="range" aria-label="Zoom" min={1} max={MAX_ZOOM} step={0.01} value={zoom} onChange={(e) => zoomTo(Number(e.target.value))} />
          <output>{Math.round(zoom * 100)}%</output>
        </label>
        <p className="hint crop-hint">Drag to move. Use the wheel or slider to zoom.</p>
        {error && <div className="error-bar inline" role="alert">{error}</div>}
        <div className="crop-actions">
          <Button variant="plain" onClick={() => onDone(file)} data-testid="crop-whole">Use Whole Image</Button>
          <span className="spacer" />
          <Button onClick={() => onDone(null)}>Cancel</Button>
          <Button variant="prominent" onClick={() => void crop()} disabled={!nat} data-testid="crop-apply">Crop</Button>
        </div>
      </div>
    </div>
  );
}
