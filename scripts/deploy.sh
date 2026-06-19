#!/usr/bin/env bash
# Deploy the built SPA to the local nginx web root.
#
# Usage:
#   bun run deploy
#
# Environment variables (optional):
#   DEPLOY_DIR   web root on this machine   (default: /var/www/sancuary-player)
#   WEB_USER     nginx user                 (default: www-data)
#   WEB_GROUP    nginx group                (default: www-data)
#
# Requires: sudo privileges to write to DEPLOY_DIR and reload nginx.

set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/var/www/sancuary-player}"
WEB_USER="${WEB_USER:-www-data}"
WEB_GROUP="${WEB_GROUP:-www-data}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$REPO_ROOT/dist"

echo "==> Building (bun run build)"
cd "$REPO_ROOT"
bun install --frozen-lockfile
bun run build

if [ ! -d "$DIST_DIR" ]; then
  echo "ERROR: $DIST_DIR does not exist after build." >&2
  exit 1
fi

echo "==> Syncing $DIST_DIR -> $DEPLOY_DIR"
sudo mkdir -p "$DEPLOY_DIR"
sudo find "$DEPLOY_DIR" -mindepth 1 -delete
sudo cp -r "$DIST_DIR/." "$DEPLOY_DIR/"
sudo chown -R "$WEB_USER:$WEB_GROUP" "$DEPLOY_DIR"

echo "==> Reloading nginx"
sudo nginx -t
sudo systemctl reload nginx

echo "==> Deployed to $DEPLOY_DIR"
