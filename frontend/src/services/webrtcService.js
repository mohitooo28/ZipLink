import io from "socket.io-client";
import { toast } from "react-toastify";

class WebRTCService {
    constructor() {
        this.socket = null;
        this.peerConnection = null;
        this.dataChannel = null;
        this.onFileReceived = null;
        this.onTransferProgress = null;
        this.onConnectionStatusChange = null;
        this.onDataChannelReady = null;
        this.sessionCode = null;
        this.isCleaningUp = false;
        this.pcConfig = {
            iceServers: [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" },
                { urls: "stun:stun2.l.google.com:19302" },
            ],
        };
        this.CHUNK_SIZE = 16384;
        this.receivedFiles = new Map();
        this.currentReceiveFile = null;
    }
    connectToSignalingServer() {
        return new Promise((resolve, reject) => {
            const backendUrl =
                import.meta.env.VITE_BACKEND_URL || "http://localhost:3001";
            console.log(`Connecting to signaling server at: ${backendUrl}`);
            this.socket = io(backendUrl, {
                transports: ["websocket", "polling"],
                timeout: 10000,
                forceNew: true,
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionAttempts: 5,
                upgrade: true,
            });
            this.socket.on("connect", () => {
                console.log("Connected to signaling server");
                this.setupSocketListeners();
                resolve(this.socket);
            });
            this.socket.on("connect_error", (error) => {
                console.error("Socket connection error:", error);
                reject(error);
            });
            this.socket.on("disconnect", () => {
                console.log("Disconnected from signaling server");
                this.onConnectionStatusChange?.("disconnected");
            });
        });
    }
    setupSocketListeners() {
        this.socket.on("webrtc-offer", async ({ offer }) => {
            console.log("Received WebRTC offer");
            await this.handleOffer(offer);
        });
        this.socket.on("webrtc-answer", async ({ answer }) => {
            console.log("Received WebRTC answer");
            await this.handleAnswer(answer);
        });
        this.socket.on("webrtc-ice-candidate", ({ candidate }) => {
            console.log("Received ICE candidate");
            this.handleIceCandidate(candidate);
        });
        this.socket.on("session-error", ({ message }) => {
            console.error("Session error:", message);
            toast.error(message, {
                toastId: "session-error",
            });
            this.onConnectionStatusChange?.("failed");
        });
        this.socket.on("peer-disconnected", () => {
            console.log("Peer disconnected");
            if (!this.isCleaningUp) {
                toast.info("Peer disconnected", {
                    autoClose: 2000,
                    toastId: "peer-disconnected",
                });
            }
            this.cleanup();
            this.onConnectionStatusChange?.("disconnected");
        });
        this.socket.on("transfer-complete", () => {
            console.log("Transfer completed");
            toast.success("File transfer completed!", {
                toastId: "transfer-completed",
            });
        });
    }
    createPeerConnection() {
        console.log("Creating peer connection");
        this.peerConnection = new RTCPeerConnection(this.pcConfig);
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log("Sending ICE candidate");
                this.socket.emit("webrtc-ice-candidate", {
                    sessionCode: this.sessionCode,
                    candidate: event.candidate,
                });
            } else {
                console.log("ICE candidate gathering complete");
            }
        };
        this.peerConnection.onconnectionstatechange = () => {
            const state = this.peerConnection.connectionState;
            console.log("Connection state changed to:", state);
            if (state === "connected") {
                console.log("WebRTC peer connection established successfully");
            } else if (state === "failed" || state === "disconnected") {
                console.log("WebRTC connection failed or disconnected");
                this.onConnectionStatusChange?.(state);
                if (state === "failed") {
                    toast.error("Peer connection failed", {
                        toastId: "peer-connection-failed",
                    });
                }
            }
        };
        this.peerConnection.ondatachannel = (event) => {
            console.log("Data channel received");
            this.setupDataChannel(event.channel);
        };
        this.peerConnection.onicegatheringstatechange = () => {
            console.log(
                "ICE gathering state:",
                this.peerConnection.iceGatheringState
            );
        };
        this.peerConnection.oniceconnectionstatechange = () => {
            console.log(
                "ICE connection state:",
                this.peerConnection.iceConnectionState
            );
        };
        return this.peerConnection;
    }
    setupDataChannel(channel) {
        this.dataChannel = channel;
        this.dataChannel.binaryType = "arraybuffer";
        this.dataChannel.onopen = () => {
            console.log("Data channel opened");
            this.onConnectionStatusChange?.("connected");
            this.onDataChannelReady?.();
            toast.success("Connected! Ready for file transfer.", {
                toastId: "data-channel-ready",
            });
        };
        this.dataChannel.onclose = () => {
            console.log("Data channel closed");
        };
        this.dataChannel.onmessage = (event) => {
            this.handleDataChannelMessage(event.data);
        };
        this.dataChannel.onerror = (error) => {
            console.error("Data channel error:", error);
            if (
                this.dataChannel &&
                this.dataChannel.readyState !== "closed" &&
                this.dataChannel.readyState !== "closing"
            ) {
                toast.error("Data transfer error occurred", {
                    toastId: "data-channel-error",
                });
            }
        };
    }
    handleDataChannelMessage(data) {
        try {
            if (typeof data === "string") {
                const message = JSON.parse(data);
                this.handleControlMessage(message);
            } else {
                this.handleFileChunk(data);
            }
        } catch (error) {
            console.error("Error handling data channel message:", error);
        }
    }
    handleControlMessage(message) {
        console.log("Control message:", message.type);
        switch (message.type) {
            case "file-start":
                this.startReceivingFile(message);
                break;
            case "file-complete":
                this.completeFileReceive(message);
                break;
            case "transfer-complete":
                console.log("All files transferred");
                break;
            default:
                console.log("Unknown control message:", message);
        }
    }
    startReceivingFile(fileInfo) {
        const { id, name, size, mimeType, index } = fileInfo;
        console.log(`Starting to receive file: ${name} (${size} bytes)`);
        this.currentReceiveFile = {
            id,
            name,
            size,
            mimeType,
            index,
            chunks: [],
            receivedBytes: 0,
        };
        this.receivedFiles.set(id, this.currentReceiveFile);
    }
    handleFileChunk(data) {
        if (!this.currentReceiveFile) return;
        this.currentReceiveFile.chunks.push(new Uint8Array(data));
        this.currentReceiveFile.receivedBytes += data.byteLength;
        const progress = Math.round(
            (this.currentReceiveFile.receivedBytes /
                this.currentReceiveFile.size) *
                100
        );
        this.onTransferProgress?.(
            this.currentReceiveFile.id,
            progress,
            this.currentReceiveFile.name
        );
    }
    completeFileReceive(fileInfo) {
        const { id } = fileInfo;
        const fileData = this.receivedFiles.get(id);
        if (fileData) {
            console.log(`File transfer complete: ${fileData.name}`);
            const blob = new Blob(fileData.chunks, { type: fileData.mimeType });
            if (this.onFileReceived) {
                this.onFileReceived(blob, fileData.name, fileData.size);
            } else {
                console.error("onFileReceived callback is not set!");
            }
            this.currentReceiveFile = null;
        }
    }
    async createOffer(sessionCode) {
        this.sessionCode = sessionCode;
        this.createPeerConnection();
        this.dataChannel = this.peerConnection.createDataChannel(
            "fileTransfer",
            {
                ordered: true,
                maxRetransmits: 3,
            }
        );
        this.setupDataChannel(this.dataChannel);
        try {
            const offer = await this.peerConnection.createOffer();
            await this.peerConnection.setLocalDescription(offer);
            console.log("Sending WebRTC offer");
            this.socket.emit("webrtc-offer", {
                sessionCode,
                offer,
            });
        } catch (error) {
            console.error("Error creating offer:", error);
            throw error;
        }
    }
    async handleOffer(offer) {
        this.createPeerConnection();
        try {
            await this.peerConnection.setRemoteDescription(offer);
            const answer = await this.peerConnection.createAnswer();
            await this.peerConnection.setLocalDescription(answer);
            console.log("Sending WebRTC answer");
            this.socket.emit("webrtc-answer", {
                sessionCode: this.sessionCode,
                answer,
            });
        } catch (error) {
            console.error("Error handling offer:", error);
            throw error;
        }
    }
    async handleAnswer(answer) {
        try {
            await this.peerConnection.setRemoteDescription(answer);
            console.log("WebRTC answer processed");
        } catch (error) {
            console.error("Error handling answer:", error);
            throw error;
        }
    }
    async handleIceCandidate(candidate) {
        if (this.peerConnection && this.peerConnection.remoteDescription) {
            try {
                await this.peerConnection.addIceCandidate(candidate);
                console.log("ICE candidate added");
            } catch (error) {
                console.error("Error adding ICE candidate:", error);
            }
        }
    }
    async sendFiles(files) {
        if (!this.dataChannel || this.dataChannel.readyState !== "open") {
            throw new Error("Data channel not ready");
        }
        console.log(`Starting to send ${files.length} files`);
        for (let i = 0; i < files.length; i++) {
            await this.sendFile(files[i], i);
        }
        this.dataChannel.send(
            JSON.stringify({
                type: "transfer-complete",
            })
        );
        console.log("All files sent");
    }
    async sendFile(file, index) {
        const fileId = `file_${index}`;
        console.log(`Sending file: ${file.name} (${file.size} bytes)`);
        this.dataChannel.send(
            JSON.stringify({
                type: "file-start",
                id: fileId,
                name: file.name,
                size: file.size,
                mimeType: file.type,
                index: index,
            })
        );
        let offset = 0;
        return new Promise((resolve, reject) => {
            const sendNextChunk = () => {
                if (offset >= file.size) {
                    this.dataChannel.send(
                        JSON.stringify({
                            type: "file-complete",
                            id: fileId,
                            index: index,
                        })
                    );
                    console.log(`File ${file.name} sent completely`);
                    resolve();
                    return;
                }
                if (this.dataChannel.bufferedAmount > 16 * 1024 * 1024) {
                    setTimeout(sendNextChunk, 10);
                    return;
                }
                const chunk = file.slice(offset, offset + this.CHUNK_SIZE);
                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        this.dataChannel.send(event.target.result);
                        offset += chunk.size;
                        const progress = Math.round((offset / file.size) * 100);
                        this.onTransferProgress?.(fileId, progress, file.name);
                        sendNextChunk();
                    } catch (error) {
                        console.error("Error sending chunk:", error);
                        reject(error);
                    }
                };
                reader.onerror = () => {
                    console.error("FileReader error");
                    reject(new Error("File read error"));
                };
                reader.readAsArrayBuffer(chunk);
            };
            sendNextChunk();
        });
    }
    cleanup() {
        console.log("Cleaning up WebRTC service");
        this.isCleaningUp = true;
        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }
        if (this.peerConnection) {
            this.peerConnection.close();
            this.peerConnection = null;
        }
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.receivedFiles.clear();
        this.currentReceiveFile = null;
        this.sessionCode = null;
        this.isCleaningUp = false;
    }
}
export default WebRTCService;
