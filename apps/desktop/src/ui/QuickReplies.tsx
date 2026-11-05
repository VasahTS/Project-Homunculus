// Homunculus 2 — Quick Replies (SillyTavern's Quick Reply, text only): the bar above the message box (draft A), the
// one-button list (draft B), the ⋮ menu, Library → Quick Replies and the Prompt tab group. Author: CLAUDE, 2026-11-04
// (D-090; drafts on the canvas "Homunculus 2 — Quick Reply"). What a click does is in packages/core/src/quick-replies.ts.
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import {
  barReplies, freeSetName, hasQuickReplyMenu, importStQuickReplies, linksAt, quickReplyMenu, runQuickReply, shownSets,
  toStQuickReplySet, withLinks, withoutSet, type QuickReplyMenuItem,
} from "@homunculus/core";
import { QuickReply, QuickReplySet, type QuickReplyData, type QuickReplyLink, type QuickReplyScope } from "@homunculus/schemas";
import { Button, Icon, IconButton, ICONS, isIconName, Segmented, Switch } from "./kit.tsx";
import { SortableList, move } from "./Sortable.tsx";
import { Toolbar } from "./Toolbar.tsx";
import { saveQuickReplies, useQuickReplies } from "../quickReplies.ts";
import { usePrefs } from "../prefs.ts";

type IconName = keyof typeof ICONS;

// ---------------------------------------------------------------- icons

/** SillyTavern names Font Awesome icons ("fa-heart"); the ones we have a drawing for are shown with ours. */
const FA: Record<string, IconName> = {
  heart: "heart", book: "book", "book-open": "book", pencil: "pencil", pen: "pencil", "pen-to-square": "pencil", "user-pen": "pencil",
  user: "persona", "user-xmark": "persona", "user-slash": "persona", users: "users", "people-group": "users",
  map: "globe", "map-location-dot": "globe", "map-location": "globe", globe: "globe", "earth-americas": "globe",
  bolt: "bolt", star: "star", clock: "clock", hourglass: "hourglass", "hourglass-half": "hourglass", "forward": "send", "forward-fast": "send",
  "paper-plane": "send", play: "play", rotate: "refresh", "rotate-right": "refresh", arrows: "refresh", repeat: "refresh",
  scroll: "scroll", feather: "pencil", "feather-pointed": "pencil", mask: "mask", "masks-theater": "masks", shield: "shield", gem: "gem",
  flag: "flag", "wand-magic-sparkles": "sparkle", "wand-magic": "sparkle", "wand-sparkles": "sparkle", sparkles: "sparkle", gear: "gear",
  calendar: "calendar", lock: "lock", eye: "eye", "eye-slash": "eyeOff", bookmark: "pin", thumbtack: "pin", comments: "users", comment: "users",
  "comment-dots": "users", message: "users", "face-smile": "smile", dice: "grid", "dice-d20": "grid", list: "grid", bars: "grid",
};
export function iconOf(icon: string): IconName | null {
  if (!icon) return null;
  if (isIconName(icon) && icon !== "none") return icon;
  const fa = icon.split(/\s+/).find((c) => c.startsWith("fa-") && !["fa-solid", "fa-regular", "fa-fw"].includes(c));
  return fa ? FA[fa.slice(3)] ?? null : null;
}
/** What a button shows: its drawing, its label, or both (ST: the label shows when there is no icon, or with Show). */
function Face({ reply }: { reply: QuickReply }) {
  const icon = iconOf(reply.icon);
  const label = reply.label || (reply.icon ? reply.icon.replace(/^.*fa-/, "") : "") || "…";
  return <>
    {icon && <Icon name={icon} size={14} />}
    {(!icon || reply.showLabel || !reply.label) && <span className="qr-label">{icon && !reply.label ? "" : label}</span>}
  </>;
}

const tint = (set: QuickReplySet): CSSProperties | undefined => (set.color ? ({ "--qr-color": set.color } as CSSProperties) : undefined);
const setClass = (set: QuickReplySet) => (set.color ? (set.borderOnly ? " qr-tint qr-border" : " qr-tint") : "");

// ---------------------------------------------------------------- what the chat needs

export interface QuickReplyHost {
  /** Where the chat is: which sets show. */
  storyId: string | null;
  characterIds: string[];
  chatId: string;
  /** The message box. */
  input: string;
  setInput: (text: string) => void;
  focusInput: () => void;
  /** Sends text as your message (false when a reply is being written: then the text goes to the box). */
  send: (text: string) => boolean;
  /** Ctrl+click (SillyTavern): opens the reply in Library → Quick Replies. */
  onEdit: (setId: string, replyId: string) => void;
}

function useRun(host: QuickReplyHost) {
  return (set: QuickReplySet, message: string) => {
    const r = runQuickReply(set, message, host.input);
    if (r.send && r.text && host.send(r.text)) { host.setInput(""); return; }
    host.setInput(r.text);
    host.focusInput();
  };
}

function useShown(host: QuickReplyHost) {
  const data = useQuickReplies();
  return useMemo(() => {
    const shown = shownSets(data, { storyId: host.storyId, characterIds: host.characterIds, chatId: host.chatId });
    return { data, shown, buttons: barReplies(shown) };
  }, [data, host.storyId, host.characterIds.join(","), host.chatId]);
}

/** The ⋮ menu (ContextMenu): headers, replies; a reply with its own menu opens it in place. */
function QrMenu({ items, at, onPick, onClose }: { items: QuickReplyMenuItem[]; at: { x: number; y: number }; onPick: (i: Extract<QuickReplyMenuItem, { kind: "reply" }>) => void; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: at.x, top: at.y });
  useLayoutEffect(() => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ left: Math.max(8, Math.min(at.x, window.innerWidth - r.width - 8)), top: Math.max(8, at.y - r.height > 8 ? at.y - r.height - 4 : Math.min(at.y, window.innerHeight - r.height - 8)) });
  }, [at.x, at.y]);
  useEffect(() => {
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", esc);
    window.addEventListener("resize", onClose);
    requestAnimationFrame(() => box.current?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true }));
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", esc); window.removeEventListener("resize", onClose); };
  }, [onClose]);
  return (
    <div ref={box} className="qr-menu" role="menu" style={{ left: pos.left, top: pos.top }} data-testid="qr-menu"
      onKeyDown={(e) => {
        if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
        const all = [...(box.current?.querySelectorAll<HTMLElement>("button.qr-mi") ?? [])];
        const i = all.indexOf(document.activeElement as HTMLElement);
        all[(i + (e.key === "ArrowDown" ? 1 : -1) + all.length) % all.length]?.focus();
        e.preventDefault();
      }}>
      <MenuItems items={items} onPick={onPick} />
    </div>
  );
}
function MenuItems({ items, onPick }: { items: QuickReplyMenuItem[]; onPick: (i: Extract<QuickReplyMenuItem, { kind: "reply" }>) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!items.length) return <span className="qr-mh">Nothing in this menu</span>;
  return <>{items.map((it, i) => it.kind === "header"
    ? <span key={`h${i}`} className="qr-mh">{it.label}</span>
    : (
      <div key={`${it.set.id}:${it.reply.id}:${i}`} className="qr-mrow">
        <span className="qr-mline">
          <button type="button" role="menuitem" className="qr-mi" title={it.reply.title || it.message} onClick={() => onPick(it)}><Face reply={it.reply} /></button>
          {it.children.some((c) => c.kind === "reply") && (
            <button type="button" className="qr-mi qr-msub" aria-expanded={open === `${i}`} aria-label={`More under ${it.reply.label}`} onClick={() => setOpen(open === `${i}` ? null : `${i}`)}><Icon name="chevron" size={11} /></button>
          )}
        </span>
        {open === `${i}` && <div className="qr-mchildren"><MenuItems items={it.children} onPick={onPick} /></div>}
      </div>
    ))}</>;
}

function useMenu(host: QuickReplyHost, sets: QuickReplySet[]) {
  const run = useRun(host);
  const [menu, setMenu] = useState<{ items: QuickReplyMenuItem[]; at: { x: number; y: number } } | null>(null);
  const openFor = (reply: QuickReply, e: ReactMouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setMenu({ items: quickReplyMenu(reply, sets), at: e.type === "contextmenu" ? { x: e.clientX, y: e.clientY } : { x: r.left, y: r.top } });
  };
  const node = menu && <QrMenu items={menu.items} at={menu.at} onClose={() => setMenu(null)}
    onPick={(it) => { setMenu(null); run(it.set, it.message); }} />;
  return { openFor, node };
}

/** Draft A: the buttons above the message box, in rows, like SillyTavern's #qr--bar. */
export function QuickReplyBar({ host }: { host: QuickReplyHost }) {
  const { data, buttons } = useShown(host);
  const run = useRun(host);
  const menu = useMenu(host, data.sets);
  if (!buttons.length) return null;
  return (
    <div className="qr-bar" role="toolbar" aria-label="Quick replies" data-testid="qr-bar">
      {buttons.map(({ set, reply }) => {
        const withMenu = hasQuickReplyMenu(reply, data.sets);
        return (
          <span key={`${set.id}:${reply.id}`} className={`qr-btn${setClass(set)}`} style={tint(set)}>
            <button type="button" className="qr-run" title={`${reply.title || reply.message}${"\n"}Ctrl+click to edit`} aria-label={reply.label || reply.icon}
              data-testid="qr-button"
              onClick={(e) => { if (e.ctrlKey || e.metaKey) { host.onEdit(set.id, reply.id); return; } run(set, reply.message); }}
              onContextMenu={(e) => { if (withMenu) menu.openFor(reply, e); }}>
              <Face reply={reply} />
            </button>
            {withMenu && <button type="button" className="qr-more" aria-label={`${reply.label} menu`} aria-haspopup="menu" onClick={(e) => menu.openFor(reply, e)}>⋮</button>}
          </span>
        );
      })}
      {menu.node}
    </div>
  );
}

/** Draft B: one button in the message box; it opens the list (Ctrl+/), with a search. */
export function QuickReplyDrawer({ host }: { host: QuickReplyHost }) {
  const { data, shown } = useShown(host);
  const run = useRun(host);
  const menu = useMenu(host, data.sets);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const box = useRef<HTMLSpanElement>(null);
  const groups = shown.filter((s) => s.link.visible).map((s) => ({
    ...s, replies: s.set.replies.filter((r) => !r.hidden && (!q.trim() || `${r.label}\n${r.message}`.toLowerCase().includes(q.trim().toLowerCase()))),
  })).filter((g) => g.replies.length);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === "/") { e.preventDefault(); setOpen((o) => !o); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (!open) { setQ(""); return; }
    const out = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.(".qr-menu")) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector(".qr-menu")) { e.preventDefault(); setOpen(false); host.focusInput(); } };
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", esc);
    requestAnimationFrame(() => box.current?.querySelector<HTMLInputElement>(".qr-find input")?.focus());
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", esc); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  if (!shown.some((s) => s.link.visible && s.set.replies.some((r) => !r.hidden))) return null;
  return (
    <span ref={box} className="qr-drawer-wrap">
      <IconButton label="Quick replies (Ctrl+/)" className={`qr-drawer-btn${open ? " on" : ""}`} aria-expanded={open} aria-haspopup="dialog"
        data-testid="qr-drawer-button" onClick={() => setOpen(!open)}><Icon name="bolt" size={15} /></IconButton>
      {open && (
        <div className="qr-drawer" role="dialog" aria-label="Quick replies" data-testid="qr-drawer">
          <label className="qr-find"><Icon name="search" size={13} /><input aria-label="Find a quick reply" placeholder="Find a quick reply" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { const g = groups[0]; const r = g?.replies[0]; if (g && r) { e.preventDefault(); setOpen(false); run(g.set, r.message); } } }} /></label>
          <div className="qr-drawer-list">
            {groups.length === 0 && <p className="hint qr-empty">Nothing matches.</p>}
            {groups.map((g) => (
              <section key={g.set.id} className={`qr-group${setClass(g.set)}`} style={tint(g.set)}>
                <div className="qr-gh"><span>{g.set.name}</span><span>{SCOPE_LABEL[g.scope]}</span></div>
                {g.replies.map((r) => (
                  <span key={r.id} className="qr-row">
                    <button type="button" className="qr-row-run" data-testid="qr-drawer-item" title={r.title || r.message}
                      onClick={(e) => { if (e.ctrlKey || e.metaKey) { setOpen(false); host.onEdit(g.set.id, r.id); return; } setOpen(false); run(g.set, r.message); }}
                      onContextMenu={(e) => { if (hasQuickReplyMenu(r, data.sets)) menu.openFor(r, e); }}>
                      <span className="qr-row-name"><Face reply={{ ...r, showLabel: true }} /></span>
                      <span className="qr-row-text">{r.message}</span>
                    </button>
                    {hasQuickReplyMenu(r, data.sets) && <button type="button" className="qr-more" aria-label={`${r.label} menu`} aria-haspopup="menu" onClick={(e) => menu.openFor(r, e)}>⋮</button>}
                  </span>
                ))}
              </section>
            ))}
          </div>
        </div>
      )}
      {menu.node}
    </span>
  );
}

/** Which one the chat shows (Settings → Chat → Quick Replies). */
export function useQuickReplyStyle() { return usePrefs().quickReplies; }

const SCOPE_LABEL: Record<QuickReplyScope, string> = { global: "Global", story: "Story", character: "Character", chat: "This chat" };

// ---------------------------------------------------------------- Prompt tab: which sets are on here

export function SessionQuickReplies({ chatId, storyId, storyName, cast, onOpenLibrary, onError }: {
  chatId: string; storyId: string | null; storyName?: string | undefined; cast: Array<{ id: string; name: string }>;
  onOpenLibrary: () => void; onError: (e: unknown) => void;
}) {
  const data = useQuickReplies();
  const places: Array<{ scope: QuickReplyScope; id: string | null; title: string }> = [
    { scope: "global", id: null, title: "Global · every chat" },
    ...(storyId ? [{ scope: "story" as const, id: storyId, title: `Story${storyName ? ` · ${storyName}` : ""}` }] : []),
    ...cast.map((c) => ({ scope: "character" as const, id: c.id, title: `Character · ${c.name}` })),
    { scope: "chat", id: chatId, title: "This chat" },
  ];
  const save = (next: QuickReplyData) => void saveQuickReplies(next).catch(onError);
  const name = (id: string) => data.sets.find((s) => s.id === id)?.name;
  return (
    <section className="group-section" data-testid="session-quick-replies">
      <div className="group-head"><span className="label-row">Quick Replies</span>
        <span className="group-aside"><button type="button" className="link quiet" onClick={onOpenLibrary}>Edit sets</button></span></div>
      {data.sets.length === 0 ? (
        <div className="group"><div className="row row-wide"><span className="hint">Manage sets in Library → Quick Replies.</span></div></div>
      ) : places.map((p) => {
        const links = linksAt(data, p.scope, p.id).filter((l) => name(l.setId));
        const free = data.sets.filter((s) => !links.some((l) => l.setId === s.id));
        const put = (next: QuickReplyLink[]) => save(withLinks(data, p.scope, p.id, next));
        return (
          <div key={p.scope + (p.id ?? "")} className="qr-place" data-testid={`qr-place-${p.scope}`}>
            <div className="qr-place-h"><span>{p.title}</span>
              {free.length > 0 && (
                <select aria-label={`Add a set: ${p.title}`} value="" data-testid={`qr-add-${p.scope}`} onChange={(e) => { if (e.target.value) put([...links, { setId: e.target.value, visible: true }]); }}>
                  <option value="">+ Add</option>
                  {free.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
            </div>
            {links.length > 0 && (
              <div className="group">
                {links.map((l) => (
                  <div key={l.setId} className="row">
                    <span className="row-label"><strong>{name(l.setId)}</strong>{!l.visible && <span className="hint"> · buttons hidden</span>}</span>
                    <span className="row-value qr-place-acts">
                      <Switch label={`${name(l.setId)} buttons`} checked={l.visible} onChange={(visible) => put(links.map((x) => (x.setId === l.setId ? { ...x, visible } : x)))} />
                      <IconButton label={`Remove ${name(l.setId)} here`} onClick={() => put(links.filter((x) => x.setId !== l.setId))}><Icon name="close" size={12} /></IconButton>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

// ---------------------------------------------------------------- Library → Quick Replies

const newReply = (): QuickReply => QuickReply.parse({ id: crypto.randomUUID(), label: "New reply" });
const newSet = (sets: QuickReplySet[]): QuickReplySet => QuickReplySet.parse({ id: crypto.randomUUID(), name: freeSetName(sets, "New Set"), send: false, replies: [newReply()] });
const ICON_CHOICES = (Object.keys(ICONS) as IconName[]).filter((n) => n !== "none");

export function QuickRepliesPage({ lead, focus, onExport, onNotice }: {
  lead: ReactNode; focus?: { setId?: string | undefined; replyId?: string | undefined } | undefined;
  onExport: (fileName: string, text: string) => void; onNotice: (kind: "ok" | "error", title: string, lines?: string[]) => void;
}) {
  const data = useQuickReplies();
  const [setId, setSetId] = useState<string | null>(focus?.setId ?? null);
  const [replyId, setReplyId] = useState<string | null>(focus?.replyId ?? null);
  const [sure, setSure] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (focus?.setId) { setSetId(focus.setId); setReplyId(focus.replyId ?? null); } }, [focus?.setId, focus?.replyId]);
  const set = data.sets.find((s) => s.id === setId) ?? data.sets[0] ?? null;
  const reply = set?.replies.find((r) => r.id === replyId) ?? set?.replies[0] ?? null;
  useEffect(() => setSure(false), [set?.id]);

  const save = (next: QuickReplyData) => void saveQuickReplies(next).catch((e: unknown) => onNotice("error", "Quick Replies were not saved", [e instanceof Error ? e.message : String(e)]));
  const putSet = (s: QuickReplySet) => save({ ...data, sets: data.sets.map((x) => (x.id === s.id ? s : x)) });
  const putReply = (r: QuickReply) => set && putSet({ ...set, replies: set.replies.map((x) => (x.id === r.id ? r : x)) });
  const isGlobal = !!set && data.global.some((l) => l.setId === set.id);

  const importFiles = async (files: File[]) => {
    let all = data.sets;
    const added: QuickReplySet[] = [], lines: string[] = [];
    for (const f of files) {
      try { const sets = importStQuickReplies(await f.text(), f.name, all); added.push(...sets); all = [...all, ...sets]; lines.push(`${f.name}: ${sets.map((s) => `${s.name} (${s.replies.length})`).join(", ")}`); }
      catch (e) { lines.push(e instanceof Error ? e.message : String(e)); }
    }
    if (added.length) { save({ ...data, sets: all }); setSetId(added[0]!.id); setReplyId(null); }
    onNotice(added.length ? "ok" : "error", added.length ? `${added.length} Quick Reply set${added.length === 1 ? "" : "s"} imported` : "Nothing was imported",
      added.length ? [...lines, "Switch them on in a chat's Prompt tab, or with “On in every chat”."] : lines);
  };

  return (
    <section className="qr-page" data-testid="quick-replies-page">
      <Toolbar lead={lead} title="Quick Replies" subtitle="Saved messages and snippets"
        trailing={<>
          <Button small onClick={() => file.current?.click()} title="SillyTavern: one exported set, several, or settings.json" data-testid="qr-import"><Icon name="import" size={13} /> Import</Button>
          {data.sets.length > 0 && <Button small variant="plain" data-testid="qr-export-all" title="Every set, as a list SillyTavern can import"
            onClick={() => onExport("quick-replies.json", JSON.stringify(data.sets.map((s) => toStQuickReplySet(s, data.sets)), null, 4))}>Export All</Button>}
          <input ref={file} type="file" accept=".json" multiple hidden data-testid="qr-import-input"
            onChange={(e) => { const fs = [...(e.target.files ?? [])]; e.target.value = ""; if (fs.length) void importFiles(fs); }} />
        </>} />
      <div className="qr-page-body">
        <nav className="qr-sets" aria-label="Quick Reply sets">
          <span className="qr-col-h">Sets</span>
          {data.sets.map((s) => (
            <button key={s.id} type="button" className={`qr-set${set?.id === s.id ? " on" : ""}`} aria-current={set?.id === s.id} data-testid="qr-set"
              onClick={() => { setSetId(s.id); setReplyId(null); }}>
              <span>{s.name}</span><span className="hint">{s.replies.length}{data.global.some((l) => l.setId === s.id) ? " · global" : ""}</span>
            </button>
          ))}
          {data.sets.length === 0 && <p className="hint">Create or import your first set.</p>}
          <span className="grow" />
          <Button small data-testid="qr-new-set" onClick={() => { const s = newSet(data.sets); save({ ...data, sets: [...data.sets, s] }); setSetId(s.id); setReplyId(s.replies[0]!.id); }}><Icon name="plus" size={12} /> New Set</Button>
        </nav>

        {set ? <>
          <div className="qr-set-col">
            <div className="qr-set-head">
              <input className="qr-set-name" aria-label="Set name" value={set.name} data-testid="qr-set-name"
                onChange={(e) => putSet({ ...set, name: e.target.value })}
                onBlur={() => { const n = freeSetName(data.sets, set.name, set.id); if (n !== set.name) putSet({ ...set, name: n }); }} />
              <IconButton label="Export for SillyTavern" data-testid="qr-export" onClick={() => onExport(`${set.name || "quick-replies"}.json`, JSON.stringify(toStQuickReplySet(set, data.sets), null, 4))}><Icon name="download" size={14} /></IconButton>
              <IconButton label="Duplicate set" onClick={() => { const c = { ...set, id: crypto.randomUUID(), name: freeSetName(data.sets, `${set.name} copy`), replies: set.replies.map((r) => ({ ...r, id: crypto.randomUUID() })) }; save({ ...data, sets: [...data.sets, c] }); setSetId(c.id); }}><Icon name="copy" size={14} /></IconButton>
              {sure
                ? <Button small variant="destructive" data-testid="qr-delete-sure" onClick={() => { save(withoutSet(data, set.id)); setSetId(null); }}>Delete “{set.name}”</Button>
                : <IconButton label="Delete set" data-testid="qr-delete" onClick={() => setSure(true)}><Icon name="trash" size={14} /></IconButton>}
            </div>
            <div className="qr-opts">
              <label className="qr-opt"><span className="qr-lbl">On in every chat (Global)</span>
                <Switch label="On in every chat" checked={isGlobal} onChange={(on) => save(withLinks(data, "global", null, on ? [...data.global, { setId: set.id, visible: true }] : data.global.filter((l) => l.setId !== set.id)))} /></label>
              <div className="qr-opt"><span className="qr-lbl">When a button is clicked</span>
                <Segmented small label="When a button is clicked" value={set.send ? "send" : "box"} onChange={(v) => putSet({ ...set, send: v === "send" })}
                  options={[{ value: "send", label: "Send it", testId: "qr-mode-send" }, { value: "box", label: "Put it in the box", testId: "qr-mode-box" }]} /></div>
              <div className="qr-opt"><span className="qr-lbl">What you already typed</span>
                <Segmented small label="What you already typed" value={set.inject ? "keep" : "replace"} onChange={(v) => putSet({ ...set, inject: v === "keep" })}
                  options={[{ value: "replace", label: "Replaced (use {{input}})" }, { value: "keep", label: "Kept, reply added" }]} /></div>
              <div className="qr-opt"><span className="qr-lbl">The reply goes</span>
                <Segmented small label="The reply goes" value={set.before ? "before" : "after"} onChange={(v) => putSet({ ...set, before: v === "before" })}
                  options={[{ value: "after", label: "After your text" }, { value: "before", label: "Before it" }]} /></div>
              {!set.send && <label className="qr-opt"><span className="qr-lbl">Stack <span className="hint">· append on each click</span></span>
                <Switch label="Stack in the box" checked={set.stack} onChange={(stack) => putSet({ ...set, stack })} /></label>}
              <div className="qr-opt"><span className="qr-lbl">Color</span>
                <span className="qr-color">
                  <input type="color" aria-label="Set color" value={set.color && /^#[0-9a-f]{6}$/i.test(set.color) ? set.color : "#7a5c3a"} onChange={(e) => putSet({ ...set, color: e.target.value })} />
                  {set.color && <>
                    <label className="qr-check"><input type="checkbox" checked={set.borderOnly} onChange={(e) => putSet({ ...set, borderOnly: e.target.checked })} /> Only the border</label>
                    <button type="button" className="link quiet" onClick={() => putSet({ ...set, color: "", borderOnly: false })}>Clear</button>
                  </>}
                  {!set.color && <span className="hint">none</span>}
                </span></div>
            </div>
            <span className="qr-col-h">Replies <span className="hint">— drag to change the order</span></span>
            <SortableList items={set.replies} id={(r) => r.id} name={(r) => r.label || "Reply"} label="Replies" itemTestId="qr-reply"
              onReorder={(from, to) => putSet({ ...set, replies: move(set.replies, from, to) })}
              render={(r, handle) => (
                <div className={`qr-reply${reply?.id === r.id ? " on" : ""}`}>
                  {handle}
                  <button type="button" className="qr-reply-open" onClick={() => setReplyId(r.id)} aria-current={reply?.id === r.id}>
                    <span className="qr-reply-name"><Face reply={{ ...r, showLabel: true }} /></span>
                    <span className="hint qr-reply-text">{r.message || "(empty)"}</span>
                    {r.hidden && <span className="rx-chip">only in menus</span>}
                  </button>
                </div>
              )} />
            <Button small variant="plain" data-testid="qr-add-reply" onClick={() => { const r = newReply(); putSet({ ...set, replies: [...set.replies, r] }); setReplyId(r.id); }}><Icon name="plus" size={12} /> Add Quick Reply</Button>
          </div>
          {reply ? <ReplyEditor key={reply.id} reply={reply} set={set} sets={data.sets} onChange={putReply}
            onDuplicate={() => { const c = { ...reply, id: crypto.randomUUID(), label: `${reply.label} copy` }; const i = set.replies.indexOf(reply); putSet({ ...set, replies: [...set.replies.slice(0, i + 1), c, ...set.replies.slice(i + 1)] }); setReplyId(c.id); }}
            onDelete={() => { putSet({ ...set, replies: set.replies.filter((x) => x.id !== reply.id) }); setReplyId(null); }} />
            : <div className="qr-edit"><p className="hint">No replies in this set. Add one.</p></div>}
        </> : <div className="qr-edit"><p className="hint">Select a set to edit it.</p></div>}
      </div>
    </section>
  );
}

function ReplyEditor({ reply: r, set, sets, onChange, onDuplicate, onDelete }: {
  reply: QuickReply; set: QuickReplySet; sets: QuickReplySet[]; onChange: (r: QuickReply) => void; onDuplicate: () => void; onDelete: () => void;
}) {
  const [box, setBox] = useState("I trace the outer ring.");
  const put = (p: Partial<QuickReply>) => onChange({ ...r, ...p });
  const tried = runQuickReply(set, r.message, box);
  const known = iconOf(r.icon);
  const menuFree = sets.filter((s) => !r.menu.some((l) => l.setId === s.id));
  return (
    <div className="qr-edit" data-testid="qr-editor">
      <div className="qr-edit-top">
        <label className="qr-field qr-icon"><span className="qr-lbl">Icon</span>
          <select value={known && isIconName(r.icon) ? r.icon : r.icon ? "__st" : ""} onChange={(e) => { if (e.target.value !== "__st") put({ icon: e.target.value }); }} aria-label="Icon">
            <option value="">None</option>
            {r.icon && !isIconName(r.icon) && <option value="__st">{r.icon.replace(/^.*fa-/, "")} (SillyTavern){known ? "" : " — no drawing"}</option>}
            {ICON_CHOICES.map((n) => <option key={n} value={n}>{n}</option>)}
          </select></label>
        <label className="qr-field"><span className="qr-lbl">Label</span>
          <input value={r.label} onChange={(e) => put({ label: e.target.value })} data-testid="qr-label" /></label>
        <label className="qr-field"><span className="qr-lbl">Tooltip <span className="hint">(empty: the text)</span></span>
          <input value={r.title} placeholder={r.message.slice(0, 80)} onChange={(e) => put({ title: e.target.value })} /></label>
      </div>
      <label className="qr-field qr-grow"><span className="qr-lbl">Text</span>
        <textarea className="qr-text" value={r.message} spellCheck={false} onChange={(e) => put({ message: e.target.value })} data-testid="qr-message" /></label>
      <p className="hint qr-help"><code>{"{{input}}"}</code> inserts the current draft. Supports message macros. Ctrl+click a chat button to edit it.</p>

      <div className="qr-try">
        <span className="qr-lbl">Try it</span>
        <input aria-label="What is in the box" value={box} onChange={(e) => setBox(e.target.value)} placeholder="What is in the box" />
        <pre className="qr-try-out" data-testid="qr-try-out">{tried.send ? `Sends: ${tried.text}` : `The box becomes: ${tried.text}`}</pre>
      </div>

      <div className="qr-menu-edit">
        <span className="qr-lbl">Menu <span className="hint">· open other sets from this reply</span></span>
        {r.menu.map((l, i) => (
          <div key={l.setId} className="qr-menu-link">
            <select aria-label="Set in the menu" value={l.setId} onChange={(e) => put({ menu: r.menu.map((x, j) => (j === i ? { ...x, setId: e.target.value } : x)) })}>
              {sets.filter((s) => s.id === l.setId || !r.menu.some((x) => x.setId === s.id)).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <label className="qr-check" title="This reply's text goes first, then the one picked in the menu"><input type="checkbox" checked={l.chained} onChange={(e) => put({ menu: r.menu.map((x, j) => (j === i ? { ...x, chained: e.target.checked } : x)) })} /> Send this one first</label>
            <IconButton label="Remove from the menu" onClick={() => put({ menu: r.menu.filter((_, j) => j !== i) })}><Icon name="close" size={12} /></IconButton>
          </div>
        ))}
        {menuFree.length > 0 && (
          <select aria-label="Add a set to the menu" value="" onChange={(e) => { if (e.target.value) put({ menu: [...r.menu, { setId: e.target.value, chained: false }] }); }}>
            <option value="">+ Add a set to the menu</option>
            {menuFree.map((s) => <option key={s.id} value={s.id}>{s.name}{s.id === set.id ? " (this set: its hidden replies with an icon)" : ""}</option>)}
          </select>
        )}
      </div>

      <div className="qr-edit-foot">
        <label className="qr-check"><input type="checkbox" checked={r.hidden} onChange={(e) => put({ hidden: e.target.checked })} /> Hidden (only in menus)</label>
        {known && <label className="qr-check"><input type="checkbox" checked={r.showLabel} onChange={(e) => put({ showLabel: e.target.checked })} /> Show the label with the icon</label>}
        <span className="grow" />
        <Button small variant="plain" onClick={onDuplicate}>Duplicate</Button>
        <Button small variant="plain" onClick={onDelete} data-testid="qr-delete-reply">Delete</Button>
      </div>
    </div>
  );
}
