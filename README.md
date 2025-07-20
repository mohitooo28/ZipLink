# 🚀 ZipLink - Secure Peer-to-Peer File Sharing

<div align="center">
  <img src="frontend/src/assets/logo.svg" alt="ZipLink Logo" width="220"> <br/>  <br/>  
  
  **A modern, secure, and lightning-fast P2P file sharing platform with WebRTC technology**
  
  [![React](https://img.shields.io/badge/React-19.1.0-blue.svg)](https://reactjs.org/)
  [![Node.js](https://img.shields.io/badge/Node.js-16+-green.svg)](https://nodejs.org/)
  [![Express](https://img.shields.io/badge/Express-5.1.0-black.svg)](https://expressjs.com/)
  [![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8.1-010101.svg)](https://socket.io/)
  [![Vite](https://img.shields.io/badge/Vite-7.0.4-646CFF.svg)](https://vitejs.dev/)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.1.11-06B6D4.svg)](https://tailwindcss.com/)
  [![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
</div>

---

## ✨ Key Features

-   **🚀 P2P File Transfer** - Direct browser-to-browser sharing via WebRTC with no server storage
-   **🔒 End-to-End Encryption** - Built-in DTLS/SRTP encryption for secure file transmission
-   **📁 Multi-file Support** - Share multiple files simultaneously with drag & drop interface
-   **⚡ Real-time Progress** - Live transfer progress tracking with connection status indicators
-   **📱 Cross-platform** - Works seamlessly on desktop, tablet, and mobile browsers
-   **🎨 Modern UI** - Clean React interface with Lottie animations and responsive design
-   **🔗 One-Click Sharing** - Simple room-based sharing with QR code generation
-   **⏱️ No File Size Limits** - Transfer files of any size without restrictions
-   **🛡️ Secure Headers** - Comprehensive security with CORS protection and input validation
-   **🔄 Connection Fallback** - Automatic retry mechanisms for reliable connections

## 🏗️ Architecture

```
ZipLink/
├── 📁 backend/
│   ├── server.js            # 🔧 Socket.IO server & API
│   └── package.json         # 📦 Dependencies
│
├── 📁 frontend/
│   ├── src/
│   │   ├── 🎨 components/   # UI components
│   │   ├── 📄 pages/        # Send, Receive, Transfer pages
│   │   ├── 🔗 services/     # WebRTC connection logic
│   │   ├── 🗃️ store/        # Zustand state management
│   │   └── 🎭 assets/       # Logo & Lottie animations
│   └──  package.json        # 📦 Dependencies
│
└── 📝 README.md
```

## 🚀 Quick Start

### Prerequisites

-   **Node.js** 16+
-   **Modern Browser** with WebRTC support
-   **npm/yarn/pnpm**

### 1. Clone & Setup

```bash
# Clone the repository
git clone https://github.com/mohitooo28/ZipLink
cd ZipLink

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Frontend Environment Configuration

```env
# API Configuration
VITE_API_BASE_URL=http://localhost:3000
```

### 3. Start Development Servers

```bash
# Terminal 1 - Start backend server
cd backend
npm run dev

# Terminal 2 - Start frontend server
cd frontend
npm run dev
```

🎉 **Access the application:**

-   **Frontend**: [http://localhost:5173](http://localhost:5173)
-   **Backend API**: [http://localhost:3000](http://localhost:3000)
-   **Health Check**: [http://localhost:3000/health](http://localhost:3000/health)

## 📖 How to Use

### 🚀 For Senders (Sharing Files)

1. **Open ZipLink** and click **"Send Files"**
2. **Select Files** using the drag & drop zone or click to browse
3. **Create Room** - A unique room ID will be generated automatically
4. **Share the Room ID** with your recipient via:
5. **Wait for Connection** - You'll see when the receiver joins
6. **Start Transfer** - Files begin transferring automatically once connected
7. **Monitor Progress** - Track transfer progress in real-time
8. **Transfer Complete** - Both parties will be notified when finished

### 📥 For Receivers (Getting Files)

1. **Get the Room ID** from the sender
2. **Open ZipLink** and click **"Receive Files"**
3. **Enter Room ID** in the input field and click "Join Room"
4. **Connection Established** - You'll see the connection status
5. **Accept Files** - Preview file list and accept the transfer
6. **Download Progress** - Watch files download in real-time
7. **Files Saved** - Files are automatically saved to your Downloads folder
8. **Transfer Complete** - Receive confirmation when all files are downloaded

### 💡 Pro Tips

-   **Stable Connection**: Ensure both devices have stable internet for best performance
-   **File Types**: Supports all file types - documents, images, videos, archives, etc.
-   **Multiple Files**: Select multiple files or entire folders to share at once
-   **Privacy**: Files are transferred directly between devices, never stored on servers
-   **Browser Support**: Works on Chrome, Firefox, Safari, and Edge (WebRTC required)

## 🔌 WebRTC Flow

| Step | Action                     | Description                           |
| ---- | -------------------------- | ------------------------------------- |
| `1`  | **Room Creation**          | Sender creates a unique room ID       |
| `2`  | **Peer Discovery**         | Receiver joins using the room ID      |
| `3`  | **WebRTC Handshake**       | ICE candidates and offers exchanged   |
| `4`  | **Connection Established** | Direct P2P data channel created       |
| `5`  | **File Transfer**          | Files transferred directly via WebRTC |
| `6`  | **Transfer Complete**      | Connection closed, files downloaded   |

## 🛠️ Tech Stack

**🖥️ Backend**

-   🟢 **Node.js + Express** - Server framework
-   🔌 **Socket.IO** - Real-time signaling
-   🛡️ **CORS** - Security headers

**💻 Frontend**

-   ⚛️ **React 19** - UI framework
-   ⚡ **Vite 7** - Build tool & dev server
-   🎨 **Tailwind CSS 4** - Styling
-   🔄 **Zustand** - State management
-   🌐 **React Router** - Navigation
-   🔔 **React Toastify** - Notifications
-   📂 **React Dropzone** - File handling
-   🎬 **Lottie React** - Animations
-   🗃️ **File Saver** - Downloads

**🔗 Core Technology**

-   📡 **WebRTC** - P2P file transfer
-   🆔 **Nanoid** - Room ID generation

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built with ❤️ for secure, fast, and private file sharing**

[🌟 Star this repo](../../stargazers) • [🐛 Report Bug](../../issues) • [💡 Request Feature](../../issues)

</div>
