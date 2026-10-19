# ZipLink

Browser-to-browser file sharing over WebRTC. The sender picks files, shares a 5-digit code / QR code / link, approves the receiving device, and the files stream directly between the two browsers. File contents never pass through the ZipLink server.

Built with Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS 4 and Lucide icons. **No database or external signaling service is required.**

---

## How it works

```
 Sender browser                    ZipLink server (Next.js)                 Receiver browser
 ──────────────                    ────────────────────────                 ────────────────
 POST /api/sessions  ───────────▶  reserve unique 5-digit code
                                   + token + secrets (in memory)
 SSE /api/signal/<sender-ch> ◀───  "join-request"           ◀─────────────  POST /api/sessions/join (code [+token])
 POST …/respond (accept) ───────▶  lock session, "accept" ───────────────▶  SSE /api/signal/<request-ch>
 offer / ICE  ──── POST /api/signal/<request-ch> ──── SSE ────────────────▶  answer / ICE (same path, reversed)

 ════════════════════ RTCDataChannel (DTLS-encrypted, peer-to-peer) ════════════════════
 manifest ─────────────────────────────────────────────────────────────────▶ receiver reviews, picks destination
          ◀───────────────────────────────────────────────────────────────── start
 file-start, binary chunks, file-end … ────────────────────────────────────▶ written to disk incrementally
          ◀─────────────────────────────────────────── progress (bytes written), file-done
 done ─────────────────────────────────────────────────────────────────────▶
          ◀───────────────────────────────────────────────────────────────── done-ack  ⇒ both show "Completed"
```

**Through the server (signaling only):** the code, an opaque session token, a coarse device label (e.g. "Chrome on Android"), the sender's accept/reject decision, SDP offers/answers and ICE candidates (which contain network addresses).

**Peer-to-peer only:** file names, sizes, types and all file contents. File metadata is sent over the data channel *after* the sender approves the receiver.

If a direct path is impossible and a TURN server is configured, WebRTC relays the (still DTLS-encrypted) traffic through that TURN server. ZipLink never falls back to uploading files to its own server. The UI shows a **Direct peer-to-peer** or **Relayed via TURN** badge once connected.

### Key design points

- **Signaling without a database.** `SessionService` keeps sessions, requests and rate limits in memory, and `SignalHub` fans messages out over Server-Sent Events. Code reservation is a synchronous check-and-set in a single-threaded process, so two senders can never hold the same live code.
- **Per-request channels.** Each join request gets its own unguessable (128-bit) signaling channel. Guessing a code never exposes another receiver's SDP/ICE data. Clients can only publish to request channels and cannot impersonate server messages.
- **Approval first.** The receiver gets nothing (no SDP, no file names) until the sender clicks Accept. Accepting atomically locks the session and rejects other pending requests.
- **Lost-message resilience.** Hub channels keep a short backlog replayed by `Last-Event-ID`. The receiver re-announces `ready` until an offer arrives, offers and answers are idempotent, and both sides also poll (heartbeat / request status) as a fallback.
- **Bounded memory.** Files are read in 1 MiB blocks via `File.slice()` and sent as ≤ 64 KiB messages. The sender pauses when `bufferedAmount` exceeds 4 MiB (resuming on `bufferedamountlow`). It also keeps at most 16 MiB in flight beyond what the receiver has confirmed **written**, so a slow disk throttles the sender instead of filling memory.
- **Integrity.** Every chunk carries transfer id, file index, chunk index and byte offset. The receiver rejects anything out of order or past the declared size, verifies byte counts at `file-end`, and only reports completion after every file is closed.
- **Connection lifecycle.** `PeerLink` serializes negotiation, queues early ICE candidates, and has a 30 s connect timeout. It tolerates transient `disconnected` states, ICE-restarts after a 5 s grace period, and fails cleanly after 30 s. Resuming after a page reload is **not** supported; a dropped transfer must be restarted.

---

## Getting started

Requires Node.js 20.9+ (tested on Node 24).

```bash
npm install
cp .env.example .env.local   # optional – every setting has a default
npm run dev                  # http://localhost:3000
```

Open `/send` in one browser and `/receive` in another (or on another device).

### Testing on a phone on your LAN

Browsers only enable folder access and browser storage (OPFS) on secure origins, and `http://192.168.x.x` is not one. Over plain HTTP, ZipLink still works but receives files into memory. For a realistic phone test, use HTTPS:

```bash
npx next dev --experimental-https -H 0.0.0.0
```

Then open `https://<your-LAN-IP>:3000` on the phone and accept the self-signed certificate warning.

---

## Configuration

See [`.env.example`](.env.example). Everything is optional.

| Variable | Default | Purpose |
| --- | --- | --- |
| `SESSION_WAIT_MINUTES` | `30` | How long a code stays valid while waiting for a receiver |
| `JOIN_FAILURE_LIMIT` | `10` | Wrong-code attempts per IP per 10 min before `429` |
| `CREATE_SESSION_LIMIT` | `30` | Sessions per IP per 10 min |
| `RATE_LIMIT_SALT` | `ziplink` | Salt for hashing IPs used as rate-limit keys — **set this** |
| `STUN_URLS` | Google + Cloudflare STUN | Comma-separated; set empty to disable STUN |
| `TURN_URLS` | — | Comma-separated TURN/TURNS URLs |
| `TURN_SECRET` | — | coturn `static-auth-secret`; ZipLink issues short-lived HMAC credentials |
| `TURN_TTL_SECONDS` | `21600` | Lifetime of generated TURN credentials |
| `TURN_USERNAME` / `TURN_CREDENTIAL` | — | Static TURN credentials (alternative to `TURN_SECRET`) |

TURN credentials are only returned to an authorized sender or a receiver who successfully joined. They are never served from a public endpoint.

### STUN / TURN

STUN alone connects most home and mobile networks. Symmetric NATs, corporate firewalls and some carrier networks need a TURN relay. A minimal [coturn](https://github.com/coturn/coturn) config:

```
listening-port=3478
tls-listening-port=5349
fingerprint
use-auth-secret
static-auth-secret=<same value as TURN_SECRET>
realm=ziplink.example.com
cert=/etc/letsencrypt/live/turn.example.com/fullchain.pem
pkey=/etc/letsencrypt/live/turn.example.com/privkey.pem
```

```
TURN_URLS=turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:5349?transport=tcp
TURN_SECRET=<static-auth-secret>
```

When TURN is used, the transfer traffic is relayed through, and consumes the bandwidth of, the TURN server. It remains DTLS-encrypted end to end.

---

## Deployment

Because signaling state lives in process memory, **ZipLink must run as a single, long-lived Node.js instance**:

```bash
npm run build
npm start            # PORT=3000 by default
```

Good fits: a VPS, Docker container, Fly.io / Render / Railway (one instance), or any `next start` host. Put it behind HTTPS (required for folder saving and browser storage, and for most mobile browsers to behave well). If you use a reverse proxy, disable response buffering for `/api/signal/*` (Server-Sent Events). For nginx:

```nginx
location /api/signal/ {
  proxy_pass http://127.0.0.1:3000;
  proxy_http_version 1.1;
  proxy_buffering off;
  proxy_read_timeout 1h;
}
```

**Not supported as-is:** horizontally scaled or serverless deployments (e.g. Vercel functions). Separate instances do not share memory, so a sender and a receiver could land on different instances and never see each other. Long-lived SSE streams also exceed typical function time limits. Scaling out would need a shared store/pub-sub behind `SessionService` and `SignalHub`; it was intentionally left out to keep the project database-free.

Restarting the server ends all *waiting* sessions. Transfers that are already connected keep going, because they are peer-to-peer.

---

## Browser support

| Capability | Chrome / Edge (desktop) | Chrome (Android) | Firefox | Safari (macOS / iOS) |
| --- | --- | --- | --- | --- |
| Send | ✅ | ✅ | ✅ | ✅ 16.4+ |
| Receive straight into a chosen folder | ✅ (`showDirectoryPicker`) | — | — | — |
| Receive into browser storage (OPFS), then save | ✅ | ✅ | ✅ 111+ | ✅ 26+ (`createWritable`) |
| Memory fallback (other / insecure contexts) | ✅ | ✅ | ✅ | ✅ |

- **Folder mode** streams each file to disk. Existing files are never overwritten (`photo (1).jpg`, …), and partial files are deleted on failure or cancel.
- **Browser storage mode** streams into the origin-private file system, then offers a normal download of the disk-backed file. Stale data from earlier visits is cleaned up automatically. A warning is shown if the reported storage quota looks too small.
- **Memory mode** has to hold each file in memory until it completes. ZipLink warns above 512 MB; very large files may fail on memory-constrained devices.
- Folders can't be dropped directly; select the files inside, or zip the folder.

---

## Testing

```bash
npm run typecheck   # next typegen + tsc --noEmit
npm run lint
npm test            # Vitest unit tests
npm run test:e2e    # production build + Playwright (two browser contexts, desktop + mobile viewports)
npm run check       # typecheck + lint + unit tests + build
```

The E2E suite uses your installed Google Chrome (`channel: "chrome"`). Set `PW_CHANNEL=` to use Playwright's bundled Chromium after `npx playwright install chromium`. STUN is disabled during E2E runs, so the tests never leave the machine.

**Unit tests cover:** formatting helpers, code generation, chunk framing and validation (offsets beyond 4 GiB, zero-byte files, partial last chunks), control and signaling message validation, filename sanitization and duplicate numbering, state-machine transitions, and the session service. Service tests include code reservation, collision retries, rate limiting, approval locking, rejection, cancellation, expiry and purge. Transfer-engine tests stream multiple files byte-for-byte through a simulated channel, checking empty, duplicate and Unicode names, backpressure and in-flight bounds, sender and receiver cancellation, tampered chunks and mid-transfer disconnects. `PeerLink` tests cover negotiation, candidate queuing, timeouts, transient disconnects, ICE restart and cleanup.

**E2E tests cover:** a full multi-file transfer with SHA-256 comparison of every downloaded file, rejection, invalid codes, expired invitation links, joining via the QR/share link, sender cancellation mid-transfer, the sender closing the tab mid-transfer, the readiness indicator, and no horizontal overflow at 1280 px and 390 px widths.

---

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| Stuck on "Establishing peer-to-peer connection", then "couldn't reach each other" | NAT/firewall blocks direct UDP. Configure a TURN server (`TURN_URLS` + `TURN_SECRET`). |
| Works on the same Wi-Fi but not across networks | STUN disabled or blocked. Check `STUN_URLS`, and allow outbound UDP 3478/19302. |
| "Signaling service unreachable" on the home page | Server down, or a proxy blocks `/api/*`. |
| Receiver never sees the approval / the page hangs | A proxy is buffering SSE. Disable buffering for `/api/signal/` (see Deployment). |
| Sender and receiver never find each other in production | More than one server instance is running. ZipLink needs a single instance. |
| "Relayed via TURN" when you expected direct | One side is on a restrictive network. This works, but speed depends on the TURN server. |
| No "Choose folder" option | The browser lacks `showDirectoryPicker`, or the page isn't served over HTTPS. |
| "Not enough storage space" | Browser storage quota exceeded. Use a Chromium desktop browser with folder mode, or free up disk space. |
| "Too many incorrect attempts" | Rate limit for wrong codes. Wait for the shown period or use the invitation link. |

---

## Security notes

- The 5-digit code is a convenience, **not** a secret (100,000 possibilities). Protection comes from:
  - rate-limited guessing;
  - short code lifetime;
  - the sender explicitly approving each device, shown with a device label;
  - a single accepted receiver per session.
- QR / link invitations carry a 256-bit token; a link with a wrong or stale token is refused. The receive page removes the token from the address bar and sets `Referrer-Policy: no-referrer`.
- Session tokens and secrets are stored only as SHA-256 hashes and compared in constant time. Rate-limit keys are salted IP hashes.
- All data-channel and signaling messages are schema-validated, and received filenames are sanitized before anything is written.
- WebRTC provides transport encryption (DTLS/SRTP). ZipLink adds no extra application-level encryption.

---

## Project structure

```
src/
  app/                     pages (/, /send, /receive) and API route handlers
    api/sessions/…         create, join, heartbeat, respond, close
    api/requests/…         receiver request status / cancel
    api/signal/[channel]   SSE subscribe (GET) + publish (POST)
  components/              layout, send, receive, transfer, shared, ui
  hooks/                   useSenderSession, useReceiverSession, useServiceStatus, useNow
  lib/
    server/                config, crypto, ICE servers, SessionService, SignalHub (server-only)
    signaling/             browser API client + SSE signaling channel
    webrtc/                PeerLink (RTCPeerConnection lifecycle), ChannelIO (framing + backpressure)
    transfer/              chunk protocol, sender, receiver, save targets, progress, state machine
    session/               Sender/Receiver controllers orchestrating everything for the UI
    utils/                 formatting, codes, randomness, message validation
  types/                   session, signaling, transfer types
tests/
  unit/                    Vitest
  e2e/                     Playwright
```
