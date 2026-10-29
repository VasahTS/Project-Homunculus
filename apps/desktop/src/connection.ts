// Homunculus 2 — connection profiles in the app: saved profiles + their API keys (hook). Author: CLAUDE, 2026-10-23;
// 2026-10-28 (slice 1b): several named profiles in the database instead of one connection in the browser storage.
// Keys never go in the database: one per provider + address, in the Windows Credential Manager (D-011).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConnectionProfile, type Session, type SetupLayer } from "@homunculus/schemas";
import { profileToConfig, type ConnectionConfig, type SqlStore } from "@homunculus/core";
import { apiKeyName, secrets } from "./secrets.ts";

export type KeyStatus = { kind: "empty" } | { kind: "saved" } | { kind: "unsaved" } | { kind: "error"; message: string };

/** Providers that don't use a key (the offline test AI). */
export const needsKey = (providerId: string) => providerId !== "offline-test";
export const keyNameOf = (p: Pick<ConnectionProfile, "providerId" | "baseUrl">) => apiKeyName(p.providerId, p.baseUrl);
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** A readable name for a connection made from an address and a model ("nano-gpt.com — glm-5.3:thinking"). */
export function suggestName(providerId: string, baseUrl: string, model: string): string {
  if (!needsKey(providerId)) return "Offline test AI";
  let host = "OpenRouter";
  try { if (baseUrl.trim()) host = new URL(baseUrl.trim()).host.replace(/^api\./, ""); } catch { host = baseUrl.trim(); }
  return model.trim() ? `${host} — ${model.trim()}` : host;
}

const LEGACY_KEY = "homunculus.connection";
const INSTALLED = "connectionsInstalled";

/**
 * First start after slice 1b: turns the old single connection (kept in browser storage) into a saved
 * profile and makes it the default; always adds an "Offline test AI" profile. Runs once. The old key
 * keeps working because keys are found by provider + address, which do not change.
 */
export async function installConnectionProfiles(store: SqlStore): Promise<void> {
  if (await store.getAppSetting(INSTALLED)) return;
  if ((await store.connections.list()).length === 0) {
    const offline = await store.saveConnectionProfile({ id: "offline-test", name: "Offline test AI", providerId: "offline-test" });
    let defaultId = offline.id;
    try {
      const raw = localStorage.getItem(LEGACY_KEY);
      const old = raw ? (JSON.parse(raw) as { providerId?: string; model?: string; baseUrl?: string; params?: Record<string, number> }) : null;
      if (old?.providerId && old.providerId !== "offline-test") {
        const p = old.params ?? {};
        const saved = await store.saveConnectionProfile({
          id: crypto.randomUUID(), name: suggestName(old.providerId, old.baseUrl ?? "", old.model ?? ""),
          providerId: old.providerId, baseUrl: old.baseUrl ?? "", model: old.model ?? "",
          params: { temperature: p.temperature, topP: p.topP, maxTokens: p.maxTokens },
        });
        defaultId = saved.id;
      }
    } catch { /* no old connection, or storage unavailable */ }
    const layer = await store.getDefaultSetup();
    if (!layer.connectionId) await store.setDefaultSetup({ ...layer, connectionId: defaultId });
  }
  await store.setAppSetting(INSTALLED, true);
}

export function useConnections(store: SqlStore | null) {
  const [profiles, setProfiles] = useState<ConnectionProfile[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [defaultAgentId, setDefaultAgentId] = useState<string | null>(null);
  /** Keys by key name (provider + address): saved ones, and ones being typed. */
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<Record<string, KeyStatus>>({});
  /** Keys typed but not saved yet: a reload must not throw them away. */
  const unsaved = useRef(new Set<string>());
  /** Key names already read from the keychain (read once; later changes go through this hook). */
  const known = useRef(new Set<string>());
  const keepUnsaved = <T,>(old: Record<string, T>) => Object.fromEntries(Object.entries(old).filter(([n]) => unsaved.current.has(n)));

  const reload = useCallback(async () => {
    if (!store) return;
    const [ps, layer] = await Promise.all([store.connections.list(), store.getDefaultSetup()]);
    setProfiles(ps);
    setDefaultId(layer.connectionId ?? null);
    setDefaultAgentId(layer.agentConnectionId ?? null);
    // load the keys we don't have yet
    const names = [...new Set(ps.filter((p) => needsKey(p.providerId)).map(keyNameOf))].filter((n) => !known.current.has(n));
    for (const n of names) known.current.add(n);
    const found: Record<string, string> = {};
    const st: Record<string, KeyStatus> = {};
    await Promise.all(names.map(async (n) => {
      try { const k = await secrets.get(n); if (k) found[n] = k; st[n] = k ? { kind: "saved" } : { kind: "empty" }; }
      catch (e) { st[n] = { kind: "error", message: message(e) }; }
    }));
    if (names.length) {
      setKeys((old) => ({ ...old, ...found, ...keepUnsaved(old) }));
      setStatus((old) => ({ ...old, ...st, ...keepUnsaved(old) }));
    }
  }, [store]);

  useEffect(() => { void reload(); }, [reload]);

  const byId = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);
  const configs = useMemo(() => {
    const out: Record<string, ConnectionConfig> = {};
    for (const p of profiles) out[p.id] = profileToConfig(p, byId, (x) => keys[keyNameOf(x)]);
    return out;
  }, [profiles, byId, keys]);

  const save = async (p: ConnectionProfile) => { if (!store) return; await store.saveConnectionProfile(p); await reload(); };
  /** Returns how many sessions went back to the default. */
  const remove = async (id: string) => { if (!store) return 0; const n = await store.deleteConnectionProfile(id); await reload(); return n; };
  const setDefault = async (patch: { connectionId?: string | null; agentConnectionId?: string | null }) => {
    if (!store) return;
    const layer = await store.getDefaultSetup();
    await store.setDefaultSetup({ ...layer, ...patch });
    await reload();
  };

  const keyStatus = (p: Pick<ConnectionProfile, "providerId" | "baseUrl">): KeyStatus => status[keyNameOf(p)] ?? { kind: "empty" };
  const keyOf = (p: Pick<ConnectionProfile, "providerId" | "baseUrl">) => keys[keyNameOf(p)] ?? "";
  const typeKey = (p: Pick<ConnectionProfile, "providerId" | "baseUrl">, key: string) => {
    const n = keyNameOf(p);
    unsaved.current.add(n);
    setKeys((k) => ({ ...k, [n]: key }));
    setStatus((s) => ({ ...s, [n]: { kind: "unsaved" } }));
  };
  const saveKey = async (p: Pick<ConnectionProfile, "providerId" | "baseUrl">) => {
    const n = keyNameOf(p);
    const key = (keys[n] ?? "").trim();
    unsaved.current.delete(n);
    try {
      if (key) { await secrets.set(n, key); setStatus((s) => ({ ...s, [n]: { kind: "saved" } })); }
      else { await secrets.delete(n); setStatus((s) => ({ ...s, [n]: { kind: "empty" } })); }
    } catch (e) { setStatus((s) => ({ ...s, [n]: { kind: "error", message: message(e) } })); }
  };
  /** Looks up a saved key for an address the profile now uses (after the address was changed). */
  const loadKey = async (p: Pick<ConnectionProfile, "providerId" | "baseUrl">) => {
    const n = keyNameOf(p);
    if (known.current.has(n)) return;
    known.current.add(n);
    try { const k = await secrets.get(n); setKeys((x) => ({ ...x, [n]: k ?? "" })); setStatus((s) => ({ ...s, [n]: k ? { kind: "saved" } : { kind: "empty" } })); }
    catch (e) { setStatus((s) => ({ ...s, [n]: { kind: "error", message: message(e) } })); }
  };
  const forgetKey = async (p: Pick<ConnectionProfile, "providerId" | "baseUrl">) => {
    const n = keyNameOf(p);
    unsaved.current.delete(n);
    setKeys((k) => ({ ...k, [n]: "" }));
    try { await secrets.delete(n); setStatus((s) => ({ ...s, [n]: { kind: "empty" } })); }
    catch (e) { setStatus((s) => ({ ...s, [n]: { kind: "error", message: message(e) } })); }
  };

  /** The default connection's settings: used when a setup picks none. */
  const fallbackConfig = (): ConnectionConfig =>
    (defaultId ? configs[defaultId] : undefined) ?? Object.values(configs)[0] ?? { providerId: "offline-test", model: "offline" };

  /** What a turn needs: the default connection and every profile by id (the session's setup picks). */
  const forRequest = () => ({ connection: fallbackConfig(), connections: configs });

  /** The profile a session writes the story with (its own choice, else the default). */
  /** The connection that writes a session: its own, else its story's (`above`), else the default. */
  const storyProfileFor = (s: Session | null, above?: SetupLayer): ConnectionProfile | undefined => {
    const id = s?.setup.connectionId ?? above?.connectionId ?? defaultId;
    return (id ? byId.get(id) : undefined) ?? byId.get(defaultId ?? "") ?? profiles[0];
  };

  return {
    profiles, byId, defaultId, defaultAgentId, configs, reload, save, remove, setDefault,
    keyStatus, keyOf, typeKey, saveKey, loadKey, forgetKey, forRequest, storyProfileFor,
    persistentKeys: secrets.persistent,
  };
}

export type ConnectionState = ReturnType<typeof useConnections>;

export const newProfile = (): ConnectionProfile => ConnectionProfile.parse({
  id: crypto.randomUUID(), name: "New connection", providerId: "openai-compatible", baseUrl: "", model: "",
});
