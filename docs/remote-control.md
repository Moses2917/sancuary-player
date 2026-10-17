# Code-paired Remote Control

Player and **Remote Control** (`/remote`) are two modes of this same Vue site.
Audio plays only through the host's existing dual-stem player. The phone receives
service/queue titles, cues, mix and transport state—not tracks or a copied library.

## Use

1. Open Player on the computer (installed app or website). Import songs and create
   services as usual. For a browser host, click Play once there to allow audio.
2. Choose **Enable Remote Control**. Open the displayed site on your phone, choose
   Remote Control, and enter the six-digit code. Alternatively scan the QR code.
3. **Approve controller** on the host. Only approve requests you are expecting.
4. Load a service from the phone; it loads **paused**, as does queue selection.
   Previous/next retain the player store's existing behavior.
5. Mix, services, cues and A–B looping are in expandable sections. Set A and B,
   then enable/apply the loop. Disable retains the phone's draft endpoints;
   clear removes them. Mix sliders send on release.

The host provides disconnect, code regeneration and disable actions. Replacement
always needs new approval and revokes the old controller. Changing from Player
to Remote Control mode pauses local playback and disables that computer's hosting.

Keep a browser host tab open and its computer awake. Browsers may suspend background
tabs; the existing cuts/panic animation-frame engine cannot be guaranteed while
suspended. If playback is blocked, click Play **on the host** and retry. Losing the
remote connection does not intentionally pause or change host playback.

## Development and installed builds

```sh
bun install
bun run relay       # terminal 1: loopback Bun WebSocket server, port 8787
bun run dev         # terminal 2: Vite proxies /relay to Bun
```

Open `http://localhost:1420` in two separate browser contexts. Remote mode does not
open IndexedDB, initialize the local player, register media controls or fetch audio.
For physical phones/cross-network tests use the public **HTTPS** deployment, not a
LAN address or an insecure development server.

For installed builds create `.env.local` from `.env.example` before building:

```dotenv
VITE_PUBLIC_SITE_URL=https://player.armsongs.com
VITE_RELAY_URL=wss://player.armsongs.com/relay
```

These are public build-time addresses, not secrets. For another relay domain add
that exact WSS origin to `src-tauri/tauri.conf.json`'s `connect-src`. No additional
Tauri native permissions or incoming connections are needed. With remote disabled,
there is no relay connection; native SQLite/offline playback remains available.

## Production

The relay is a Bun + TypeScript backend separate from the static frontend. Use Bun
1.3.10 or later. Its WebSockets/cryptography are built-in, with no runtime packages.

`bun run setup:server` performs the whole initial provisioning (relay account,
files, unit, nginx site, frontend publish) and is safe to re-run. The steps below
describe what it does; run them manually if you need finer control.

There are two deployments: `bun run build` creates only the website in `dist/`;
`bun run deploy` publishes that website to the local nginx web root. Neither command
installs the relay, creates its service account, or installs the nginx proxy.

### 1. Install the service account and Bun

Run the following commands from the repository root on the server. Create the
account once; skip `useradd` if `id sanctuary-relay` already succeeds:

```sh
sudo useradd --system --user-group --no-create-home \
  --shell /usr/sbin/nologin sanctuary-relay
```

Check `command -v bun`. If Bun is installed in your home directory, copy the binary
into the service's system-wide path (skip this copy if Bun is already installed at
`/usr/local/bin/bun`):

```sh
sudo install -m 0755 "$(command -v bun)" /usr/local/bin/bun
sudo -u sanctuary-relay /usr/local/bin/bun --version
```

Do not symlink Bun or the relay into a home directory. The unit deliberately uses
`ProtectHome=true`, so home-directory paths are inaccessible to the service.

### 2. Install the relay files and unit

Only three source files are needed; do not copy `.env`, audio, `node_modules`, or
the rest of your home directory. These copies are root-owned and readable by the
unprivileged service account:

```sh
sudo install -d -m 0755 \
  /opt/sanctuary-player/relay \
  /opt/sanctuary-player/src/remote
sudo install -m 0644 relay/server.ts relay/session.ts /opt/sanctuary-player/relay/
sudo install -m 0644 src/remote/protocol.ts /opt/sanctuary-player/src/remote/
sudo install -m 0644 deploy/sanctuary-relay.service /etc/systemd/system/
```

Review `/etc/systemd/system/sanctuary-relay.service`. Its `WorkingDirectory` must
match `/opt/sanctuary-player`, and `ExecStart` must point at the installed Bun binary.
Adjust `ALLOWED_ORIGINS` for your HTTPS site, retaining the Tauri origins for
installed hosts. No wildcard/null origins are accepted. Then start and verify:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now sanctuary-relay
curl --fail http://127.0.0.1:8787/health
sudo systemctl status sanctuary-relay --no-pager
```

The health check must return `ok`. Check the journal if the service enters an
auto-restart loop; an instantaneous `active` status alone does not prove startup.

### 3. Add the HTTPS WebSocket proxy

For a new site, follow [deployment.md](./deployment.md) to install nginx and HTTPS.
For an existing Certbot-managed site, **do not overwrite its configuration** with
the HTTP-only template. Add this location inside the existing HTTPS `server` block
for `player.armsongs.com`, preserving all certificate/listen directives:

```nginx
location = /relay {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 60s;
    proxy_send_timeout 60s;
    proxy_buffering off;
    access_log off;
}
```

```sh
sudo nginx -t && sudo systemctl reload nginx
```

Publish the frontend with `bun run deploy`, then try **Enable Remote Control**.
The browser's Network → WebSocket request to `/relay` should receive HTTP **101**.
HTTP alone is not a production configuration.

### Updating an existing relay

After pulling new backend code, copy all three files again and restart the service;
restarting without copying would continue running the old `/opt` deployment:

```sh
sudo systemctl stop sanctuary-relay
sudo install -m 0644 relay/server.ts relay/session.ts /opt/sanctuary-player/relay/
sudo install -m 0644 src/remote/protocol.ts /opt/sanctuary-player/src/remote/
sudo systemctl start sanctuary-relay
curl --fail http://127.0.0.1:8787/health
```

If the unit itself changed, install it again and run `sudo systemctl daemon-reload`
before starting. Backend restarts expire all pairings without altering local host
audio. Run **one process**: in-memory sessions are not shared across replicas.

### Troubleshooting

```sh
sudo journalctl -u sanctuary-relay -n 50 --no-pager
```

| Symptom                                                | Check / fix                                                                                                                                    |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `217/USER`                                             | Create the `sanctuary-relay` user and group; check `User` / `Group` in the unit.                                                               |
| `203/EXEC`                                             | `/usr/local/bin/bun` must exist and be executable. Copy the real binary outside `/home`; a home-directory symlink is blocked by `ProtectHome`. |
| `200/CHDIR`                                            | Create `/opt/sanctuary-player` and copy the three source files, or correct `WorkingDirectory`.                                                 |
| Loopback `/health` fails                               | Fix relay startup first; rebuilding the frontend cannot fix the backend. Read the journal and check port 8787.                                 |
| Loopback health works, public `/relay` returns 200/404 | Add the proxy in the active HTTPS server block, not just the repository template or HTTP redirect block.                                       |
| Public `/relay` returns 502                            | Check nginx can reach the running relay at `127.0.0.1:8787`.                                                                                   |
| WebSocket handshake returns 403                        | Check the request's Origin against the service's `ALLOWED_ORIGINS`; keep the allowlist explicit.                                               |

The backend binds loopback. `TRUST_PROXY=1` is only for a trusted proxy overwriting
`X-Real-IP`. Behind additional proxies configure the real client address, otherwise
users share rate limits. Do not expose port 8787 publicly or log WebSocket bodies.
Cloudflare/other proxies must support WebSocket upgrades and TLS end to end.

## Security and recovery

- Uniform cryptographically random six-digit codes are unique among active hosts,
  expire after five minutes, and are invalidated on approval/rejection/regeneration.
  Pending approval lasts at most a minute. QR codes put the code in a fragment;
  the controller removes it from the URL immediately after consumption.
- Host authentication uses a random 256-bit secret held only in host memory.
  Approved controller secrets are generated independently by the relay and kept
  in tab-scoped sessionStorage for phone reloads. Secrets/codes are not WebSocket
  URL parameters. Approval names are informational, not proof of device identity.
- Codes alone cannot read state or control playback. The relay enforces roles,
  isolation and revocation. HTTPS/WSS encrypts traffic in transit, but **the relay
  can read messages; this is not end-to-end encryption**. Message bodies, codes
  and credentials are intentionally not logged.
- Pairing: six attempts/minute/IP and 120/minute/process. Host creation:
  ten/minute/IP; regeneration: ten/minute/session. Messages: 40/second/socket,
  maximum 512 KiB. Admission: 20 sockets/IP, 2,000 sockets and 1,000 hosts/process.
  Add edge abuse protection before a high-volume public rollout.
- Recovery window: **two minutes** after relay-observed disconnection. Heartbeat
  loss is detected in roughly 35 seconds. Reload/restart discards host credentials
  and requires fresh pairing. Pagehide tries immediate revocation; abrupt closure
  leaves an inaccessible session until expiration. Relay restart also requires pairing.
- Controller controls stay disabled until a fresh host snapshot arrives. Foreground,
  online and page-show events refresh/reconnect. Offline presses are never queued
  or replayed; unacknowledged commands are never automatically retried.
- Host commands execute serially, deduplicating pending/completed request IDs.
  Queue/song revisions reject stale requests, including away-and-back changes.
  Queued work rechecks authorization. Stop/panic are intentionally global so a
  song change cannot prevent an emergency stop.
- UI acknowledgment timeout: ten seconds. Timeout/disconnect means **unknown**,
  not successful. Panic Stop explicitly displays acknowledgment and is unavailable
  offline. Use the host's local controls if the link fails.
- Transport changes publish promptly, with a 4 Hz position heartbeat and bounded
  phone interpolation. Sessions accept at most 4,096 distinct command IDs without
  evicting deduplication records; re-enable hosting to reset that budget. Metadata
  supports up to 5,000 entries/collection and 1,000 characters/title; invalid or
  oversized metadata reports an error rather than forwarding arbitrary payloads.

Browser songs (including Blobs), services and settings persist in IndexedDB;
native hosts retain SQLite/custom-protocol audio. Legacy JSON metadata migrates on
database creation. Audio already lost by the old JSON adapter must be re-imported.
Browser storage is origin-local, not synchronized to the relay, and may be evicted
by the browser. Keep library backups for important audio.

## Validation

```sh
bun run test:unit --run
bun run type-check
bun run type-check:relay
bun run build
bunx playwright install chromium webkit
bunx playwright install-deps    # OS libraries, if needed
bun run test:remote
```

The remote Playwright configuration starts Vite and the real relay, with separate
host/controller contexts in Chromium and iPhone-sized WebKit. It checks approval,
metadata privacy, persisted imported audio, host playback/pause, mix, panic
acknowledgment, reload, landscape layout and revocation. Unit coverage includes
expiry, collisions, isolation, validation, deduplication, stale contexts, reconnect,
and bridge dispatch with browser/Tauri environments. Mock Tauri/audio tests are not
a replacement for native hardware or physical iPhone Safari tests.

Run remote E2E tests in an isolated development environment with the local relay,
not against a production service or a production `VITE_RELAY_URL`. The configuration
uses ports 1420 and 8787; an already-running service on those ports may be reused.

Before rollout, manually check:

- Installed Tauri → physical iPhone and desktop browser → physical iPhone.
- Shared Wi-Fi, cellular-to-church-Wi-Fi, and cellular/Wi-Fi transitions.
- Lock/unlock, Safari background/resume, portrait/landscape and safe areas.
- Host close/reload, relay restart and network interruption; no stale replays.
- Concurrent local UI/keyboard use, automatic advancement and paused selection.
- Real dual-stem sync, cuts, fades, looping, output routing, panic fades and blocked
  autoplay recovery; native offline operation with remote disabled.
