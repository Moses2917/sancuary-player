#!/usr/bin/env bash
# One-shot server provisioning: nginx site, WebSocket relay service, frontend.
#
# Usage:
#   bun run setup:server
#
# Idempotent: safe to re-run to update relay code or repair an installation.
# Never overwrites an existing nginx site config (Certbot edits it in place);
# if the site was previously installed as "player.armsongs.com" it is renamed
# to "player.armsongs.conf" and its Certbot changes are preserved.
#
# Requires: Linux with systemd, nginx, curl, bun, and sudo privileges.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SERVICE=sanctuary-relay
RELAY_USER=sanctuary-relay
RELAY_DIR="${RELAY_DIR:-/opt/sanctuary-player}"
SITE_NAME=player.armsongs.conf

if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo"; fi

command -v systemctl >/dev/null || { echo "ERROR: systemctl not found (Linux server only)." >&2; exit 1; }
command -v nginx     >/dev/null || { echo "ERROR: nginx not found. Install it first: sudo apt install nginx" >&2; exit 1; }
command -v curl      >/dev/null || { echo "ERROR: curl not found." >&2; exit 1; }
command -v bun       >/dev/null || { echo "ERROR: bun not found. Install bun, then re-run." >&2; exit 1; }

echo "==> 1/5 Publishing frontend (scripts/deploy.sh)"
bash scripts/deploy.sh

echo "==> 2/5 Service account ($RELAY_USER)"
if id "$RELAY_USER" >/dev/null 2>&1; then
  echo "     $RELAY_USER already exists"
else
  $SUDO useradd --system --user-group --no-create-home \
    --shell /usr/sbin/nologin "$RELAY_USER"
fi

echo "==> 3/5 Bun binary at /usr/local/bin"
if [ -x /usr/local/bin/bun ]; then
  echo "     already installed ($(/usr/local/bin/bun --version))"
else
  $SUDO install -m 0755 "$(command -v bun)" /usr/local/bin/bun
  $SUDO -u "$RELAY_USER" /usr/local/bin/bun --version
fi

echo "==> 4/5 Relay files, systemd unit, start service"
$SUDO install -d -m 0755 "$RELAY_DIR/relay" "$RELAY_DIR/src/remote"
$SUDO install -m 0644 relay/server.ts relay/session.ts "$RELAY_DIR/relay/"
$SUDO install -m 0644 src/remote/protocol.ts "$RELAY_DIR/src/remote/"
$SUDO install -m 0644 deploy/sanctuary-relay.service /etc/systemd/system/
$SUDO systemctl daemon-reload
$SUDO systemctl enable "$SERVICE" >/dev/null
$SUDO systemctl restart "$SERVICE"

echo "     waiting for relay /health ..."
for _ in $(seq 1 20); do
  if curl --fail --silent http://127.0.0.1:8787/health >/dev/null; then
    echo "     relay healthy"
    break
  fi
  sleep 0.5
done
if ! curl --fail --silent http://127.0.0.1:8787/health >/dev/null; then
  echo "ERROR: relay not healthy. Inspect: sudo journalctl -u $SERVICE -n 50 --no-pager" >&2
  exit 1
fi

echo "==> 5/5 nginx site ($SITE_NAME)"
if [ -d /etc/nginx/sites-enabled ]; then
  AVAILABLE=/etc/nginx/sites-available
  ENABLED=/etc/nginx/sites-enabled
elif [ -d /etc/nginx/conf.d ]; then
  AVAILABLE=/etc/nginx/conf.d
  ENABLED=/etc/nginx/conf.d
else
  echo "ERROR: no /etc/nginx/sites-enabled or /etc/nginx/conf.d found." >&2
  exit 1
fi

# Migrate the old (pre-rename) site name, preserving any Certbot edits.
if [ -e "$AVAILABLE/player.armsongs.com" ] && [ ! -e "$AVAILABLE/$SITE_NAME" ]; then
  echo "     renaming existing player.armsongs.com -> $SITE_NAME"
  $SUDO mv "$AVAILABLE/player.armsongs.com" "$AVAILABLE/$SITE_NAME"
fi
if [ -L "$ENABLED/player.armsongs.com" ]; then
  $SUDO rm "$ENABLED/player.armsongs.com"
fi

if [ -e "$AVAILABLE/$SITE_NAME" ]; then
  echo "     $AVAILABLE/$SITE_NAME already installed; keeping it (Certbot edits in place)"
else
  $SUDO install -m 0644 "deploy/$SITE_NAME" "$AVAILABLE/$SITE_NAME"
fi
if [ "$ENABLED" != "$AVAILABLE" ] && [ ! -e "$ENABLED/$SITE_NAME" ]; then
  $SUDO ln -sf "$AVAILABLE/$SITE_NAME" "$ENABLED/$SITE_NAME"
fi

$SUDO nginx -t
$SUDO systemctl reload nginx

echo "==> Done"
echo "     Site:   https://player.armsongs.com"
echo "     Relay:  wss://player.armsongs.com/relay (service: $SERVICE, port 8787 loopback)"
if ! grep -q "listen 443" "$AVAILABLE/$SITE_NAME" 2>/dev/null; then
  echo "     NOTE: HTTPS not configured yet. Run: sudo certbot --nginx -d player.armsongs.com"
fi
