# Deployment

The frontend is a static SPA: serve `dist/` with HTTPS and SPA fallback.
Optional remote access also requires the Bun WebSocket relay behind `/relay`.
See [remote-control.md](./remote-control.md) for service installation, build-time
site/relay addresses, and security/recovery limits.

## Build or publish the frontend

```sh
bun run build
```

This type-checks and builds `dist/`; it does not publish the site or start a backend.
For the local nginx deployment:

```sh
bun run deploy
```

This runs `scripts/deploy.sh`, which:

1. `bun install --frozen-lockfile` and `bun run build` (produces `dist/`).
2. Wipes `/var/www/sancuary-player/*` and copies the fresh `dist/` into
   place.
3. Sets ownership to `www-data:www-data`.
4. Runs `nginx -t` and reloads nginx.

The script replaces everything in `DEPLOY_DIR`; use a dedicated web root, not a
directory containing uploads or unrelated files. It refuses to reload nginx if
`nginx -t` finds a config error. It does **not** create the relay service account,
install/update the relay, or copy the nginx configuration. Complete the initial
[relay setup](./remote-control.md#production) separately.

Override the defaults with environment variables if your layout differs:

```sh
DEPLOY_DIR=/srv/foo WEB_USER=http bun run deploy
```

## nginx config

A reference HTTP config lives at `deploy/player.armsongs.conf`. For a **new** site
only, install it like this before enabling HTTPS:

```sh
sudo cp deploy/player.armsongs.conf /etc/nginx/sites-available/player.armsongs.conf
sudo ln -sf /etc/nginx/sites-available/player.armsongs.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

All of the above (frontend publish, relay service, nginx site) is also bundled
into one idempotent command:

```sh
bun run setup:server
```

For an existing HTTPS/Certbot installation, edit the active site configuration
instead. Preserve its certificates and `listen 443 ssl` directives; copy the
`location = /relay` block from the template into that HTTPS server block. Changing
the repository template or running `bun run deploy` does not update the active
configuration. See the [proxy setup](./remote-control.md#3-add-the-https-websocket-proxy).

The config does four important things:

1. **SPA fallback**: `try_files $uri $uri/ /index.html` so client-side
   routes (e.g. `/services/abc123`) don't 404 on refresh.
2. **Long-cache fingerprinted assets** (Vite emits content-hashed
   filenames for JS, CSS, fonts, images) with
   `Cache-Control: public, immutable` and a 1-year expiry.
3. **No-cache for the service worker, manifest, and workbox runtime** so
   PWA updates actually apply. `index.html` is also no-cache so users
   always pick up the latest asset hashes.
4. **WebSocket proxy**: `/relay` forwards upgraded connections to the loopback
   Bun service at port 8787. Both the phone and host use the site's public WSS URL.

Gzip is enabled for text responses.

## HTTPS with Let's Encrypt

Because the app uses a service worker and PWA install prompts, HTTPS is
required. With nginx serving HTTP on port 80, run:

```sh
sudo certbot --nginx -d player.armsongs.com
```

Certbot will rewrite the nginx config to listen on 443 with the cert, and
add an HTTP-to-HTTPS redirect on port 80. Renewals are automatic via the
systemd timer certbot installs.

Make sure your DNS A record points at the server's public IP before
running certbot, or the HTTP-01 challenge will fail.

## Cloudflare in front

If you proxy through Cloudflare, set the SSL mode to **Full (Strict)** and
use a Cloudflare Origin Certificate on the server (free, 15-year, issued
in the dashboard) so you don't need certbot at all. Otherwise the setup is
identical.

## Updating an existing install

Re-run `bun run deploy` for frontend changes. Reload the site outside a live service
to pick up the new assets; the deployment replaces old files in the web root.

For backend changes, follow [Updating an existing relay](./remote-control.md#updating-an-existing-relay):
copy the three relay/protocol files into `/opt/sanctuary-player`, then restart the
service. Restarting alone does not copy source updates. Relay restarts require fresh
pairing but do not stop host playback. There is no need to rebuild the website just
to fix a missing service user, Bun binary, working directory, or nginx proxy.
