# jellyfin-invites

A tiny invite-based registration page for a Jellyfin instance.

- Admin signs in with a Jellyfin API key.
- Admin generates invite links with optional expiry and max-uses.
- Each link opens a registration page that creates a Jellyfin user via the Jellyfin API.

Stack: Hono + better-sqlite3 (server), Vite + React (web), SQLite (storage).

## Setup

```sh
cp .env.example .env
# edit .env, set JELLYFIN_URL and a long random SESSION_SECRET
npm install
npm run dev
```

Visit http://localhost:5173.

Generate a Jellyfin API key at: Jellyfin → Dashboard → API Keys.

## Build

```sh
npm run build
npm start
```

The server runs on `PORT` (default 8787); the built web app lives in `web/dist` and can be served by any static host (or wired into the server with another two lines).

## Endpoints

- `POST /api/session` — sign in with `{ apiKey }`
- `DELETE /api/session` — sign out
- `GET /api/invites` — list invites (auth)
- `POST /api/invites` — create `{ expiresInHours?, maxUses?, label? }` (auth)
- `DELETE /api/invites/:token` — revoke (auth)
- `GET /api/invite/:token` — public; status check
- `POST /api/register` — public; `{ token, username, password }` → creates Jellyfin user
