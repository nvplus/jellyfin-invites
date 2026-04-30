#!/usr/bin/env bash
# Update an existing jellyfin-invites install (LXC, bare server, or Docker host).
# Run inside the container/host where the app is installed:
#   /opt/jellyfin-invites/scripts/update.sh
# or remotely from the Proxmox host:
#   pct exec <CTID> -- /opt/jellyfin-invites/scripts/update.sh
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/jellyfin-invites}"
SERVICE="${SERVICE:-jellyfin-invites}"
BRANCH="${BRANCH:-main}"

log() { echo "==> $*"; }

[[ -d "$APP_DIR/.git" ]] || { echo "no git repo at $APP_DIR" >&2; exit 1; }

cd "$APP_DIR"

log "fetching latest from origin/$BRANCH"
git fetch --depth 1 origin "$BRANCH"

before=$(git rev-parse HEAD)
git reset --hard "origin/$BRANCH"
after=$(git rev-parse HEAD)

if [[ "$before" == "$after" ]]; then
  log "already at $after — nothing to do"
  exit 0
fi

log "updating from ${before:0:7} to ${after:0:7}"

log "installing dependencies"
npm install

log "building"
npm run build

if systemctl list-unit-files "${SERVICE}.service" >/dev/null 2>&1; then
  log "restarting $SERVICE"
  systemctl restart "$SERVICE"
  systemctl is-active --quiet "$SERVICE" && log "service is active" || {
    echo "service did not come back up — check 'journalctl -u $SERVICE'" >&2
    exit 1
  }
else
  log "no $SERVICE systemd unit found — restart your runner manually"
fi

log "done"
