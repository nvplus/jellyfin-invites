#!/usr/bin/env bash
# Deploy jellyfin-invites into an unprivileged LXC on a Proxmox host.
#
# Run this ON the Proxmox host (or copy this repo there first and run it from
# the repo root). It will:
#   1. Download a Debian 12 template if missing
#   2. Create an unprivileged LXC container
#   3. Push this repo into it as a tarball
#   4. Install Node 20, build, and run the app under systemd
#
# Configure via env vars or the defaults below.
set -euo pipefail

# ---------- config ----------
# CTID defaults to (highest existing CT/VM id) + 1, or 100 if none exist.
CTID="${CTID:-}"
# NOTE: do not use $HOSTNAME — it's a shell builtin holding the node's name.
CT_HOSTNAME="${CT_HOSTNAME:-jellyfin-invites}"
STORAGE="${STORAGE:-local-lvm}"             # rootfs storage pool
TEMPLATE_STORAGE="${TEMPLATE_STORAGE:-local}"
DISK_GB="${DISK_GB:-4}"
MEMORY_MB="${MEMORY_MB:-512}"
SWAP_MB="${SWAP_MB:-512}"
CORES="${CORES:-1}"
BRIDGE="${BRIDGE:-vmbr0}"
IP_CONFIG="${IP_CONFIG:-dhcp}"              # e.g. "192.168.1.50/24,gw=192.168.1.1" or "dhcp"
TEMPLATE="${TEMPLATE:-debian-12-standard_12.7-1_amd64.tar.zst}"
APP_DIR="/opt/jellyfin-invites"
APP_PORT="${APP_PORT:-8787}"

# Where to fetch the repo from when running standalone (curl | bash).
# Override with REPO_URL=... or REPO_REF=... (branch/tag/commit).
REPO_URL="${REPO_URL:-https://github.com/nvplus/jellyfin-invites.git}"
REPO_REF="${REPO_REF:-main}"

# Optional: set a root password (otherwise random); SSH key for root login
ROOT_PASSWORD="${ROOT_PASSWORD:-}"
SSH_PUBKEY_FILE="${SSH_PUBKEY_FILE:-}"      # path to a public key on the host
# ----------------------------

err() { echo "error: $*" >&2; exit 1; }
log() { echo "==> $*"; }

command -v pct >/dev/null || err "this script must run on a Proxmox host (pct not found)"
[[ $EUID -eq 0 ]] || err "run as root on the Proxmox host"

# Interactive prompts (skipped if values already set via env or no tty available).
if [[ -t 0 ]]; then
  if [[ "$CT_HOSTNAME" == "jellyfin-invites" ]]; then
    read -r -p "Container hostname [jellyfin-invites]: " input || true
    [[ -n "$input" ]] && CT_HOSTNAME="$input"
  fi
  if [[ -z "$ROOT_PASSWORD" ]]; then
    while :; do
      read -r -s -p "Root password (leave blank for random): " p1; echo
      if [[ -z "$p1" ]]; then
        break
      fi
      read -r -s -p "Confirm password: " p2; echo
      if [[ "$p1" == "$p2" ]]; then
        ROOT_PASSWORD="$p1"
        break
      fi
      echo "Passwords didn't match, try again."
    done
  fi
fi

# Pick the next CTID: max(existing CT/VM ids) + 1, floor of 100.
if [[ -z "$CTID" ]]; then
  highest=$(
    {
      pct list 2>/dev/null | awk 'NR>1 {print $1}'
      command -v qm >/dev/null && qm list 2>/dev/null | awk 'NR>1 {print $1}'
    } | grep -E '^[0-9]+$' | sort -n | tail -1
  )
  if [[ -n "$highest" ]]; then
    CTID=$((highest + 1))
  else
    CTID=100
  fi
  log "auto-selected CTID $CTID"
fi

if pct status "$CTID" >/dev/null 2>&1; then
  err "CTID $CTID already exists. Set CTID=<unused id> or destroy it first."
fi

log "ensuring template $TEMPLATE is present"
if ! pveam list "$TEMPLATE_STORAGE" | grep -q "$TEMPLATE"; then
  pveam update
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"
fi

if [[ -z "$ROOT_PASSWORD" ]]; then
  ROOT_PASSWORD="$(openssl rand -base64 18)"
  log "generated random root password (printed at the end)"
fi

CREATE_ARGS=(
  --hostname "$CT_HOSTNAME"
  --cores "$CORES"
  --memory "$MEMORY_MB"
  --swap "$SWAP_MB"
  --rootfs "${STORAGE}:${DISK_GB}"
  --net0 "name=eth0,bridge=${BRIDGE},ip=${IP_CONFIG}"
  --features "nesting=1"
  --unprivileged 1
  --onboot 1
  --password "$ROOT_PASSWORD"
)
if [[ -n "$SSH_PUBKEY_FILE" ]]; then
  [[ -r "$SSH_PUBKEY_FILE" ]] || err "SSH_PUBKEY_FILE not readable: $SSH_PUBKEY_FILE"
  CREATE_ARGS+=(--ssh-public-keys "$SSH_PUBKEY_FILE")
fi

log "creating container $CTID ($CT_HOSTNAME)"
pct create "$CTID" "${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}" "${CREATE_ARGS[@]}"

log "starting container"
pct start "$CTID"

# Wait for network
log "waiting for network"
for _ in {1..30}; do
  if pct exec "$CTID" -- getent hosts deb.debian.org >/dev/null 2>&1; then break; fi
  sleep 1
done

log "installing base packages and cloning repo"
pct exec "$CTID" -- bash -lc "
  set -e
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y curl ca-certificates gnupg git build-essential python3
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
  rm -rf $APP_DIR
  git clone --depth 1 --branch '$REPO_REF' '$REPO_URL' $APP_DIR
"

log "writing .env"
pct exec "$CTID" -- bash -lc "cat > $APP_DIR/.env <<EOF
DATABASE_PATH=$APP_DIR/data/invites.db
PORT=$APP_PORT
EOF
chmod 600 $APP_DIR/.env"

log "installing deps and building"
pct exec "$CTID" -- bash -lc "
  set -e
  cd $APP_DIR
  npm install
  npm run build
  mkdir -p $APP_DIR/data
  id -u app >/dev/null 2>&1 || useradd --system --home $APP_DIR --shell /usr/sbin/nologin app
  chown -R app:app $APP_DIR
"

log "installing systemd service"
pct exec "$CTID" -- bash -lc "cat > /etc/systemd/system/jellyfin-invites.service <<'EOF'
[Unit]
Description=jellyfin-invites
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=app
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
Environment=NODE_ENV=production
ExecStart=/usr/bin/node $APP_DIR/server/dist/index.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
sed -i 's|\$APP_DIR|$APP_DIR|g' /etc/systemd/system/jellyfin-invites.service
systemctl daemon-reload
systemctl enable --now jellyfin-invites"

CT_IP="$(pct exec "$CTID" -- bash -lc "hostname -I | awk '{print \$1}'" || true)"

cat <<EOF

==========================================================
  jellyfin-invites is deployed
----------------------------------------------------------
  CTID:           $CTID
  Hostname:       $CT_HOSTNAME
  Container IP:   ${CT_IP:-<unknown — check 'pct exec $CTID -- ip a'>}
  App URL:        http://${CT_IP:-<ip>}:${APP_PORT}
  Root password:  $ROOT_PASSWORD

  Open the App URL in a browser to finish setup
  (you'll enter your Jellyfin URL + API key on first load).

  Logs:           pct exec $CTID -- journalctl -u jellyfin-invites -f
  Restart:        pct exec $CTID -- systemctl restart jellyfin-invites
  Edit env:       pct exec $CTID -- nano $APP_DIR/.env
==========================================================
EOF
