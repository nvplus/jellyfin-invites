# jellyfin-invites

A tiny invite-based registration page for a Jellyfin instance.

- First launch: open the app and enter your Jellyfin URL + API key. That's it.
- Admin generates invite links with optional expiry and max-uses.
- Each link opens a registration page that creates a Jellyfin user via the Jellyfin API.

Stack: Hono + better-sqlite3 (server), Vite + React (web), SQLite (storage).

Zero config: the Jellyfin URL and session secret are stored in the SQLite database, not in env vars. You configure everything from the browser on first run.

## Local development

```sh
npm install
npm run dev
```

Visit http://localhost:5173. On first load you'll be asked for the Jellyfin URL and an API key (Jellyfin → Dashboard → API Keys).

## Build & run

```sh
npm run build
npm start
```

The server runs on `PORT` (default 8787) and serves the built frontend from `web/dist`, so one process = full app. SQLite lives at `DATABASE_PATH` (default `./data/invites.db`).

## Deploy with Docker

```sh
docker compose up -d --build
```

Then open `http://<host>:8787` and complete the setup form.

The only thing that needs to persist between deploys is the `./data` volume — it holds the SQLite database (which contains your config, session secret, and invites).

### Sharing a network with an existing Jellyfin stack

If Jellyfin is already in a compose project, attach this service to the same external network so it can reach Jellyfin by service name (e.g. `http://jellyfin:8096`):

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

## Deploy as a Proxmox LXC

True one-liner — run on the Proxmox host as root:

```sh
bash <(curl -fsSL https://raw.githubusercontent.com/nvplus/jellyfin-invites/main/scripts/deploy-proxmox-lxc.sh)
```

This creates an unprivileged Debian 12 LXC, installs Node 20, clones the repo, builds, and runs the app under systemd. When it finishes you'll get the container's IP — open it in a browser and complete setup.

Knobs (all optional env vars): `CTID`, `HOSTNAME`, `STORAGE`, `DISK_GB`, `MEMORY_MB`, `CORES`, `BRIDGE`, `IP_CONFIG` (defaults to `dhcp`), `APP_PORT`, `SSH_PUBKEY_FILE`.

Logs / restart from the host:

```sh
pct exec <CTID> -- journalctl -u jellyfin-invites -f
pct exec <CTID> -- systemctl restart jellyfin-invites
```

## Endpoints

- `GET /api/setup` — `{ configured }`
- `GET /api/session` — `{ authenticated, configured }`
- `POST /api/session` — sign in with `{ apiKey, jellyfinUrl? }` (URL required only on first setup)
- `DELETE /api/session` — sign out
- `GET /api/invites` — list invites (auth)
- `POST /api/invites` — create `{ expiresInHours?, maxUses?, label? }` (auth)
- `DELETE /api/invites/:token` — revoke (auth)
- `GET /api/invite/:token` — public; status check
- `POST /api/register` — public; `{ token, username, password }` → creates Jellyfin user
