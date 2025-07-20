import { create } from "zustand";
import { nanoid } from "nanoid";
const useAppStore = create((set, get) => ({
    sessionCode: null,
    role: null,
    connectionStatus: "disconnected",
    selectedFiles: [],
    transferProgress: {},
    fileNames: {},
    transferComplete: false,
    receivedFiles: [],
    peerConnection: null,
    dataChannel: null,
    socket: null,
    webrtcService: null,
    waitingForApproval: false,
    showConnectionRequest: false,
    requestingPeer: null,
    setSessionCode: (code) => set({ sessionCode: code }),
    setRole: (role) => set({ role }),
    setConnectionStatus: (status) => set({ connectionStatus: status }),
    generateSessionCode: () => {
        const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let code = "";
        for (let i = 0; i < 8; i++) {
            code += characters.charAt(
                Math.floor(Math.random() * characters.length)
            );
        }
        set({ sessionCode: code });
        return code;
    },
    setSelectedFiles: (files) => set({ selectedFiles: files }),
    setReceivedFiles: (files) => set({ receivedFiles: files }),
    updateTransferProgress: (fileId, progress, fileName = null) =>
        set((state) => ({
            transferProgress: {
                ...state.transferProgress,
                [fileId]: progress,
            },
            ...(fileName && {
                fileNames: {
                    ...state.fileNames,
                    [fileId]: fileName,
                },
            }),
        })),
    setPeerConnection: (pc) => set({ peerConnection: pc }),
    setDataChannel: (channel) => set({ dataChannel: channel }),
    setSocket: (socket) => set({ socket }),
    setWebrtcService: (service) => set({ webrtcService: service }),
    setWaitingForApproval: (waiting) => set({ waitingForApproval: waiting }),
    setShowConnectionRequest: (show) => set({ showConnectionRequest: show }),
    setRequestingPeer: (peer) => set({ requestingPeer: peer }),
    setTransferComplete: (complete) => set({ transferComplete: complete }),
    endSession: () => {
        const { webrtcService, socket } = get();
        if (webrtcService) {
            webrtcService.cleanup();
        }
        if (socket) {
            socket.disconnect();
        }
        set({
            sessionCode: null,
            role: null,
            connectionStatus: "disconnected",
            selectedFiles: [],
            transferProgress: {},
            fileNames: {},
            transferComplete: false,
            receivedFiles: [],
            peerConnection: null,
            dataChannel: null,
            socket: null,
            webrtcService: null,
            waitingForApproval: false,
            showConnectionRequest: false,
            requestingPeer: null,
        });
    },
    resetSession: () =>
        set({
            sessionCode: null,
            role: null,
            connectionStatus: "disconnected",
            selectedFiles: [],
            transferProgress: {},
            fileNames: {},
            transferComplete: false,
            peerConnection: null,
            dataChannel: null,
            waitingForApproval: false,
            showConnectionRequest: false,
            requestingPeer: null,
        }),
    cleanup: () => {
        const { peerConnection, dataChannel, socket, webrtcService } = get();
        if (webrtcService) {
            webrtcService.cleanup();
        }
        if (dataChannel) {
            dataChannel.close();
        }
        if (peerConnection) {
            peerConnection.close();
        }
        if (socket) {
            socket.disconnect();
        }
        set({
            peerConnection: null,
            dataChannel: null,
            socket: null,
            webrtcService: null,
        });
    },
}));
export default useAppStore;
