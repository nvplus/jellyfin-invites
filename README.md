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

The server runs on `PORT` (default 8787) and, when `web/dist` exists, also serves the built frontend — so one process = full app.

## Deploy with Docker

The included `Dockerfile` builds both server and web into a single image; `docker-compose.yml` wires it up with a persistent SQLite volume.

```sh
# from the repo root
docker compose build

SESSION_SECRET=$(openssl rand -base64 48) \
JELLYFIN_URL=http://your-jellyfin:8096 \
PUBLIC_BASE_URL=https://invites.example.com \
docker compose up -d
```

Then visit `PUBLIC_BASE_URL` (or `http://localhost:8787` locally).

Notes:

- `SESSION_SECRET` must be a long random string. Generate once and keep it stable across deploys, or all sessions invalidate on restart.
- `PUBLIC_BASE_URL` is the externally-visible URL — it's used to render invite links, so it must match what users will actually open.
- `JELLYFIN_URL` is server-to-server. If Jellyfin runs in another container, use its service name (e.g. `http://jellyfin:8096`) and attach both services to the same Docker network.
- SQLite lives on the `./data` bind mount. Back it up like any other small database.
- Run behind HTTPS in production (Caddy, nginx, Traefik, etc.) — the session cookie is marked `Secure` only when `NODE_ENV=production`, which the image sets by default.

### Sharing a network with an existing Jellyfin stack

If Jellyfin is already in a compose project, attach this service to the same external network:

```yaml
services:
  invites:
    # ...
    networks:
      - jellyfin_default
networks:
  jellyfin_default:
    external: true
```

Then set `JELLYFIN_URL=http://jellyfin:8096` (or whatever the service is named).

## Endpoints

- `POST /api/session` — sign in with `{ apiKey }`
- `DELETE /api/session` — sign out
- `GET /api/invites` — list invites (auth)
- `POST /api/invites` — create `{ expiresInHours?, maxUses?, label? }` (auth)
- `DELETE /api/invites/:token` — revoke (auth)
- `GET /api/invite/:token` — public; status check
- `POST /api/register` — public; `{ token, username, password }` → creates Jellyfin user
