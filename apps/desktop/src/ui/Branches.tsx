// Homunculus 2 — branches of a chat in the UI (D-032, canvas "Homunculus 2 — Branches"). Author: CLAUDE, 2026-10-29.
// v2 (29/10, after Daniel's test): direct, like SillyTavern and Marinara — "Branch from here" makes the branch and
// puts you on it at once; a branch is a named end (core/branches.ts `resolveBranches`). The list in the chat's toolbar
// ("⑂ Main ▾"), the marker where the story splits and the tree of the whole chat.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from "react";
import type { Message } from "@homunculus/schemas";
import { resolveBranches, splitPoints, type ChatBranch, type MessageLink } from "@homunculus/core";
import type { AppServices } from "../core-instance.ts";
import { Button, Icon, IconButton, Segmented } from "./kit.tsx";
import { lastLineOf } from "./Sidebar.tsx";
import { Modal } from "./Vault.tsx";

export interface BranchesInfo {
  list: ChatBranch[];
  /** Messages after which branches go different ways, with the branches that pass them. */
  forks: Map<string, ChatBranch[]>;
  links: MessageLink[];
  /** The newest line of each branch's end, by end id. */
  lines: Record<string, string>;
  loaded: boolean;
}

const EMPTY: BranchesInfo = { list: [], forks: new Map(), links: [], lines: {}, loaded: false };

/** Loads a chat's branches and keeps their rows right (old rows become ends, a chat gets its "Main"). */
export async function loadBranches(svc: AppServices, sessionId: string): Promise<BranchesInfo> {
  const links = await svc.store.messageLinks(sessionId);
  const rows = await svc.store.listBranches(sessionId);
  const { branches, save, remove } = resolveBranches(links, rows, () => crypto.randomUUID());
  for (const r of save) await svc.store.saveBranch({ ...r, sessionId });
  for (const id of remove) await svc.store.deleteBranch(id);
  const lines: Record<string, string> = {};
  for (const b of branches) if (b.endId && !(b.endId in lines)) { const m = await svc.store.getMessage(b.endId); if (m) lines[b.endId] = lastLineOf(m.content); }
  return { list: branches, forks: splitPoints(branches), links, lines, loaded: true };
}

/** The branches of a session; `reload` loads them again (one load at a time) and returns them. */
export function useBranches(svc: AppServices, sessionId: string, refreshKey: unknown): [BranchesInfo, () => Promise<BranchesInfo>] {
  const [info, setInfo] = useState<BranchesInfo>(EMPTY);
  const chain = useRef<Promise<BranchesInfo>>(Promise.resolve(EMPTY));
  const loadOnce = useCallback(async () => { const i = await loadBranches(svc, sessionId); setInfo(i); return i; }, [svc, sessionId]);
  const load = useCallback(() => (chain.current = chain.current.then(loadOnce, loadOnce)), [loadOnce]);
  useEffect(() => { setInfo(EMPTY); }, [sessionId]);
  useEffect(() => { void load(); }, [load, refreshKey]);
  return [info, load];
}

/** Everything under a message (itself included). */
export function subtreeOf(links: MessageLink[], id: string): string[] {
  const kids = new Map<string | null, string[]>();
  for (const l of links) kids.set(l.parentId, [...(kids.get(l.parentId) ?? []), l.id]);
  const out: string[] = [];
  const stack = [id];
  while (stack.length) { const x = stack.pop()!; out.push(x); stack.push(...(kids.get(x) ?? [])); }
  return out;
}

const when = (t: number) => {
  const d = new Date(t);
  return d.toDateString() === new Date().toDateString() ? "today" : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

// ------------------------------------------------------------------------------------------------ the list
export function BranchMenu({ info, current, fresh = false, onGo, onRename, onDelete, onTree, onSeparate }: {
  info: BranchesInfo; current: ChatBranch | undefined;
  /** The branch on screen was just made: the button says so for a moment. */
  fresh?: boolean;
  onGo: (b: ChatBranch) => void; onRename: (b: ChatBranch, name: string) => void; onDelete: (b: ChatBranch) => void;
  onTree: () => void; onSeparate: (b: ChatBranch) => void;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open]);
  // the one on screen first, then the most recent (Marinara's Chat Branches list)
  const ordered = [...(current ? [current] : []), ...info.list.filter((b) => b !== current).sort((a, b) => b.lastAt - a.lastAt)];
  const commit = (b: ChatBranch) => { const n = draft.trim(); if (n && n !== b.name) onRename(b, n); setRenaming(null); };
  return (
    <span className="play-wrap">
      <Button variant="plain" className={`branch-btn${open ? " on" : ""}${fresh ? " fresh" : ""}`} aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="branch-button"
        title="Branches of this chat">
        <Icon name="branch" size={14} /> {current?.name ?? "Main"} ▾
      </Button>
      {fresh && <span className="branch-fresh" role="status">New branch · you are on it</span>}
      {open && (
        <>
          <div className="pop-scrim" onClick={() => setOpen(false)} />
          <section className="popover branch-pop" aria-label="Branches of this chat" data-testid="branch-list">
            <div className="branch-pop-head"><span>Branches · {info.list.length}</span></div>
            {ordered.map((b) => {
              const here = b === current;
              if (deleting === b.recordId) {
                return (
                  <div key={b.recordId} className="branch-row del" data-testid="branch-delete-confirm">
                    <span className="branch-t static"><strong>Delete {b.name} for good?</strong>
                      <small>{b.own.length
                        ? `Its ${b.own.length} own message${b.own.length === 1 ? "" : "s"} and their world state go away. It does not go to the Trash. Messages other branches use stay.`
                        : "All its messages are used by other branches, so only the branch goes away."}</small></span>
                    <span className="row-line end"><Button small onClick={() => setDeleting(null)}>Cancel</Button>
                      <Button small variant="destructive" onClick={() => { setDeleting(null); onDelete(b); }}>Delete Forever</Button></span>
                  </div>
                );
              }
              return (
                <div key={b.recordId} className={`branch-row${here ? " on" : ""}`} data-testid="branch-row">
                  {renaming === b.recordId ? (
                    <input className="branch-rename" autoFocus aria-label={`Name of ${b.name}`} value={draft} onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => commit(b)} onKeyDown={(e) => { if (e.key === "Enter") commit(b); if (e.key === "Escape") { e.stopPropagation(); setRenaming(null); } }} />
                  ) : (
                    <button type="button" className="branch-t" onClick={() => { setOpen(false); onGo(b); }} disabled={here}>
                      <strong>{b.name}{here && <span className="here-chip">you are here</span>}</strong>
                      <q>{info.lines[b.endId ?? ""] || "—"}</q>
                      <small>{b.path.length} message{b.path.length === 1 ? "" : "s"} · {when(b.lastAt)}{!b.own.length && b.path.length ? " · ends where the story splits" : b.forkAt ? ` · from message ${b.path.indexOf(b.forkAt) + 1}` : ""}</small>
                    </button>
                  )}
                  <IconButton label={`Rename ${b.name}`} onClick={() => { setRenaming(b.recordId); setDraft(b.name); }}><Icon name="pencil" size={14} /></IconButton>
                  {info.list.length > 1 && (
                    <IconButton label={here ? `Delete ${b.name} (switch to another branch first)` : `Delete ${b.name}`} disabled={here}
                      onClick={() => setDeleting(b.recordId)}><Icon name="trash" size={14} /></IconButton>
                  )}
                </div>
              );
            })}
            <div className="branch-pop-foot">
              <Button small onClick={() => { setOpen(false); onTree(); }} data-testid="show-tree">Show Tree</Button>
              {current && <Button small onClick={() => { setOpen(false); onSeparate(current); }} title="A new chat with this branch's messages and world state">Make a Separate Chat</Button>}
            </div>
          </section>
        </>
      )}
    </span>
  );
}

// ------------------------------------------------------------------------------------------------ the marker
export function ForkMarker({ through, current, lines, onGo }: {
  through: ChatBranch[]; current: ChatBranch | undefined; lines: Record<string, string>; onGo: (b: ChatBranch) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="play-wrap fork-wrap">
      <button type="button" className="fork-marker" aria-expanded={open} onClick={() => setOpen((v) => !v)} data-testid="fork-marker">
        <Icon name="branch" size={13} /> The story splits here · {through.length} branches {open ? "▾" : "▸"}
      </button>
      {open && (
        <>
          <div className="pop-scrim" onClick={() => setOpen(false)} />
          <ForkPop>
            {through.map((b) => (
              <div key={b.recordId} className="branch-row compact">
                <span className="branch-t static"><strong>{b.name}{b === current && <span className="here-chip">you are here</span>}</strong>
                  <q>{lines[b.endId ?? ""] || "—"}</q></span>
                {b !== current && <Button small onClick={() => { setOpen(false); onGo(b); }}>Go</Button>}
              </div>
            ))}
          </ForkPop>
        </>
      )}
    </span>
  );
}

function ForkPop({ children }: { children: ReactNode }) {
  const up = useOpenUp<HTMLElement>();
  return <section ref={up.ref} className={`popover fork-pop${up.up ? " up" : ""}`} aria-label="Branches from here">{children}</section>;
}

/**
 * A popover that opens below its button, or above it when there is no room below (the last message sits right
 * over the message box: the form used to open under it, cut off by the composer).
 */
export function useOpenUp<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [up, setUp] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    const scroller = el?.closest(".story") ?? null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const bottom = scroller ? scroller.getBoundingClientRect().bottom : window.innerHeight;
    if (r.bottom > bottom - 8) setUp(true);
  }, []);
  return { ref, up };
}

// ------------------------------------------------------------------------------------------------ the tree
interface TreeNodeView { m: Message; versions: number; version: number }

export function TreeSheet({ svc, sessionId, title, info, current, speakerName, onGoTo, onBranchFrom, onClose }: {
  svc: AppServices; sessionId: string; title: string; info: BranchesInfo; current: ChatBranch | undefined;
  speakerName: (m: Message) => string;
  /** Show a branch that holds this message, at that message. */
  onGoTo: (b: ChatBranch, messageId: string) => void;
  onBranchFrom: (messageId: string) => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [compact, setCompact] = useState<"all" | "splits">("all");
  const [selected, setSelected] = useState<string | null>(current?.endId ?? null);
  useEffect(() => { void svc.store.messagesOf(sessionId).then(setMessages); }, [svc, sessionId]);
  const kids = useMemo(() => {
    const k = new Map<string | null, Message[]>();
    for (const m of messages ?? []) k.set(m.parentId, [...(k.get(m.parentId) ?? []), m]);
    return k;
  }, [messages]);
  const byId = useMemo(() => new Map((messages ?? []).map((m) => [m.id, m])), [messages]);
  const onPath = new Set(current?.path ?? []);
  /** Messages some branch uses: the tree follows these; the other children are versions (swipes). */
  const used = useMemo(() => new Set(info.list.flatMap((b) => b.path)), [info.list]);
  const number = (id: string) => (info.list.find((b) => b.path.includes(id))?.path.indexOf(id) ?? -1) + 1;
  const branchesThrough = (id: string) => info.list.filter((b) => b.path.includes(id));

  /** One lane: the messages from `first` down to the next split (or the end), then the lanes it splits into. */
  const lane = (parent: string | null, first: Message | null, depth: number): ReactElement[] => {
    const seq: TreeNodeView[] = [];
    let at: string | null = parent;
    let next: Message | null = first;
    let split: Message[] = [];
    for (;;) {
      const children = kids.get(at) ?? [];
      if (!children.length) break;
      const onBranches = children.filter((c) => used.has(c.id));
      if (next === null) {
        if (onBranches.length > 1) { split = onBranches; break; }
        if (!onBranches.length) break;
        next = onBranches[0]!;
      }
      // versions = the siblings no branch uses (a sibling a branch uses is shown as its own lane)
      const versions = children.filter((c) => c === next || !used.has(c.id));
      seq.push({ m: next, versions: versions.length, version: versions.indexOf(next) + 1 });
      at = next.id;
      next = null;
    }
    const rows: ReactElement[] = [];
    const show = compact === "splits" && seq.length > 3 ? [seq[0]!, null, seq[seq.length - 1]!] : seq;
    show.forEach((n, i) => {
      if (!n) { rows.push(<div key={`gap-${depth}-${i}`} className="tree-gap">· {seq.length - 2} messages ·</div>); return; }
      const fork = info.forks.get(n.m.id);
      rows.push(
        <button key={n.m.id} type="button" className={`tree-node${selected === n.m.id ? " sel" : ""}`} onClick={() => setSelected(n.m.id)} data-testid="tree-node">
          <span className={`tree-dot${onPath.has(n.m.id) ? " cur" : ""}`} aria-hidden />
          <span className="tree-t">
            <span className="tree-w">{number(n.m.id) || "·"} · {speakerName(n.m)}
              {n.versions > 1 && <span className="chip">{n.versions} versions</span>}
              {fork && <span className="chip fork">splits · {fork.length} branches</span>}
            </span>
            <span className={`tree-l${n.m.speaker.kind === "user" ? " user" : ""}`}>{lastLineOf(n.m.content) || "—"}</span>
          </span>
        </button>,
      );
    });
    for (const c of split) {
      const bs = branchesThrough(c.id);
      const cur = bs.some((b) => b === current);
      rows.push(
        <div key={`lane-${c.id}`} className={`tree-lane${cur ? " cur" : ""}`}>
          {bs.length === 1 && (
            <div className="tree-lane-head">{bs[0]!.name}{bs[0] === current && <span className="here-chip">you are here</span>}
              <small>{bs[0]!.path.length} messages</small></div>
          )}
          {lane(c.parentId, c, depth + 1)}
        </div>,
      );
    }
    return rows;
  };

  const sel = selected ? byId.get(selected) : undefined;
  const selBranch = sel ? (current?.path.includes(sel.id) ? current : branchesThrough(sel.id)[0]) : undefined;
  const startHere = sel ? info.list.filter((b) => b.forkAt === sel.id && b !== current) : [];
  const siblings = sel ? kids.get(sel.parentId) ?? [] : [];
  return (
    <Modal title={title} onClose={onClose} testId="tree-sheet" className="modal-tree"
      head={<>
        <span className="hint">Tree · {info.list.length} branch{info.list.length === 1 ? "" : "es"}</span>
        <span className="grow" />
        <Segmented small label="Show" value={compact} onChange={setCompact} options={[{ value: "all", label: "Every message" }, { value: "splits", label: "Only where it splits" }]} />
      </>}>
      <div className="tree-body">
        <div className="tree" role="tree" aria-label="Messages and branches">{messages ? lane(null, null, 0) : <p className="hint">Loading…</p>}</div>
        <div className="tree-side">
          {sel ? (
            <>
              <span className="setup-title">Message {number(sel.id)}{selBranch ? ` · ${selBranch.name}` : ""}</span>
              <div className="tree-card">
                <p className={sel.speaker.kind === "user" ? "" : "prose"}>{sel.content}</p>
                <span className="hint">{speakerName(sel)}{siblings.length > 1 ? ` · version ${siblings.indexOf(sel) + 1} of ${siblings.length}` : ""}</span>
              </div>
              <span className="row-line">
                {selBranch && <Button variant="prominent" onClick={() => { onClose(); onGoTo(selBranch, sel.id); }} data-testid="tree-go">Go Here</Button>}
                <Button onClick={() => { onClose(); onBranchFrom(sel.id); }}>Branch from here</Button>
              </span>
              {startHere.length > 0 && (
                <>
                  <span className="setup-title">Branches that split here</span>
                  {startHere.map((b) => <div key={b.recordId} className="tree-card small"><strong>{b.name}</strong><span className="hint">{b.path.length} messages · last: “{info.lines[b.endId ?? ""] || "—"}”</span></div>)}
                </>
              )}
            </>
          ) : <p className="hint">Pick a message to read it, go to it or branch from it.</p>}
          <span className="tree-legend"><span><span className="tree-dot cur" aria-hidden /> the path on screen</span><span><span className="tree-dot" aria-hidden /> other branches</span></span>
        </div>
      </div>
    </Modal>
  );
}
