import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "react-toastify";
import { saveAs } from "file-saver";
import Lottie from "lottie-react";
import useAppStore from "../store/useAppStore";
import { AnimatedBackdrop } from "../components";
import hourglassAnimation from "../assets/lottie/hourglass.json";

const TransferPage = () => {
  const navigate = useNavigate();
  const {
    sessionCode,
    role,
    selectedFiles,
    connectionStatus,
    transferProgress,
    fileNames,
    transferComplete,
    webrtcService,
    receivedFiles,
    updateTransferProgress,
    setConnectionStatus,
    setTransferComplete,
    setReceivedFiles,
    cleanup,
    endSession,
  } = useAppStore();
  const [transferStarted, setTransferStarted] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [autoEndTriggered, setAutoEndTriggered] = useState(false);
  console.log(
    "TransferPage render - receivedFiles:",
    receivedFiles,
    typeof receivedFiles,
    Array.isArray(receivedFiles)
  );
  useEffect(() => {
    if (transferComplete && !sessionEnded && !autoEndTriggered) {
      if (role === "sender") {
        setAutoEndTriggered(true);
        setTimeout(() => {
          console.log(
            "Auto-ending session for sender after receiver has ended"
          );
          handleEndSession();
        }, 8000);
      }
    }
  }, [transferComplete, sessionEnded, role, autoEndTriggered]);
  useEffect(() => {
    if (
      role === "receiver" &&
      !sessionEnded &&
      !autoEndTriggered &&
      receivedFiles &&
      receivedFiles.length > 0 &&
      connectionStatus === "connected"
    ) {
      setAutoEndTriggered(true);
      setTimeout(() => {
        console.log("Auto-ending session for receiver after downloads");
        handleEndSession();
      }, 7000);
    }
  }, [receivedFiles, sessionEnded, role, connectionStatus, autoEndTriggered]);
  const handleEndSession = () => {
    if (sessionEnded) return;
    setSessionEnded(true);

    if (webrtcService?.socket) {
      webrtcService.socket.emit("end-session", { sessionCode });
    }

    toast.info("Ending session...", {
      autoClose: 2000,
      toastId: "ending-session",
    });
    setTimeout(() => {
      endSession();
      navigate("/");
      toast.success("Session ended", {
        autoClose: 2000,
        toastId: "session-ended",
      });
    }, 1000);
  };
  useEffect(() => {
    if (!sessionCode || !role || !webrtcService) {
      navigate("/");
      return;
    }
    webrtcService.onConnectionStatusChange = (status) => {
      setConnectionStatus(status);
    };
    webrtcService.onTransferProgress = (fileId, progress, fileName) => {
      updateTransferProgress(fileId, progress, fileName);
    };
    webrtcService.onFileReceived = (blob, name, size) => {
      console.log("onFileReceived callback triggered for:", name);
      setReceivedFiles((currentFiles) => {
        console.log(
          "Current received files:",
          currentFiles,
          typeof currentFiles,
          Array.isArray(currentFiles)
        );
        const files = Array.isArray(currentFiles) ? currentFiles : [];
        const newFiles = [...files, { name, blob, size }];
        console.log("Updated received files:", newFiles);
        return newFiles;
      });
      setTimeout(() => {
        try {
          console.log("Attempting auto-download for:", name);
          saveAs(blob, name);
          toast.success(`Downloaded: ${name}`, {
            autoClose: 3000,
            toastId: `download-${name}`,
          });
          console.log("Auto-download successful for:", name);
        } catch (error) {
          console.error("Auto-download error:", error);
          toast.error(`Download failed: ${name}`, {
            autoClose: 4000,
            toastId: `download-failed-${name}`,
          });
        }
      }, 100);
    };
    webrtcService.onDataChannelReady = () => {
      if (role === "sender" && !transferStarted && selectedFiles.length > 0) {
        console.log(
          "Data channel ready, auto-starting transfer in 1 second..."
        );
        setTimeout(() => startFileTransfer(), 1000);
      }
    };

    if (webrtcService.socket) {
      webrtcService.socket.on("session-ended", () => {
        console.log("Session ended by other side");
        toast.info("Session ended by other participant", {
          autoClose: 3000,
          toastId: "session-ended-by-other",
        });
        handleEndSession();
      });

      webrtcService.socket.on("peer-disconnected", () => {
        console.log("Peer disconnected");
        toast.warning("Other participant disconnected", {
          autoClose: 3000,
          toastId: "peer-disconnected",
        });
        handleEndSession();
      });
    }

    return () => {
      webrtcService.onConnectionStatusChange = null;
      webrtcService.onTransferProgress = null;
      webrtcService.onFileReceived = null;
      webrtcService.onDataChannelReady = null;

      if (webrtcService.socket) {
        webrtcService.socket.off("session-ended");
        webrtcService.socket.off("peer-disconnected");
      }
    };
  }, [
    sessionCode,
    role,
    webrtcService,
    transferStarted,
    selectedFiles,
    setConnectionStatus,
    updateTransferProgress,
    setReceivedFiles,
  ]);

  useEffect(() => {
    if (connectionStatus === "disconnected" || connectionStatus === "failed") {
      if (!sessionEnded) {
        console.log(`Connection ${connectionStatus}, ending session...`);
        toast.warning(`Connection ${connectionStatus}. Ending session...`, {
          autoClose: 3000,
          toastId: "connection-lost",
        });
        setTimeout(() => {
          handleEndSession();
        }, 1000);
      }
    }
  }, [connectionStatus, sessionEnded]);

  useEffect(() => {
    if (
      role === "sender" &&
      connectionStatus === "connected" &&
      !transferStarted &&
      selectedFiles.length > 0 &&
      webrtcService?.dataChannel
    ) {
      console.log("Connection ready, auto-starting transfer in 1 second...");
      setTimeout(() => {
        startFileTransfer();
      }, 1000);
    }
  }, [connectionStatus, role, transferStarted, selectedFiles, webrtcService]);
  const startFileTransfer = async () => {
    if (
      role !== "sender" ||
      !webrtcService.dataChannel ||
      !selectedFiles.length
    )
      return;
    setTransferStarted(true);
    toast.info("Starting transfer...", {
      autoClose: 2000,
      toastId: "starting-transfer",
    });
    try {
      await webrtcService.sendFiles(selectedFiles);
      setTransferComplete(true);
      toast.success("Transfer complete!", {
        autoClose: 3000,
        toastId: "transfer-complete",
      });
    } catch (error) {
      console.error("Transfer error:", error);
      toast.error("Transfer failed", {
        autoClose: 4000,
        toastId: "transfer-failed",
      });
    }
  };
  const downloadFile = (file) => {
    try {
      saveAs(file.blob, file.name);
      toast.success(`Downloaded ${file.name}`, { autoClose: 2000 });
    } catch (error) {
      console.error("Download error:", error);
      toast.error("Download failed", { autoClose: 3000 });
    }
  };
  const downloadAllFiles = () => {
    try {
      const files = receivedFiles || [];
      files.forEach((file) => {
        saveAs(file.blob, file.name);
      });
      toast.success(`Downloaded ${files.length} files`, {
        autoClose: 3000,
      });
    } catch (error) {
      console.error("Download all error:", error);
      toast.error("Download failed", { autoClose: 3000 });
    }
  };
  const formatFileSize = (bytes) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };
  const getConnectionStatusDisplay = () => {
    switch (connectionStatus) {
      case "connecting":
        return {
          text: "Connecting...",
          color: "text-yellow-600",
          icon: "🔄",
        };
      case "connected":
        return {
          text: "Connected",
          color: "text-green-600",
          icon: "✅",
        };
      case "failed":
        return {
          text: "Connection Failed",
          color: "text-red-600",
          icon: "❌",
        };
      case "disconnected":
        return {
          text: "Disconnected",
          color: "text-gray-600",
          icon: "⚫",
        };
      default:
        return { text: "Unknown", color: "text-gray-600", icon: "❓" };
    }
  };
  const getTotalProgress = () => {
    if (role === "sender" && selectedFiles.length > 0) {
      const totalProgress = selectedFiles.reduce((acc, file, index) => {
        const fileId = `file_${index}`;
        return acc + (transferProgress[fileId] || 0);
      }, 0);
      return Math.round(totalProgress / selectedFiles.length);
    }
    return 0;
  };
  const status = getConnectionStatusDisplay();
  return (
    <div className="min-h-screen p-4 relative">
      <AnimatedBackdrop />
      <div className="max-w-4xl mx-auto relative z-10 mt-5">
        <div className="relative flex items-center justify-between mb-8">
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900 whitespace-nowrap">
            {role === "sender" ? "Sending Files" : "Receiving Files"}
          </h1>
          <button
            onClick={handleEndSession}
            disabled={sessionEnded}
            className="bg-red-600 hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-medium py-2 px-4 rounded-lg transition-colors z-10"
          >
            {sessionEnded ? "Ending..." : "End Session"}
          </button>
        </div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-md p-6 mb-8"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span className="text-2xl mr-3">{status.icon}</span>
              <div>
                <h3 className="font-semibold">Connection Status</h3>
                <p className={`${status.color} font-medium`}>{status.text}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Session Code</p>
              <p className="font-mono font-bold text-lg">{sessionCode}</p>
            </div>
          </div>
          {role === "sender" && transferStarted && (
            <div className="mt-4">
              <div className="flex justify-between text-sm text-gray-600 mb-1">
                <span>Overall Progress</span>
                <span>{getTotalProgress()}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="h-2 bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${getTotalProgress()}%` }}
                ></div>
              </div>
            </div>
          )}
        </motion.div>
        {role === "sender" && selectedFiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-md p-6 mb-8"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">File Transfer Progress</h3>
            </div>
            <div className="space-y-4">
              {selectedFiles.map((file, index) => {
                const fileId = `file_${index}`;
                const progress = transferProgress[fileId] || 0;
                const isCompleted = progress === 100;
                return (
                  <div
                    key={index}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      isCompleted
                        ? "bg-green-50 border-green-200"
                        : progress > 0
                        ? "bg-blue-50 border-blue-200"
                        : "bg-gray-50 border-gray-200"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center">
                        <span className="text-xl mr-3">📄</span>
                        <div>
                          <p className="font-medium">{file.name}</p>
                          <p className="text-sm text-gray-500">
                            {formatFileSize(file.size)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex items-center">
                        <p
                          className={`font-bold mr-2 ${
                            isCompleted
                              ? "text-green-600"
                              : progress > 0
                              ? "text-blue-600"
                              : "text-gray-500"
                          }`}
                        >
                          {progress}%
                        </p>
                        {isCompleted && (
                          <span className="text-green-600 text-xl">✅</span>
                        )}
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${
                          isCompleted
                            ? "bg-green-500"
                            : progress > 0
                            ? "bg-blue-500"
                            : "bg-gray-300"
                        }`}
                        style={{
                          width: `${progress}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>
            {transferComplete && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg text-center"
              >
                <div className="text-4xl mb-2">🎉</div>
                <p className="text-green-800 font-semibold">
                  All files transferred successfully!
                </p>
                <p className="text-green-600 text-sm mt-1 mb-4">
                  The receiver will download and end session first
                </p>
                {!sessionEnded && (
                  <button
                    onClick={handleEndSession}
                    className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-6 rounded-lg"
                  >
                    End Session Now
                  </button>
                )}
                {sessionEnded && (
                  <p className="text-gray-600 text-sm">
                    Session ending automatically...
                  </p>
                )}
              </motion.div>
            )}
          </motion.div>
        )}
        {role === "receiver" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-md p-6"
          >
            {receivedFiles &&
              Array.isArray(receivedFiles) &&
              receivedFiles.length > 1 && (
                <div className="flex justify-end mb-4">
                  <button
                    onClick={downloadAllFiles}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg text-sm"
                  >
                    📥 Download All
                  </button>
                </div>
              )}
            {Object.keys(transferProgress).length > 0 && (
              <div className="mb-6">
                <h4 className="text-md font-semibold mb-3">
                  Receiving Files...
                </h4>
                <div className="space-y-3">
                  {Object.entries(transferProgress).map(
                    ([fileId, progress]) => (
                      <div
                        key={fileId}
                        className="p-3 bg-blue-50 border border-blue-200 rounded-lg"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm font-medium">
                            {fileNames[fileId] || "file..."}
                          </span>
                          <span className="text-sm text-blue-600 font-bold">
                            {Math.round(progress)}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="h-2 bg-blue-500 rounded-full transition-all duration-300"
                            style={{
                              width: `${progress}%`,
                            }}
                          ></div>
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
            {connectionStatus === "connected" &&
              (!receivedFiles ||
                !Array.isArray(receivedFiles) ||
                receivedFiles.length === 0) &&
              Object.keys(transferProgress).length === 0 && (
                <div className="text-center pb-8">
                  <div className="">
                    <Lottie
                      animationData={hourglassAnimation}
                      style={{ width: 140, height: 140 }}
                      className="mx-auto"
                    />
                  </div>
                  <h4 className="text-xl font-semibold mb-2">
                    Ready to receive files
                  </h4>
                  <p className="text-gray-600">
                    Waiting for the sender to start the transfer...
                  </p>
                </div>
              )}
            <div className="space-y-3">
              {receivedFiles &&
                Array.isArray(receivedFiles) &&
                receivedFiles.map((file, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg"
                  >
                    <div className="flex items-center">
                      <span className="text-2xl mr-3">📄</span>
                      <div>
                        <p className="font-medium text-green-900">
                          {file.name}
                        </p>
                        <p className="text-sm text-green-700">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => downloadFile(file)}
                      className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center"
                    >
                      📥 Download
                    </button>
                  </motion.div>
                ))}
            </div>
            {receivedFiles &&
              Array.isArray(receivedFiles) &&
              receivedFiles.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg text-center"
                >
                  <div className="text-4xl mb-2">✅</div>
                  <p className="text-green-800 font-semibold">
                    Files received successfully!
                  </p>
                  <p className="text-green-600 text-sm mt-1 mb-4">
                    {receivedFiles.length} file
                    {receivedFiles.length > 1 ? "s" : ""} downloaded - session
                    will end automatically
                  </p>
                  {!sessionEnded && (
                    <button
                      onClick={handleEndSession}
                      className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-6 rounded-lg"
                    >
                      End Session Now
                    </button>
                  )}
                  {sessionEnded && (
                    <p className="text-gray-600 text-sm">
                      Session ending automatically...
                    </p>
                  )}
                </motion.div>
              )}
          </motion.div>
        )}
        {connectionStatus === "failed" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 border border-red-200 rounded-xl p-8 mt-8"
          >
            <div className="text-center">
              <div className="text-6xl mb-4">❌</div>
              <h3 className="text-xl font-bold text-red-800 mb-4">
                Connection Failed
              </h3>
              <p className="text-red-700 mb-6">
                The peer-to-peer connection could not be established. This might
                be due to:
              </p>
              <div className="text-left bg-white p-4 rounded-lg mb-6">
                <ul className="text-sm text-red-700 space-y-1">
                  <li>• Network firewall blocking WebRTC connections</li>
                  <li>
                    • NAT traversal issues (both devices behind strict NATs)
                  </li>
                  <li>• Browser compatibility problems</li>
                  <li>• Internet connection interruption</li>
                </ul>
              </div>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => {
                    cleanup();
                    webrtcService.cleanup();
                    navigate("/");
                  }}
                  className="bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-6 rounded-lg"
                >
                  Start Over
                </button>
                <button
                  onClick={() => navigate("/fallback")}
                  className="bg-gray-600 hover:bg-gray-700 text-white font-medium py-3 px-6 rounded-lg"
                >
                  Check Browser Support
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};
export default TransferPage;
