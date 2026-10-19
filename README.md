# ZipLink - Secure Peer-to-Peer File Sharing

<div align="center">
  <img src="src/app/icon.svg" alt="ZipLink Logo" width="180">
  <br><br>

  **Share files directly between devices with no uploads and no account**

  [![Next.js](https://img.shields.io/badge/Next.js-16.4.2-black.svg?logo=next.js)](https://nextjs.org/)
  [![React](https://img.shields.io/badge/React-19.3.0-61DAFB.svg?logo=react&logoColor=20232A)](https://react.dev/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4.svg?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
  [![WebRTC](https://img.shields.io/badge/WebRTC-Peer--to--Peer-333333.svg)](https://webrtc.org/)
  [![Tests](https://img.shields.io/badge/tests-Vitest%20%2B%20Playwright-6E9F18.svg)](https://vitest.dev/)
</div>

---

## Key Features

- **Direct P2P Transfers** - Send files browser-to-browser over a WebRTC data channel.
- **Encrypted Transport** - WebRTC provides DTLS encryption for transfer traffic.
- **Any File Type** - Share documents, images, videos, archives, and more.
- **Multi-file Support** - Queue and transfer multiple files in one session.
- **Sender Approval** - The sender sees the joining device and explicitly accepts it.
- **Simple Invitations** - Share a short 5-digit code, QR code, or invitation link.
- **Real-time Progress** - Follow connection state, per-file progress, and overall progress.
- **No Server Storage** - File contents and file metadata stay between the peers.
- **NAT Traversal** - Uses STUN by default, with optional TURN relay support.
- **Responsive Experience** - Works across desktop, tablet, and mobile browsers.
- **Flexible Saving** - Save directly to a folder, browser storage, or memory fallback.

> ZipLink's server handles session coordination and WebRTC signaling only. It never
> receives or stores the files being transferred.

## Architecture

```text
ZipLink/
├── src/
│   ├── app/                   # Pages, metadata, and API route handlers
│   │   ├── page.tsx           # Home page
│   │   ├── send/              # Sender flow
│   │   ├── receive/           # Receiver flow
│   │   └── api/               # Sessions, requests, status, and signaling
│   ├── components/            # Layout, UI, send, receive, and transfer components
│   ├── hooks/                 # Client-side session and service hooks
│   ├── lib/
│   │   ├── server/            # In-memory sessions, signaling, crypto, and ICE config
│   │   ├── signaling/         # Browser API and SSE signaling clients
│   │   ├── session/           # Sender and receiver controllers
│   │   ├── transfer/          # Chunking, validation, progress, and file writers
│   │   └── webrtc/            # Peer connection and data-channel lifecycle
│   └── types/                 # Shared TypeScript types
├── tests/
│   ├── unit/                  # Vitest unit and service tests
│   └── e2e/                   # Playwright browser tests
├── .env.example               # Optional server configuration
├── next.config.ts             # Next.js and Turbopack configuration
└── package.json               # Scripts and dependencies
```

## How It Works

```text
 Sender browser                 ZipLink server                  Receiver browser
 ──────────────                 ───────────────                  ────────────────
 Create session  ────────────▶ Reserve code in memory
                               Send join request ◀────────────── Join with code
 Approve device  ────────────▶ Exchange SDP and ICE via SSE ◀─── Wait for approval

 ════════════════ Encrypted WebRTC data channel between browsers ════════════════
 File manifest  ─────────────────────────────────────────────▶ Review and accept
 File chunks    ─────────────────────────────────────────────▶ Write to disk
 Progress       ◀───────────────────────────────────────────── Confirm bytes written
```

The server relays signaling messages such as SDP offers, answers, and ICE candidates.
The actual file names, sizes, types, and contents are exchanged only after approval
over the peer-to-peer data channel.

## Quick Start

### Prerequisites

- **Node.js 20.9 or newer**
- **npm**
- A modern browser with WebRTC support

### 1. Clone and install

```bash
git clone https://github.com/mohitooo28/ZipLink.git
cd ZipLink
npm install
```

### 2. Configure the environment

All configuration is optional for local development. To use the documented defaults:

```bash
copy .env.example .env.local
```

On macOS or Linux, use:

```bash
cp .env.example .env.local
```

At minimum, set a private `RATE_LIMIT_SALT` before deploying.

### 3. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), then:

- Choose **Send files** in one browser.
- Choose **Receive files** in another browser or on another device.
- Share the displayed code, QR code, or invitation link.

### Testing from a phone on your local network

For the best mobile experience, use HTTPS so browser storage and folder APIs are
available:

```bash
npx next dev --experimental-https -H 0.0.0.0
```

Then open `https://<your-LAN-IP>:3000` on the phone and accept the local
self-signed certificate warning.

## How to Use

### For Senders

1. Open ZipLink and select **Send files**.
2. Add one or more files using the picker or drop zone.
3. Create a session to generate a 5-digit code.
4. Share the code, QR code, or invitation link with the receiver.
5. Review the joining device and click **Accept**.
6. Monitor the connection and transfer progress.
7. Keep the page open until every file is complete.

### For Receivers

1. Open ZipLink and select **Receive files**.
2. Enter the sender's 5-digit code, or open the invitation link.
3. Wait for the sender to approve the device.
4. Review the file manifest and choose a save destination when available.
5. Keep the page open while the files transfer.
6. Confirm the completed files in the selected folder or browser downloads.

### Recommendations

- Keep both devices connected to stable networks.
- Use a Chromium-based desktop browser for direct folder saving.
- Use HTTPS for mobile browser storage and the best compatibility.
- If direct connectivity fails, configure a TURN server.
- Folders cannot be dropped directly; select their files or create an archive first.
- A disconnected transfer must be restarted; page reload resume is not supported.

## WebRTC Flow

| Step | Action | Description |
| --- | --- | --- |
| `1` | **Create session** | The sender reserves a unique 5-digit code. |
| `2` | **Join session** | The receiver enters the code or uses an invitation token. |
| `3` | **Approve device** | The sender reviews the device label and accepts one receiver. |
| `4` | **Signal peers** | SDP offers, answers, and ICE candidates travel through SSE signaling. |
| `5` | **Connect peers** | Browsers establish a DTLS-encrypted WebRTC data channel. |
| `6` | **Transfer files** | Files stream in validated chunks with backpressure and progress updates. |
| `7` | **Complete** | Both browsers confirm that all files were written successfully. |

### Direct and relayed connections

ZipLink uses public STUN servers by default to discover a direct route. Restrictive
NATs, firewalls, and carrier networks may require an optional TURN relay. Even when
TURN is used, WebRTC traffic remains DTLS-encrypted end to end. The interface shows
whether a connection is **Direct peer-to-peer** or **Relayed via TURN**.

## Tech Stack

**Application**

- **Next.js 16 App Router** - Full-stack application and API routes
- **React 19** - Interactive UI
- **TypeScript** - Strict type safety
- **Tailwind CSS 4** - Styling
- **Lucide React** - Interface icons
- **Sonner** - Toast notifications
- **QRCode React** - QR invitation rendering

**Core Technology**

- **WebRTC** - Encrypted peer-to-peer file transfer
- **Server-Sent Events** - Real-time signaling delivery
- **In-memory session service** - Database-free session coordination
- **STUN/TURN ICE servers** - Network traversal and optional relaying

**Testing**

- **Vitest** - Unit, protocol, state-machine, and service tests
- **Playwright** - End-to-end transfer tests across browser contexts


## Development and Testing

```bash
npm run typecheck   # Generate Next.js types and run TypeScript checks
npm run lint        # Run ESLint
npm test            # Run Vitest unit tests
npm run test:e2e    # Build and run Playwright end-to-end tests
npm run check       # Run typecheck, lint, unit tests, and build
```

The test suite covers signaling validation, session lifecycle, rate limiting,
filename sanitization, chunk framing, backpressure, cancellation, disconnects,
ICE negotiation, and complete multi-file transfers.

## Security and Privacy

- Files are never uploaded to or stored by the ZipLink server.
- The 5-digit code is a convenience identifier, not a secret; guessing is rate-limited.
- Senders must explicitly approve a receiver before metadata or file contents are shared.
- Invitation links contain a high-entropy token and stale or invalid tokens are rejected.
- Session secrets are hashed and compared safely on the server.
- Signaling and transfer messages are schema-validated.
- Received file names are sanitized before being written to disk.
- A TURN relay can see encrypted traffic metadata, but cannot decrypt file contents.

## License

No license file is currently included in this repository. Add a `LICENSE` file and
update this section if you intend to publish ZipLink under a specific open-source
license.

---

<div align="center">

**Built with ❤️ for secure, fast, and private file sharing**

[🌟 Star this repo](../../stargazers) • [🐛 Report Bug](../../issues) • [💡 Request Feature](../../issues)


</div>
