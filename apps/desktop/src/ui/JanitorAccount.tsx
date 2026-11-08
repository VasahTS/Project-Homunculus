// JanitorAI's account line in the Card Browser (D-098): who is signed in in JanitorAI's own window, Sign In… / Sign Out.
// Same controls and classes as BotbooruAccount (CODEX). The app never sees the password or the token. CLAUDE, 2026-11-08.
import { useEffect, useRef, useState } from "react";
import type { JanitorAccountState, SiteTransport } from "@homunculus/card-browser";
import { Button } from "./kit.tsx";

export function JanitorAccount({ transport, onChange }: { transport: SiteTransport; onChange: (a: JanitorAccountState) => void }) {
  const [account, setAccount] = useState<JanitorAccountState | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const seq = useRef(0), last = useRef<string | null | undefined>(undefined);
  const read = async (action: "status" | "logout" = "status", force = false) => {
    const id = ++seq.current; setBusy(true); setError("");
    try {
      if (!transport.janitorAccount) throw new Error("JanitorAI works in the desktop app.");
      const a = await transport.janitorAccount(action);
      if (id !== seq.current) return;
      setAccount(a);
      // the first answer only sets the line; a change (signing in or out) starts the search again
      if (force || (last.current !== undefined && (action === "logout" || last.current !== a.username))) onChange(a);
      last.current = a.username;
    } catch (e) { if (id === seq.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (id === seq.current) setBusy(false); }
  };
  const signIn = async () => {
    setError("");
    try { await transport.janitorAccount?.("open"); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  useEffect(() => {
    void read();
    // back from JanitorAI's window: see whether the sign-in changed
    const focus = () => { void read(); };
    window.addEventListener("focus", focus);
    return () => { ++seq.current; window.removeEventListener("focus", focus); };
  }, [transport]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="cb-account" data-testid="cb-janitor-account">
    <span className="hint" role="status">{account?.username ? `Signed in to JanitorAI as ${account.username}` : account ? "Browsing JanitorAI without an account." : busy ? "Opening JanitorAI…" : ""}</span>
    <div className="cb-notice-actions">
      {account?.username
        ? <Button small disabled={busy} onClick={() => void read("logout")}>Sign Out</Button>
        : <Button small disabled={busy && !account} onClick={() => void signIn()}>Sign In…</Button>}
      <Button small disabled={busy} onClick={() => void read("status", true)}>Refresh</Button>
    </div>
    <span className="hint">You sign in on JanitorAI's own page; this app never sees your password. Cards whose creator hides the definition can be read here but not added.</span>
    {error && <span role="alert" className="hint">{error}</span>}
  </div>;
}
