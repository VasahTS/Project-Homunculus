// Homunculus 2 — Library → Agents (slice 5, D-047). Author: CLAUDE, 2026-10-30.
// Two views (Daniel: a table, "and other views would be good for the app"): a sortable Table that fills the page, and
// a List grouped by what each agent does, beside the editor. The view is remembered on this computer.
import { useState, type ReactNode } from "react";
import type { AgentConfig, Session, Story } from "@homunculus/schemas";
import { AGENT_KINDS, kindOf, onInText, whenText } from "../agents.ts";
import { Button, Icon, Segmented } from "./kit.tsx";
import { EmptyDetail, MasterDetail, SearchBox } from "./LibraryPages.tsx";
import { Toolbar } from "./Toolbar.tsx";

type View = "table" | "list";
type SortKey = "name" | "kind" | "when" | "on";
const VIEW_KEY = "h2.agentsView";
const readView = (): View => { try { return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "table"; } catch { return "table"; } };

export function AgentsPage({ lead, tabs, agents, stories, sessions, selectedId, onSelect, onNew, detail }: {
  lead: ReactNode;
  tabs?: ReactNode;
  agents: AgentConfig[];
  stories: Story[];
  sessions: Session[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onNew: () => void;
  /** The editor of the selected agent. */
  detail: ReactNode;
}) {
  const [view, setViewState] = useState<View>(readView);
  const setView = (v: View) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* the view is a convenience */ } };
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string>("all");
  const [sort, setSort] = useState<{ key: SortKey; up: boolean }>({ key: "name", up: true });
  const needle = q.trim().toLowerCase();
  const filtered = agents.filter((a) => (kind === "all" || a.output === kind) && (!needle || `${a.name} ${a.help}`.toLowerCase().includes(needle)));
  const value = (a: AgentConfig, k: SortKey) => k === "name" ? a.name : k === "kind" ? kindOf(a)?.label ?? "" : k === "when" ? whenText(a) : onInText(a.id, stories, sessions);
  const sorted = [...filtered].sort((a, b) => value(a, sort.key).localeCompare(value(b, sort.key)) * (sort.up ? 1 : -1) || a.name.localeCompare(b.name));
  const head = (k: SortKey, label: string) => (
    <th aria-sort={sort.key === k ? (sort.up ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => setSort((s) => ({ key: k, up: s.key === k ? !s.up : true }))}>{label}{sort.key === k ? (sort.up ? " ↑" : " ↓") : ""}</button>
    </th>
  );
  const counts = new Map(AGENT_KINDS.map((k) => [k.output, agents.filter((a) => a.output === k.output).length]));
  const filters = (
    <div className="ag-filters" role="radiogroup" aria-label="Show agents that">
      <button type="button" role="radio" aria-checked={kind === "all"} className={`fchip${kind === "all" ? " on" : ""}`} onClick={() => setKind("all")}>All {agents.length}</button>
      {AGENT_KINDS.filter((k) => counts.get(k.output)).map((k) => (
        <button key={k.output} type="button" role="radio" aria-checked={kind === k.output} className={`fchip${kind === k.output ? " on" : ""}`} onClick={() => setKind(k.output)}>{k.short}</button>
      ))}
    </div>
  );
  const empty = agents.length === 0
    ? <p className="hint ag-empty">No agents yet. <button type="button" className="link" onClick={onNew}>Make one</button>.</p>
    : filtered.length === 0 ? <p className="hint ag-empty">No agent matches.</p> : null;

  return (
    <div className="page">
      <Toolbar lead={lead} title="Agents" center={tabs} subtitle="Rules, rewrites, checks, choices and notes around each reply"
        trailing={<>
          <Segmented small label="View" value={view} onChange={setView} options={[{ value: "table", label: "Table", testId: "agents-view-table" }, { value: "list", label: "List", testId: "agents-view-list" }]} />
          <Button onClick={onNew}><Icon name="plus" size={14} /> New Agent</Button>
        </>} />
      {view === "table" ? (
        <div className="master-detail">
          {selectedId && detail ? <div className="detail">{detail}</div> : (
            <div className="detail ag-table-wrap" data-region="library">
              <div className="ag-table-tools">{filters}<SearchBox value={q} onChange={setQ} label="Search agents" /></div>
              <div className="ag-table-scroll">
                <table className="ag-table" data-testid="agent-table">
                  <thead><tr>{head("name", "Name")}{head("kind", "What it does")}{head("when", "When")}{head("on", "On in")}</tr></thead>
                  <tbody>
                    {sorted.map((a) => {
                      const k = kindOf(a);
                      return (
                        <tr key={a.id} data-testid="agent-row" tabIndex={0} onClick={() => onSelect(a.id)} onKeyDown={(e) => { if (e.key === "Enter") onSelect(a.id); }}>
                          <td><span className="ag-cell-name">{a.name}</span>{a.help && <small>{a.help}</small>}</td>
                          <td><span className="kind-dot" style={{ background: k?.color }} />{k?.label}</td>
                          <td>{whenText(a)}{a.conditions.probability < 100 ? ` · ${a.conditions.probability}%` : ""}</td>
                          <td>{onInText(a.id, stories, sessions)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {empty}
              </div>
            </div>
          )}
        </div>
      ) : (
        <MasterDetail
          list={<>
            <SearchBox value={q} onChange={setQ} label="Search agents" />
            {filters}
            <div className="ag-groups" data-testid="agent-list">
              {AGENT_KINDS.map((k) => {
                const items = filtered.filter((a) => a.output === k.output);
                if (!items.length) return null;
                return (
                  <div key={k.output} className="ag-group">
                    <span className="ag-group-title"><span className="kind-dot" style={{ background: k.color }} />{k.label}</span>
                    <ul className="master-list">
                      {items.map((a) => (
                        <li key={a.id}>
                          <button className={`master-item${a.id === selectedId ? " on" : ""}`} onClick={() => onSelect(a.id)}>
                            <span className="side-text"><strong>{a.name}</strong><span>{whenText(a)} · on in {onInText(a.id, stories, sessions)}</span></span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              {empty}
            </div>
          </>}
          detail={detail ?? <EmptyDetail text="Pick an agent on the left, or make a new one. Switch agents on per story or chat in their setup, or from the ✦ button in a chat." />}
        />
      )}
    </div>
  );
}
