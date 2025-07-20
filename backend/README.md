# 🖥️ ZipLink Backend

A Node.js server with Socket.IO for WebRTC signaling and peer-to-peer file transfer coordination.

## 🏗️ Folder Structure

```
backend/
├── server.js        # 🔧 Main server file
├── package.json     # 📦 Dependencies & scripts
├── render.yaml      # 🚀 Render.com deployment config
└── README.md        # 📝 This file
```

## 🚀 Quick Start

### Prerequisites

-   **Node.js** 16+
-   **npm/yarn/pnpm**

### Installation

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Start development server (with nodemon)
npm run dev

# Start production server
npm start
```

## 📡 API Endpoints

| Method      | Endpoint  | Description                             |
| ----------- | --------- | --------------------------------------- |
| `GET`       | `/health` | Server health check                     |
| `WebSocket` | `/`       | Socket.IO connection for peer signaling |

## 🔌 Socket.IO Events

| Event           | Direction                | Description              |
| --------------- | ------------------------ | ------------------------ |
| `join-room`     | Client → Server          | Join a file sharing room |
| `leave-room`    | Client → Server          | Leave current room       |
| `offer`         | Client → Server → Client | WebRTC offer exchange    |
| `answer`        | Client → Server → Client | WebRTC answer exchange   |
| `ice-candidate` | Client → Server → Client | ICE candidate exchange   |
| `user-joined`   | Server → Client          | Notify when peer joins   |
| `user-left`     | Server → Client          | Notify when peer leaves  |

## 🛡️ Security Features

-   **CORS Protection** - Configurable allowed origins
-   **Security Headers** - X-Content-Type-Options, X-Frame-Options, etc.
-   **Input Validation** - Room ID and event validation
-   **Connection Timeout** - Automatic cleanup of stale connections

## 📱 Development

-   **Dev Server**: [http://localhost:3000](http://localhost:3000)
-   **Health Check**: [http://localhost:3000/health](http://localhost:3000/health)
-   **Auto Restart**: Enabled with nodemon in dev mode

## 🛠️ Built With

-   🟢 **Node.js + Express** - Server framework
-   🔌 **Socket.IO** - Real-time WebRTC signaling
-   🛡️ **CORS** - Cross-origin security
-   🚀 **Render.com** - Production deployment ready
