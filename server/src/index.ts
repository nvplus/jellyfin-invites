import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "./db.js";
import { env } from "./env.js";
import {
  ensureSessionSecret,
  getJellyfinUrl,
  getPublicJellyfinUrl,
  isConfigured,
  setJellyfinUrl,
  setPublicJellyfinUrl,
} from "./config.js";
import { createSession, destroySession, getSession } from "./session.js";
import {
  createUser,
  getLibraries,
  setUserLibraries,
  userExists,
  verifyApiKey,
} from "./jellyfin.js";

ensureSessionSecret();

const app = new Hono();

app.get("/api/setup", (c) => {
  return c.json({ configured: isConfigured() });
});

app.get("/api/session", (c) => {
  const s = getSession(c);
  return c.json({ authenticated: !!s, configured: isConfigured() });
});

app.post("/api/session", async (c) => {
  const body = (await c.req.json().catch(() => null)) as
    | { apiKey?: string; jellyfinUrl?: string; publicJellyfinUrl?: string }
    | null;
  const apiKey = body?.apiKey?.trim();
  if (!apiKey) return c.json({ error: "apiKey required" }, 400);

  const firstSetup = !isConfigured();
  let jellyfinUrl = getJellyfinUrl();
  if (!jellyfinUrl) {
    const provided = body?.jellyfinUrl?.trim();
    if (!provided) return c.json({ error: "jellyfinUrl required on first setup" }, 400);
    jellyfinUrl = provided.replace(/\/$/, "");
  }

  const ok = await verifyApiKey(jellyfinUrl, apiKey);
  if (!ok) return c.json({ error: "Jellyfin rejected this URL or API key" }, 401);

  if (firstSetup) {
    setJellyfinUrl(jellyfinUrl);
    if (body?.publicJellyfinUrl?.trim()) {
      setPublicJellyfinUrl(body.publicJellyfinUrl);
    }
  }
  createSession(c, apiKey);
  return c.json({ ok: true });
});

app.delete("/api/session", (c) => {
  destroySession(c);
  return c.json({ ok: true });
});

const requireAuth: Parameters<typeof app.use>[1] = async (c, next) => {
  const s = getSession(c);
  if (!s) return c.json({ error: "unauthorized" }, 401);
  await next();
};

app.use("/api/invites/*", requireAuth);
app.use("/api/config", requireAuth);
app.use("/api/libraries", requireAuth);

app.get("/api/config", (c) => {
  return c.json({
    jellyfinUrl: getJellyfinUrl(),
    publicJellyfinUrl: getPublicJellyfinUrl(),
  });
});

app.put("/api/config", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    jellyfinUrl?: string;
    publicJellyfinUrl?: string | null;
  };
  if (typeof body.jellyfinUrl === "string") {
    const url = body.jellyfinUrl.trim();
    if (!url) return c.json({ error: "jellyfinUrl cannot be empty" }, 400);
    const apiKey = getSession(c)!.apiKey;
    if (!(await verifyApiKey(url, apiKey))) {
      return c.json({ error: "Jellyfin rejected this URL with the current API key" }, 400);
    }
    setJellyfinUrl(url);
  }
  if (body.publicJellyfinUrl !== undefined) {
    setPublicJellyfinUrl(body.publicJellyfinUrl);
  }
  return c.json({
    jellyfinUrl: getJellyfinUrl(),
    publicJellyfinUrl: getPublicJellyfinUrl(),
  });
});

app.get("/api/libraries", async (c) => {
  const jellyfinUrl = getJellyfinUrl();
  if (!jellyfinUrl) return c.json({ error: "not configured" }, 503);
  const apiKey = getSession(c)!.apiKey;
  try {
    const libraries = await getLibraries(jellyfinUrl, apiKey);
    return c.json({ libraries });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

function parseLibraryIds(raw: string | null): string[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}

app.get("/api/invites", (c) => {
  const rows = db
    .prepare(
      `SELECT i.token, i.created_at, i.expires_at, i.uses, i.revoked,
              i.allowed_library_ids, r.username
       FROM invites i
       LEFT JOIN registrations r ON r.invite_token = i.token
       ORDER BY i.created_at DESC`,
    )
    .all() as Array<{
    token: string;
    created_at: number;
    expires_at: number | null;
    uses: number;
    revoked: number;
    allowed_library_ids: string | null;
    username: string | null;
  }>;
  return c.json({
    invites: rows.map((r) => ({
      token: r.token,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      used: r.uses > 0,
      revoked: !!r.revoked,
      registeredAs: r.username,
      allowedLibraryIds: parseLibraryIds(r.allowed_library_ids),
    })),
  });
});

const DEFAULT_EXPIRY_HOURS = 12;

app.post("/api/invites", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    expiresInHours?: number;
    allowedLibraryIds?: string[] | null;
  };
  const token = randomBytes(24).toString("base64url");
  const now = Date.now();
  const hours =
    typeof body.expiresInHours === "number" ? body.expiresInHours : DEFAULT_EXPIRY_HOURS;
  const expiresAt = hours > 0 ? now + hours * 3600_000 : null;
  const allowedLibraryIds =
    Array.isArray(body.allowedLibraryIds)
      ? body.allowedLibraryIds.filter((x): x is string => typeof x === "string")
      : null;
  db.prepare(
    `INSERT INTO invites (token, created_at, expires_at, max_uses, uses, revoked, label, allowed_library_ids)
     VALUES (?, ?, ?, 1, 0, 0, NULL, ?)`,
  ).run(token, now, expiresAt, allowedLibraryIds ? JSON.stringify(allowedLibraryIds) : null);
  return c.json({
    token,
    createdAt: now,
    expiresAt,
    used: false,
    revoked: false,
    registeredAs: null,
    allowedLibraryIds,
  });
});

app.delete("/api/invites/:token", (c) => {
  const token = c.req.param("token");
  db.prepare("UPDATE invites SET revoked = 1 WHERE token = ?").run(token);
  return c.json({ ok: true });
});

function inviteStatus(row: {
  expires_at: number | null;
  max_uses: number;
  uses: number;
  revoked: number;
}): "valid" | "expired" | "exhausted" | "revoked" {
  if (row.revoked) return "revoked";
  if (row.expires_at && row.expires_at < Date.now()) return "expired";
  if (row.uses >= row.max_uses) return "exhausted";
  return "valid";
}

app.get("/api/invite/:token", (c) => {
  const token = c.req.param("token");
  const row = db
    .prepare(
      `SELECT token, expires_at, max_uses, uses, revoked FROM invites WHERE token = ?`,
    )
    .get(token) as
    | { token: string; expires_at: number | null; max_uses: number; uses: number; revoked: number }
    | undefined;
  if (!row) return c.json({ status: "not_found" }, 404);
  return c.json({
    status: inviteStatus(row),
    expiresAt: row.expires_at,
    remaining: row.max_uses - row.uses,
  });
});

app.post("/api/register", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    token?: string;
    username?: string;
    password?: string;
  };
  const { token, username, password } = body;
  if (!token || !username || !password) {
    return c.json({ error: "token, username, password required" }, 400);
  }
  if (username.length < 2 || password.length < 4) {
    return c.json({ error: "username/password too short" }, 400);
  }

  const jellyfinUrl = getJellyfinUrl();
  if (!jellyfinUrl) return c.json({ error: "server not configured" }, 503);

  const row = db
    .prepare(
      `SELECT token, expires_at, max_uses, uses, revoked, allowed_library_ids
       FROM invites WHERE token = ?`,
    )
    .get(token) as
    | {
        token: string;
        expires_at: number | null;
        max_uses: number;
        uses: number;
        revoked: number;
        allowed_library_ids: string | null;
      }
    | undefined;
  if (!row) return c.json({ error: "invite not found" }, 404);
  const status = inviteStatus(row);
  if (status !== "valid") return c.json({ error: `invite ${status}` }, 400);

  const admin = db
    .prepare("SELECT api_key FROM sessions ORDER BY last_seen_at DESC LIMIT 1")
    .get() as { api_key: string } | undefined;
  if (!admin) return c.json({ error: "no admin session available" }, 503);

  if (await userExists(jellyfinUrl, admin.api_key, username)) {
    return c.json({ error: "username already taken" }, 409);
  }

  let user: { id: string };
  try {
    user = await createUser(jellyfinUrl, admin.api_key, username, password);
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }

  const allowedLibraryIds = parseLibraryIds(row.allowed_library_ids);
  if (allowedLibraryIds !== null) {
    try {
      await setUserLibraries(jellyfinUrl, admin.api_key, user.id, allowedLibraryIds);
    } catch (e) {
      console.error("failed to apply library policy:", (e as Error).message);
    }
  }

  const tx = db.transaction(() => {
    db.prepare("UPDATE invites SET uses = uses + 1 WHERE token = ?").run(token);
    db.prepare(
      `INSERT INTO registrations (invite_token, jellyfin_user_id, username, created_at)
       VALUES (?, ?, ?, ?)`,
    ).run(token, user.id, username, Date.now());
  });
  tx();

  return c.json({ ok: true, jellyfinUrl: getPublicJellyfinUrl() ?? jellyfinUrl });
});

app.get("/api/health", (c) => c.json({ ok: true }));

// Serve the built web app, if present (production / Docker / LXC).
const webDist = resolve(process.cwd(), "web/dist");
if (existsSync(webDist)) {
  app.use("/*", serveStatic({ root: "./web/dist" }));
  const indexHtml = readFileSync(resolve(webDist, "index.html"), "utf8");
  app.get("*", (c) => c.html(indexHtml));
}

serve({ fetch: app.fetch, port: env.PORT, hostname: "0.0.0.0" }, (info) => {
  console.log(`server listening on http://0.0.0.0:${info.port}`);
});
