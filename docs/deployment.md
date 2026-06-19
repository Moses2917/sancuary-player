# Deployment

This app is a static SPA after building. There is no Node runtime in
production. Build output in `dist/` is served by any static web server.

## One-command deploy

```sh
bun run deploy
```

This runs `scripts/deploy.sh`, which:

1. `bun install --frozen-lockfile` and `bun run build` (produces `dist/`).
2. Wipes `/var/www/sancuary-player/*` and copies the fresh `dist/` into
   place.
3. Sets ownership to `www-data:www-data`.
4. Runs `nginx -t` and reloads nginx.

The script is idempotent and safe to re-run. It will refuse to reload
nginx if `nginx -t` finds a config error.

Override the defaults with environment variables if your layout differs:

```sh
DEPLOY_DIR=/srv/foo WEB_USER=http bun run deploy
```

## nginx config

A reference config lives at `deploy/nginx.conf`. Install it like this:

```sh
sudo cp deploy/nginx.conf /etc/nginx/sites-available/player.armsongs.com
sudo ln -sf /etc/nginx/sites-available/player.armsongs.com /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

The config does three important things:

1. **SPA fallback**: `try_files $uri $uri/ /index.html` so client-side
   routes (e.g. `/services/abc123`) don't 404 on refresh.
2. **Long-cache fingerprinted assets** (Vite emits content-hashed
   filenames for JS, CSS, fonts, images) with `Cache-Control: public,
   immutable` and a 1-year expiry.
3. **No-cache for the service worker, manifest, and workbox runtime** so
   PWA updates actually apply. `index.html` is also no-cache so users
   always pick up the latest asset hashes.

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

Just re-run `bun run deploy`. The new `dist/` replaces the old one, the
hashed filenames mean old cached assets stay valid until their references
disappear, and the service worker picks up the new version on next visit.

Users mid-service won't be interrupted: the service worker swaps in only
when the user navigates away or reloads.
