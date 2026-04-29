import { randomBytes } from "node:crypto";
import { db } from "./db.js";

type Key = "jellyfin_url" | "public_jellyfin_url" | "session_secret";

export function getConfig(key: Key): string | null {
  const row = db.prepare("SELECT value FROM config WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setConfig(key: Key, value: string): void {
  db.prepare(
    `INSERT INTO config (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

export function ensureSessionSecret(): string {
  const existing = getConfig("session_secret");
  if (existing) return existing;
  const secret = randomBytes(48).toString("base64url");
  setConfig("session_secret", secret);
  return secret;
}

export function getSessionSecret(): string {
  return ensureSessionSecret();
}

export function getJellyfinUrl(): string | null {
  return getConfig("jellyfin_url");
}

export function setJellyfinUrl(url: string): void {
  setConfig("jellyfin_url", url.replace(/\/$/, ""));
}

export function getPublicJellyfinUrl(): string | null {
  return getConfig("public_jellyfin_url");
}

export function setPublicJellyfinUrl(url: string | null): void {
  if (!url || !url.trim()) {
    db.prepare("DELETE FROM config WHERE key = ?").run("public_jellyfin_url");
    return;
  }
  setConfig("public_jellyfin_url", url.trim().replace(/\/$/, ""));
}

export function isConfigured(): boolean {
  return !!getJellyfinUrl();
}
