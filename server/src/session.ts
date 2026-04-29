import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { db } from "./db.js";
import { env } from "./env.js";

const COOKIE = "sid";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function sign(sid: string): string {
  const mac = createHmac("sha256", env.SESSION_SECRET).update(sid).digest("base64url");
  return `${sid}.${mac}`;
}

function verify(signed: string): string | null {
  const dot = signed.lastIndexOf(".");
  if (dot < 0) return null;
  const sid = signed.slice(0, dot);
  const mac = signed.slice(dot + 1);
  const expected = createHmac("sha256", env.SESSION_SECRET).update(sid).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return sid;
}

export function createSession(c: Context, apiKey: string): void {
  const sid = randomBytes(24).toString("base64url");
  const now = Date.now();
  db.prepare(
    "INSERT INTO sessions (sid, api_key, created_at, last_seen_at) VALUES (?, ?, ?, ?)",
  ).run(sid, apiKey, now, now);
  setCookie(c, COOKIE, sign(sid), {
    httpOnly: true,
    sameSite: "Lax",
    path: "/",
    maxAge: MAX_AGE,
    secure: process.env.NODE_ENV === "production",
  });
}

export function getSession(c: Context): { sid: string; apiKey: string } | null {
  const raw = getCookie(c, COOKIE);
  if (!raw) return null;
  const sid = verify(raw);
  if (!sid) return null;
  const row = db
    .prepare("SELECT sid, api_key FROM sessions WHERE sid = ?")
    .get(sid) as { sid: string; api_key: string } | undefined;
  if (!row) return null;
  db.prepare("UPDATE sessions SET last_seen_at = ? WHERE sid = ?").run(Date.now(), sid);
  return { sid: row.sid, apiKey: row.api_key };
}

export function destroySession(c: Context): void {
  const raw = getCookie(c, COOKIE);
  if (raw) {
    const sid = verify(raw);
    if (sid) db.prepare("DELETE FROM sessions WHERE sid = ?").run(sid);
  }
  deleteCookie(c, COOKIE, { path: "/" });
}
