// Homunculus 2 — API keys in the OS keychain (D-011). Author: CLAUDE, 2026-10-23.
// Desktop: Windows Credential Manager via Rust commands. Browser preview: memory only.
import { isDesktop } from "./db.ts";

export interface SecretStore {
  readonly persistent: boolean;
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
}

class KeychainSecrets implements SecretStore {
  readonly persistent = true;
  private async invoke<T>(cmd: string, args: Record<string, unknown>): Promise<T> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(cmd, args);
  }
  get(name: string) { return this.invoke<string | null>("secret_get", { name }); }
  set(name: string, value: string) { return this.invoke<void>("secret_set", { name, value }); }
  delete(name: string) { return this.invoke<void>("secret_delete", { name }); }
}

class MemorySecrets implements SecretStore {
  readonly persistent = false;
  private values = new Map<string, string>();
  async get(name: string) { return this.values.get(name) ?? null; }
  async set(name: string, value: string) { this.values.set(name, value); }
  async delete(name: string) { this.values.delete(name); }
}

export const secrets: SecretStore = isDesktop ? new KeychainSecrets() : new MemorySecrets();

/** One key per provider + address, so OpenRouter and a local server keep separate keys. */
export function apiKeyName(providerId: string, baseUrl?: string): string {
  const address = (baseUrl ?? "").trim().replace(/\/+$/, "") || "default";
  return `api-key:${providerId}:${address}`;
}
