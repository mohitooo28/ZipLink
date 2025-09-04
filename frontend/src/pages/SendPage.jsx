import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "react-toastify";
import Lottie from "lottie-react";
import useAppStore from "../store/useAppStore";
import WebRTCService from "../services/webrtcService";
import { AnimatedBackdrop, QRCodeDisplay } from "../components";
import sendFileAnimation from "../assets/lottie/send_file.json";
import hourGlass from "../assets/lottie/hourglass.json";

const SendPage = () => {
  const navigate = useNavigate();

  const {
    sessionCode,
    selectedFiles,
    webrtcService,
    showConnectionRequest,
    requestingPeer,
    generateSessionCode,
    setRole,
    setSelectedFiles,
    setConnectionStatus,
    setSocket,
    setRequestingPeer,
    setShowConnectionRequest,
    setWebrtcService,
  } = useAppStore();

  useEffect(() => {
    if (!webrtcService) {
      const service = new WebRTCService();
      setWebrtcService(service);
    }
  }, [webrtcService, setWebrtcService]);

  const [sessionCreated, setSessionCreated] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [sessionTimer, setSessionTimer] = useState(null);
  const [showQRCode, setShowQRCode] = useState(false);
  const [isCreatingSession, setIsCreatingSession] = useState(false);

  useEffect(() => {
    setRole("sender");

    return () => {
      if (sessionTimer) {
        clearTimeout(sessionTimer);
      }
    };
  }, [sessionTimer]);

  useEffect(() => {
    if (sessionCreated && !showConnectionRequest) {
      const timer = setTimeout(() => {
        setSessionExpired(true);
        toast.error("Session expired. Redirecting to home page...", {
          autoClose: 3000,
          toastId: "session-expired",
        });

        setTimeout(() => {
          webrtcService?.cleanup();
          navigate("/");
        }, 3000);
      }, 300000);

      setSessionTimer(timer);

      return () => {
        if (timer) {
          clearTimeout(timer);
        }
      };
    }
  }, [sessionCreated, showConnectionRequest, webrtcService, navigate]);

  useEffect(() => {
    if (showConnectionRequest && sessionTimer) {
      clearTimeout(sessionTimer);
      setSessionTimer(null);
    }
  }, [showConnectionRequest, sessionTimer]);

  useEffect(() => {
    if (showConnectionRequest && showQRCode) {
      setShowQRCode(false);
    }
  }, [showConnectionRequest, showQRCode]);

  const onDrop = (acceptedFiles) => {
    setSelectedFiles(acceptedFiles);
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
  });

  const handleCreateSession = async () => {
    if (selectedFiles.length === 0) {
      toast.error("Please select files to share first");
      return;
    }
    if (!webrtcService) {
      toast.error("WebRTC service not ready. Please refresh the page.");
      return;
    }

    setIsCreatingSession(true);

    try {
      const socket = await webrtcService.connectToSignalingServer();
      setSocket(socket);
      const code = generateSessionCode();
      socket.on("session-created", () => {
        setSessionCreated(true);
        setIsCreatingSession(false);
        toast.success("Session created! Share the code with receiver.");
      });
      socket.on("connection-request", ({ receiverId }) => {
        setRequestingPeer(receiverId);
        setShowConnectionRequest(true);
      });
      socket.on("connection-accepted", () => {
        setShowConnectionRequest(false);
        setConnectionStatus("connecting");
        webrtcService.onConnectionStatusChange = (status) => {
          setConnectionStatus(status);
          if (status === "connected") {
            navigate("/transfer");
          }
        };
        webrtcService.createOffer(code);
      });

      socket.on("session-ended", () => {
        console.log("Session ended by other side");
        toast.info("Session ended by other participant", {
          autoClose: 3000,
          toastId: "session-ended-by-other",
        });
        webrtcService?.cleanup();
        navigate("/");
      });

      socket.on("peer-disconnected", () => {
        console.log("Peer disconnected");
        toast.warning("Other participant disconnected", {
          autoClose: 3000,
          toastId: "peer-disconnected",
        });
        webrtcService?.cleanup();
        navigate("/");
      });

      socket.emit("create-session", { sessionCode: code });
    } catch (error) {
      console.error("Failed to create session:", error);
      setIsCreatingSession(false);
      toast.error("Failed to connect to server");
    }
  };

  const handleAcceptConnection = () => {
    if (webrtcService.socket) {
      webrtcService.socket.emit("accept-connection", {
        sessionCode,
        receiverId: requestingPeer,
      });
    }
  };

  const handleRejectConnection = () => {
    if (webrtcService.socket) {
      webrtcService.socket.emit("reject-connection", {
        sessionCode,
        receiverId: requestingPeer,
      });
    }
    setShowConnectionRequest(false);
    setRequestingPeer(null);
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const copyToClipboard = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(sessionCode);
        toast.success("Session code copied to clipboard!");
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = sessionCode;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          const successful = document.execCommand("copy");
          if (successful) {
            toast.success("Session code copied to clipboard!");
          } else {
            throw new Error("Copy command failed");
          }
        } catch (fallbackError) {
          if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
            alert(`Copy this session code: ${sessionCode}`);
            toast.info("Please copy the session code manually");
          } else {
            throw fallbackError;
          }
        } finally {
          document.body.removeChild(textArea);
        }
      }
    } catch (error) {
      console.error("Failed to copy:", error);
      alert(`Copy this session code: ${sessionCode}`);
      toast.info("Please copy the session code manually");
    }
  };

  return (
    <div className="min-h-screen p-4 relative">
      <AnimatedBackdrop />
      <div className="max-w-2xl mx-auto relative z-10">
        {}
        <div className="relative flex items-center mb-8 mt-5">
          <button
            onClick={() => {
              webrtcService?.cleanup();
              navigate("/");
            }}
            className="flex items-center text-blue-600 hover:text-blue-700 font-medium transition-colors z-10"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              className="mr-2"
            >
              <path
                d="M12.5 15L7.5 10L12.5 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            Back
          </button>
          <h1 className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[24px] sm:text-3xl font-bold text-gray-900 whitespace-nowrap">
            Send Files
          </h1>
          <div className="w-16" />
        </div>
        {}
        {!sessionCreated && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-md p-8 mb-8"
          >
            <div className="text-center mb-8">
              <div>
                <Lottie
                  animationData={sendFileAnimation}
                  style={{ width: 180, height: 180 }}
                  className="mx-auto"
                />
              </div>
              <h2 className="text-2xl font-bold mb-2 mt-10">
                Select Files to Send
              </h2>
              <p className="text-gray-600 text-[14px] sm:text-[16px]">
                Drag & drop files here, or click to select files to share
              </p>
            </div>

            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                isDragActive
                  ? "border-blue-500 bg-blue-50"
                  : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <input {...getInputProps()} />
              {isDragActive ? (
                <p className="text-lg text-blue-600 font-medium">
                  Drop the files here...
                </p>
              ) : (
                <div>
                  <p className="text-lg text-gray-600 mb-2 font-medium">
                    Click to browse or drag files here
                  </p>
                  <p className="text-sm text-gray-500">
                    Support for multiple files of any type
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
        {selectedFiles.length > 0 && !sessionCreated && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-md p-8 mb-8"
          >
            <h3 className="text-xl font-semibold mb-6 text-center">
              Selected Files ({selectedFiles.length})
            </h3>
            <div className="space-y-3 mb-6">
              {selectedFiles.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-xl"
                >
                  <div className="flex items-center">
                    <div className="text-2xl mr-3">📄</div>
                    <div>
                      <p className="font-medium text-gray-900">{file.name}</p>
                      <p className="text-sm text-gray-500">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const newFiles = selectedFiles.filter(
                        (_, i) => i !== index
                      );
                      setSelectedFiles(newFiles);
                    }}
                    className="text-red-500 hover:text-red-700 p-2 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
              <p className="text-sm text-blue-800 text-center font-medium">
                <strong>Total size:</strong>{" "}
                {formatFileSize(
                  selectedFiles.reduce((total, file) => total + file.size, 0)
                )}
              </p>
            </div>
            <div className="text-center">
              <button
                onClick={handleCreateSession}
                disabled={isCreatingSession}
                className={`font-semibold py-3 px-8 rounded-xl shadow-lg transition-all duration-200  gap-2 min-w-[200px] ${
                  isCreatingSession
                    ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                    : "bg-green-600 hover:bg-green-700 text-white"
                }`}
              >
                {isCreatingSession ? (
                  <div className="flex items-center justify-center gap-2">
                    Creating Session
                    <svg
                      className="animate-spin h-5 w-5"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                  </div>
                ) : (
                  "Generate Session Code"
                )}
              </button>
            </div>
          </motion.div>
        )}
        {sessionCreated && sessionCode && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-md p-8 text-center mb-8"
          >
            <h2 className="text-2xl font-bold mb-6 text-gray-900">
              Session Code Generated
            </h2>
            <p className="text-gray-600 text-[14px] sm:text-[16px] mb-6">
              Share this code with the receiver to start the transfer
            </p>

            <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-6 mb-6">
              <div className="bg-white/20 rounded-lg p-4 mb-4">
                <p className="text-3xl font-mono font-bold tracking-widest text-white">
                  {sessionCode}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={copyToClipboard}
                  className="flex-1 bg-white/20 hover:bg-white/30 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  📋 Copy Code
                </button>
                <button
                  onClick={() => setShowQRCode(true)}
                  className="flex-1 bg-white/20 hover:bg-white/30 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  📱 Show QR
                </button>
              </div>
            </div>

            {selectedFiles.length > 0 && (
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm text-gray-600 mb-2 font-medium">
                  Ready to send {selectedFiles.length} file
                  {selectedFiles.length !== 1 ? "s" : ""}
                </p>
                <p className="text-xs text-gray-500">
                  Total size:{" "}
                  {formatFileSize(
                    selectedFiles.reduce((total, file) => total + file.size, 0)
                  )}
                </p>
              </div>
            )}
          </motion.div>
        )}
        {sessionCreated && !showConnectionRequest && !sessionExpired && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-md p-8 text-center"
          >
            <Lottie
              animationData={hourGlass}
              style={{ width: 100, height: 100 }}
              className="mx-auto"
            />
            <h2 className="text-2xl font-bold mb-4">Waiting for Receiver</h2>
            <p className="text-gray-600 mb-6">
              The receiver needs to enter your session code to connect
            </p>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>Session Code:</strong> {sessionCode}
              </p>
            </div>
          </motion.div>
        )}

        {sessionExpired && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-md p-8 text-center"
          >
            <div className="text-6xl mb-6">⏰</div>
            <h2 className="text-2xl font-bold mb-4 text-red-600">
              Session Expired
            </h2>
            <p className="text-gray-600 mb-6">
              Your session has expired. You will be redirected to the home page
              shortly.
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">
                Sessions expire after 5 minutes of inactivity
              </p>
            </div>
          </motion.div>
        )}
        <AnimatePresence>
          {showConnectionRequest && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center p-4 z-50"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-xl shadow-xl p-8 max-w-md w-full mx-4"
              >
                <div className="text-center">
                  <div className="text-6xl mb-6">🔔</div>
                  <h2 className="text-2xl font-bold mb-4">
                    Incoming Connection
                  </h2>
                  <p className="text-gray-600 mb-6">
                    Someone wants to receive your files. Do you want to accept
                    this connection?
                  </p>
                  <div className="flex gap-4">
                    <button
                      onClick={handleRejectConnection}
                      className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-6 rounded-xl shadow-lg transition-colors"
                    >
                      Reject
                    </button>
                    <button
                      onClick={handleAcceptConnection}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg transition-colors"
                    >
                      Accept
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <QRCodeDisplay
          sessionCode={sessionCode}
          isOpen={showQRCode}
          onClose={() => setShowQRCode(false)}
        />
      </div>
    </div>
  );
};
export default SendPage;
