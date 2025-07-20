const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");

const app = express();
const server = http.createServer(app);

app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
        "Permissions-Policy",
        "geolocation=(), microphone=(), camera=()"
    );
    next();
});

const allowedOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "https://ziplink-io.vercel.app",
];

const io = socketIo(server, {
    cors: {
        origin: allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true,
    },
    transports: ["websocket", "polling"],
    allowEIO3: true,
});

app.use(
    cors({
        origin: allowedOrigins,
        credentials: true,
    })
);

app.use(express.json());

app.get("/health", (req, res) => {
    res.status(200).json({
        status: "OK",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
    });
});

app.get("/test", (req, res) => {
    res.json({
        message: "ZipLink backend is accessible!",
        timestamp: new Date().toISOString(),
        clientIP: req.ip || req.connection.remoteAddress,
        allowedOrigins: allowedOrigins,
    });
});

const sessions = new Map();

setInterval(() => {
    const now = Date.now();
    for (const [sessionId, session] of sessions.entries()) {
        if (now - session.createdAt > 5 * 60 * 1000) {
            sessions.delete(sessionId);
            console.log(`Session ${sessionId} expired and removed`);
        }
    }
}, 60000);

io.on("connection", (socket) => {
    const clientOrigin = socket.request.headers.origin;
    const transport = socket.conn.transport.name;
    console.log(
        `Client connected: ${socket.id} from: ${clientOrigin} via ${transport}`
    );

    socket.conn.on("upgrade", () => {
        console.log(`Socket ${socket.id} upgraded to WebSocket`);
    });

    socket.on("create-session", (data) => {
        const { sessionCode } = data;

        console.log(`Attempting to create session: ${sessionCode}`);

        if (sessions.has(sessionCode)) {
            console.log(`Session code ${sessionCode} already exists`);
            socket.emit("session-error", {
                message: "Session code already exists",
            });
            return;
        }

        sessions.set(sessionCode, {
            senderId: socket.id,
            receiverId: null,
            createdAt: Date.now(),
            status: "waiting",
        });

        socket.join(sessionCode);
        socket.emit("session-created", { sessionCode });
        console.log(`Session created: ${sessionCode} by ${socket.id}`);
    });

    socket.on("join-session", (data) => {
        const { sessionCode } = data;
        const session = sessions.get(sessionCode);

        console.log(`Receiver attempting to join session: ${sessionCode}`);

        if (!session) {
            console.log(`Session ${sessionCode} not found`);
            socket.emit("session-error", { message: "Session not found" });
            return;
        }

        if (session.receiverId) {
            console.log(`Session ${sessionCode} already has a receiver`);
            socket.emit("session-error", {
                message: "Session already has a receiver",
            });
            return;
        }

        session.receiverId = socket.id;
        session.status = "pending";
        socket.join(sessionCode);

        io.to(session.senderId).emit("connection-request", {
            receiverId: socket.id,
            sessionCode,
        });

        socket.emit("waiting-for-approval", { sessionCode });
        console.log(`Receiver ${socket.id} joined session: ${sessionCode}`);
    });

    socket.on("accept-connection", (data) => {
        const { sessionCode, receiverId } = data;
        const session = sessions.get(sessionCode);

        if (!session || session.senderId !== socket.id) {
            socket.emit("session-error", {
                message: "Invalid session or permission",
            });
            return;
        }

        session.status = "connected";

        io.to(sessionCode).emit("connection-accepted", { sessionCode });
        console.log(`Connection accepted for session: ${sessionCode}`);
    });

    socket.on("reject-connection", (data) => {
        const { sessionCode, receiverId } = data;
        const session = sessions.get(sessionCode);

        if (!session || session.senderId !== socket.id) {
            socket.emit("session-error", {
                message: "Invalid session or permission",
            });
            return;
        }

        io.to(receiverId).emit("connection-rejected", { sessionCode });

        session.receiverId = null;
        session.status = "waiting";

        console.log(`Connection rejected for session: ${sessionCode}`);
    });

    socket.on("webrtc-offer", (data) => {
        const { sessionCode, offer } = data;
        const session = sessions.get(sessionCode);

        if (session && session.senderId === socket.id) {
            io.to(session.receiverId).emit("webrtc-offer", { offer });
        }
    });

    socket.on("webrtc-answer", (data) => {
        const { sessionCode, answer } = data;
        const session = sessions.get(sessionCode);

        if (session && session.receiverId === socket.id) {
            io.to(session.senderId).emit("webrtc-answer", { answer });
        }
    });

    socket.on("webrtc-ice-candidate", (data) => {
        const { sessionCode, candidate } = data;
        const session = sessions.get(sessionCode);

        if (!session) return;

        const targetId =
            session.senderId === socket.id
                ? session.receiverId
                : session.senderId;
        if (targetId) {
            io.to(targetId).emit("webrtc-ice-candidate", { candidate });
        }
    });

    socket.on("transfer-complete", (data) => {
        const { sessionCode } = data;
        const session = sessions.get(sessionCode);

        if (session) {
            io.to(sessionCode).emit("transfer-complete", data);
            sessions.delete(sessionCode);
            console.log(
                `Transfer completed and session ${sessionCode} cleaned up`
            );
        }
    });

    socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id);

        for (const [sessionCode, session] of sessions.entries()) {
            if (
                session.senderId === socket.id ||
                session.receiverId === socket.id
            ) {
                const otherPartyId =
                    session.senderId === socket.id
                        ? session.receiverId
                        : session.senderId;
                if (otherPartyId) {
                    io.to(otherPartyId).emit("peer-disconnected", {
                        sessionCode,
                    });
                }
                sessions.delete(sessionCode);
                console.log(
                    `Session ${sessionCode} cleaned up due to disconnect`
                );
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, "0.0.0.0", () => {
    console.log(`ZipLink signaling server running on port ${PORT}`);
    console.log(`Server accessible on all network interfaces`);
    console.log(`Local access: http://localhost:${PORT}`);
});
