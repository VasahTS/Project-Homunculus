// Account controls reuse the Card Browser's existing buttons and text. CODEX, 2026-11-02.
import { useEffect, useRef, useState } from "react";
import type { BotbooruAccountState, SiteTransport } from "@homunculus/card-browser";
import { Button } from "./kit.tsx";
export function BotbooruAccount({ transport, onChange }: { transport: SiteTransport; onChange: (a: BotbooruAccountState) => void }) {
  const [account, setAccount] = useState<BotbooruAccountState | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const seq = useRef(0), last = useRef("");
  const read = async (action: "status" | "open" | "logout" = "status", force = false) => {
    const id = ++seq.current; setBusy(true); setError("");
    try {
      if (!transport.botbooruAccount) throw new Error("BotBooru accounts work in the desktop app.");
      const a = await transport.botbooruAccount(action);
      if (id !== seq.current) return;
      setAccount(a); const next = JSON.stringify(a);
      if (force || action === "logout" || last.current !== next) { last.current = next; onChange(a); }
    } catch (e) { if (id === seq.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (id === seq.current) setBusy(false); }
  };
  useEffect(() => {
    void read();
    const focus = () => { void read(); };
    window.addEventListener("focus", focus);
    return () => { ++seq.current; window.removeEventListener("focus", focus); };
  }, [transport]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="cb-account" data-testid="cb-account">
    <span className="hint" role="status">{account?.username ? "Signed in as " + account.username + " · NSFW: " + (account.showNsfw ? "On" : "Off") + " · NSFL: " + (account.showNsfl ? "On" : "Off") : "Sign in to browse NSFW and NSFL cards."}</span>
    <div className="cb-notice-actions">
      <Button small disabled={busy} onClick={() => void read("open")}>Account…</Button>
      <Button small disabled={busy} onClick={() => void read("status", true)}>Refresh Account</Button>
      {account?.username && <Button small disabled={busy} onClick={() => void read("logout")}>Sign Out</Button>}
    </div>
    <span className="hint">Enable NSFW and NSFL in your BotBooru account, then refresh. The NSFW switch here filters this browser.</span>
    {error && <span role="alert" className="hint">{error}</span>}
  </div>;
}
