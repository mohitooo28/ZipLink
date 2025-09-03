import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "react-toastify";
import Lottie from "lottie-react";
import useAppStore from "../store/useAppStore";
import WebRTCService from "../services/webrtcService";
import { AnimatedBackdrop } from "../components";
import receiverAnimation from "../assets/lottie/receiver.json";

const ReceivePage = () => {
  const navigate = useNavigate();
  const [inputCode, setInputCode] = useState("");
  const [showErrorDialog, setShowErrorDialog] = useState(false);

  const {
    sessionCode,
    connectionStatus,
    waitingForApproval,
    webrtcService,
    setSessionCode,
    setRole,
    setSocket,
    setConnectionStatus,
    setWaitingForApproval,
    setWebrtcService,
    cleanup,
  } = useAppStore();

  useEffect(() => {
    if (!webrtcService) {
      const service = new WebRTCService();
      setWebrtcService(service);
    }
  }, [webrtcService, setWebrtcService]);

  useEffect(() => {
    setRole("receiver");
    setShowErrorDialog(false);
    return () => {};
  }, []);

  useEffect(() => {
    if (connectionStatus === "failed") {
      setShowErrorDialog(true);
    } else {
      setShowErrorDialog(false);
    }
  }, [connectionStatus]);

  const handleJoinSession = async () => {
    if (!inputCode.trim()) {
      toast.error("Please enter a session code");
      return;
    }
    if (!webrtcService) {
      toast.error("WebRTC service not ready. Please refresh the page.");
      return;
    }
    const code = inputCode.trim().toUpperCase();
    setSessionCode(code);
    try {
      const socket = await webrtcService.connectToSignalingServer();
      setSocket(socket);
      webrtcService.sessionCode = code;
      socket.on("waiting-for-approval", () => {
        setWaitingForApproval(true);
        toast.info("Waiting for sender approval...");
      });
      socket.on("connection-accepted", () => {
        setWaitingForApproval(false);
        setConnectionStatus("connecting");
        webrtcService.onConnectionStatusChange = (status) => {
          setConnectionStatus(status);
          if (status === "connected") {
            toast.success("Connected! Ready to receive files.");
            navigate("/transfer");
          }
        };
        toast.info("WebRTC connection starting...");
      });
      socket.on("connection-rejected", () => {
        setWaitingForApproval(false);
        toast.error("Connection rejected by sender");
        setConnectionStatus("failed");
      });
      socket.on("session-error", ({ message }) => {
        toast.error(message);
        setConnectionStatus("failed");
        setWaitingForApproval(false);
      });
      socket.emit("join-session", { sessionCode: code });
    } catch (error) {
      console.error("Failed to join session:", error);
      toast.error("Failed to connect to server");
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (value.length <= 8) {
      setInputCode(value);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === "Enter") {
      handleJoinSession();
    }
  };

  const handleClipboardPaste = async () => {
    try {
      let clipboardText = "";
      if (navigator.clipboard && window.isSecureContext) {
        clipboardText = await navigator.clipboard.readText();
      } else {
        clipboardText = prompt("Please paste the session code here:") || "";
      }
      if (clipboardText) {
        const cleanText = clipboardText.toUpperCase().replace(/[^A-Z0-9]/g, "");
        const truncatedText = cleanText.substring(0, 8);
        setInputCode(truncatedText);
        if (truncatedText) {
          toast.success("Session code pasted successfully!");
        }
      }
    } catch (error) {
      console.error("Clipboard error:", error);
      const manualInput =
        prompt("Please enter the session code manually:") || "";
      if (manualInput) {
        const cleanText = manualInput.toUpperCase().replace(/[^A-Z0-9]/g, "");
        const truncatedText = cleanText.substring(0, 8);
        setInputCode(truncatedText);
        if (truncatedText) {
          toast.success("Session code entered successfully!");
        }
      }
    }
  };

  const handleClearInput = () => {
    setInputCode("");
  };

  const handleCloseErrorDialog = () => {
    setShowErrorDialog(false);
    setConnectionStatus("disconnected");
    setSessionCode(null);
    setInputCode("");
    cleanup();
    webrtcService.cleanup();
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
            Receive Files
          </h1>
          <div className="w-16" />
        </div>
        {!waitingForApproval && connectionStatus !== "connecting" && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-xl shadow-md p-8"
          >
            {}
            <div className="text-center mb-8">
              <div>
                <Lottie
                  animationData={receiverAnimation}
                  style={{ width: 180, height: 180 }}
                  className="mx-auto"
                />
              </div>
              <h2 className="text-2xl font-bold mb-2 mt-10">
                Enter Session Code
              </h2>
              <p className="text-gray-600 text-[14px] sm:text-[16px]">
                Enter the 8-character code provided by the sender to receive
                files
              </p>
            </div>
            {}
            <div className="mb-8">
              <label
                htmlFor="sessionCode"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                <p className="text-[15px] font-semibold">Session Code</p>
              </label>
              <div className="relative">
                <input
                  id="sessionCode"
                  type="text"
                  value={inputCode}
                  onChange={handleInputChange}
                  onKeyPress={handleKeyPress}
                  placeholder="Enter 8-character code"
                  className="w-full text-center text-l sm:text-2xl font-mono font-bold tracking-widest py-4 px-6 pr-14 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                  maxLength={8}
                />
                <button
                  type="button"
                  onClick={
                    inputCode.length > 0
                      ? handleClearInput
                      : handleClipboardPaste
                  }
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 p-2 text-gray-500 hover:text-gray-700 transition-colors"
                  title={
                    inputCode.length > 0
                      ? "Clear input"
                      : "Paste from clipboard"
                  }
                >
                  {inputCode.length > 0 ? (
                    <svg
                      className="w-6 h-6"
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
                  ) : (
                    <svg
                      className="w-5 h-5"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M12 0C11.2347 0 10.6293 0.125708 10.1567 0.359214C9.9845 0.44429 9.82065 0.544674 9.68861 0.62717L9.59036 0.688808C9.49144 0.751003 9.4082 0.803334 9.32081 0.853848C9.09464 0.984584 9.00895 0.998492 9.00053 0.999859C8.99983 0.999973 9.00019 0.999859 9.00053 0.999859C7.89596 0.999859 7 1.89543 7 3H6C4.34315 3 3 4.34315 3 6V20C3 21.6569 4.34315 23 6 23H18C19.6569 23 21 21.6569 21 20V6C21 4.34315 19.6569 3 18 3H17C17 1.89543 16.1046 1 15 1C15.0003 1 15.0007 1.00011 15 1C14.9916 0.998633 14.9054 0.984584 14.6792 0.853848C14.5918 0.80333 14.5086 0.751004 14.4096 0.688804L14.3114 0.62717C14.1793 0.544674 14.0155 0.44429 13.8433 0.359214C13.3707 0.125708 12.7653 0 12 0ZM16.7324 5C16.3866 5.5978 15.7403 6 15 6H9C8.25972 6 7.61337 5.5978 7.26756 5H6C5.44772 5 5 5.44772 5 6V20C5 20.5523 5.44772 21 6 21H18C18.5523 21 19 20.5523 19 20V6C19 5.44772 18.5523 5 18 5H16.7324ZM11.0426 2.15229C11.1626 2.09301 11.4425 2 12 2C12.5575 2 12.8374 2.09301 12.9574 2.15229C13.0328 2.18953 13.1236 2.24334 13.2516 2.32333L13.3261 2.37008C13.43 2.43542 13.5553 2.51428 13.6783 2.58539C13.9712 2.75469 14.4433 3 15 3V4H9V3C9.55666 3 10.0288 2.75469 10.3217 2.58539C10.4447 2.51428 10.57 2.43543 10.6739 2.37008L10.7484 2.32333C10.8764 2.24334 10.9672 2.18953 11.0426 2.15229Z"
                        fill="currentColor"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            {}
            <div className="text-center">
              <button
                onClick={handleJoinSession}
                disabled={inputCode.length !== 8}
                className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3 px-8 rounded-xl shadow-lg transition-colors"
              >
                Connect to Sender
              </button>
            </div>
          </motion.div>
        )}
        {}
        {waitingForApproval && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-md p-8 text-center"
          >
            <div className="animate-bounce text-6xl mb-6">⏳</div>
            <h2 className="text-2xl font-bold mb-4">Waiting for Approval</h2>
            <p className="text-gray-600 mb-6">
              Your connection request has been sent to the sender. Please wait
              for them to accept.
            </p>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                <strong>Session Code:</strong> {sessionCode}
              </p>
            </div>
            <button
              onClick={() => {
                setWaitingForApproval(false);
                setSessionCode(null);
                setInputCode("");
                cleanup();
                webrtcService.cleanup();
              }}
              className="mt-6 text-gray-500 hover:text-gray-700 font-medium"
            >
              Cancel and try again
            </button>
          </motion.div>
        )}
      </div>
      {showErrorDialog && (
        <div className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-white rounded-xl shadow-xl p-8 text-center max-w-md w-full mx-4"
          >
            <div className="text-6xl mb-6">❌</div>
            <h2 className="text-2xl font-bold mb-4 text-red-600">
              Connection Failed
            </h2>
            <p className="text-gray-600 mb-6">
              Unable to connect to the sender. Please check the session code and
              try again.
            </p>
            <button
              onClick={handleCloseErrorDialog}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-xl shadow-lg transition-colors"
            >
              Try Again
            </button>
          </motion.div>
        </div>
      )}
    </div>
  );
};
export default ReceivePage;
