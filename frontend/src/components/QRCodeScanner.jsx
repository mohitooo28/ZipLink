import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import QrScanner from "qr-scanner";
import { toast } from "react-toastify";

const QRCodeScanner = ({ isOpen, onClose, onScan }) => {
  const videoRef = useRef(null);
  const scannerRef = useRef(null);
  const [hasCamera, setHasCamera] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState("requesting");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      checkCameraPermission();
    }

    return () => {
      stopScanner();
    };
  }, [isOpen]);

  const checkCameraPermission = async () => {
    try {
      setPermissionStatus("requesting");
      setError(null);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setHasCamera(false);
        setPermissionStatus("no-camera");
        setError("Camera API not supported in this browser");
        return;
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(
          (device) => device.kind === "videoinput"
        );

        if (videoDevices.length === 0) {
          setHasCamera(false);
          setPermissionStatus("no-camera");
          setError("No camera devices found");
          return;
        }
      } catch (enumError) {
        console.warn("Could not enumerate devices:", enumError);
      }

      const constraints = [
        { video: { facingMode: { exact: "environment" } } },
        { video: { facingMode: "environment" } },
        { video: { facingMode: "user" } },
        { video: true },
      ];

      let stream = null;
      let constraintIndex = 0;

      for (const constraint of constraints) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraint);
          console.log(
            `Camera accessed with constraint ${constraintIndex}:`,
            constraint
          );
          break;
        } catch (error) {
          console.log(`Constraint ${constraintIndex} failed:`, error.name);
          constraintIndex++;
          if (constraintIndex === constraints.length) {
            throw error;
          }
        }
      }

      if (stream) {
        stream.getTracks().forEach((track) => {
          console.log("Stopping track:", track.label);
          track.stop();
        });

        setHasCamera(true);
        setPermissionStatus("granted");

        setTimeout(() => {
          startScanner();
        }, 500);
      } else {
        throw new Error("No camera stream obtained");
      }
    } catch (permissionError) {
      console.error("Camera permission error:", permissionError);
      setHasCamera(false);

      if (permissionError.name === "NotAllowedError") {
        setPermissionStatus("denied");
        setError(
          "Camera access denied. Please allow camera permission and try again."
        );
      } else if (
        permissionError.name === "NotFoundError" ||
        permissionError.name === "DevicesNotFoundError"
      ) {
        setPermissionStatus("no-camera");
        setError("No camera found on this device");
      } else if (
        permissionError.name === "NotReadableError" ||
        permissionError.name === "TrackStartError"
      ) {
        setPermissionStatus("error");
        setError("Camera is being used by another application");
      } else if (
        permissionError.name === "OverconstrainedError" ||
        permissionError.name === "ConstraintNotSatisfiedError"
      ) {
        setPermissionStatus("error");
        setError("Camera does not meet requirements");
      } else if (permissionError.name === "NotSupportedError") {
        setPermissionStatus("no-camera");
        setError("Camera not supported on this device");
      } else {
        setPermissionStatus("error");
        setError(`Camera error: ${permissionError.message || "Unknown error"}`);
      }
    }
  };

  const startScanner = async () => {
    if (!videoRef.current || hasCamera === false) {
      return;
    }

    try {
      setIsScanning(true);
      setError(null);

      scannerRef.current = new QrScanner(
        videoRef.current,
        (result) => {
          const code = result.data.trim().toUpperCase();
          if (code.length === 8 && /^[A-Z0-9]+$/.test(code)) {
            onScan(code);
            stopScanner();
            onClose();
            toast.success("QR code scanned successfully!");
          } else {
            toast.warning("Invalid session code format");
          }
        },
        {
          highlightScanRegion: true,
          highlightCodeOutline: true,
          preferredCamera: "environment",
          maxScansPerSecond: 5,
          calculateScanRegion: (video) => {
            const smallerDimension = Math.min(
              video.videoWidth,
              video.videoHeight
            );
            const scanSize = Math.floor(smallerDimension * 0.7);

            return {
              x: Math.floor((video.videoWidth - scanSize) / 2),
              y: Math.floor((video.videoHeight - scanSize) / 2),
              width: scanSize,
              height: scanSize,
            };
          },
        }
      );

      await scannerRef.current.start();
      console.log("QR Scanner started successfully");
    } catch (error) {
      console.error("Scanner start error:", error);
      setIsScanning(false);

      if (error.name === "NotAllowedError") {
        setError("Camera access denied. Please allow camera permission.");
        setPermissionStatus("denied");
      } else if (error.name === "NotFoundError") {
        setError("Camera not found. Please check your device camera.");
        setPermissionStatus("no-camera");
      } else if (error.name === "NotReadableError") {
        setError("Camera is being used by another application.");
        setPermissionStatus("error");
      } else {
        setError(`Scanner error: ${error.message || "Failed to start camera"}`);
        setPermissionStatus("error");
      }

      toast.error("Failed to start camera scanner");
    }
  };
  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.stop();
      scannerRef.current.destroy();
      scannerRef.current = null;
    }
    setIsScanning(false);
  };

  const handleClose = () => {
    stopScanner();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center z-50 p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-4 text-gray-900">
              Scan QR Code
            </h2>
            <p className="text-gray-600 text-sm mb-6">
              Point your camera at the QR code to connect
            </p>

            {permissionStatus === "requesting" && (
              <div className="bg-blue-50 rounded-xl p-8 mb-6">
                <div className="text-4xl mb-4">🔄</div>
                <p className="text-blue-600 text-sm font-medium">
                  Requesting camera permission...
                </p>
              </div>
            )}

            {permissionStatus === "denied" && (
              <div className="bg-red-50 rounded-xl p-8 mb-6">
                <div className="text-4xl mb-4">🚫</div>
                <p className="text-red-600 text-sm font-medium mb-2">
                  Camera access denied
                </p>
                <p className="text-red-500 text-xs">
                  Please allow camera permission in your browser settings and
                  try again
                </p>
              </div>
            )}

            {hasCamera === true && permissionStatus === "granted" && (
              <div className="relative mb-6">
                <video
                  ref={videoRef}
                  className="w-full h-64 bg-gray-900 rounded-xl object-cover"
                  playsInline
                  muted
                />
                {isScanning && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-48 h-48 border-2 border-green-400 rounded-lg animate-pulse"></div>
                  </div>
                )}
                {!isScanning && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-xl">
                    <button
                      onClick={startScanner}
                      className="bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
                    >
                      Start Scanning
                    </button>
                  </div>
                )}
              </div>
            )}

            {(hasCamera === false ||
              permissionStatus === "no-camera" ||
              permissionStatus === "error") && (
              <div className="bg-gray-100 rounded-xl p-8 mb-6">
                <div className="text-4xl mb-4">📷</div>
                <p className="text-gray-600 text-sm font-medium mb-2">
                  {error || "Camera not available"}
                </p>
                <p className="text-gray-500 text-xs mb-4">
                  Please enter the session code manually
                </p>
                <button
                  onClick={async () => {
                    try {
                      const devices =
                        await navigator.mediaDevices.enumerateDevices();
                      const videoDevices = devices.filter(
                        (d) => d.kind === "videoinput"
                      );
                      console.log("Available video devices:", videoDevices);
                      toast.info(
                        `Found ${videoDevices.length} camera(s). Check console for details.`
                      );
                    } catch (e) {
                      console.error("Device enumeration failed:", e);
                      toast.error("Failed to check available cameras");
                    }
                  }}
                  className="text-xs bg-blue-100 hover:bg-blue-200 text-blue-600 px-3 py-1 rounded transition-colors"
                >
                  Debug: Check Cameras
                </button>
              </div>
            )}

            {error && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                <p className="text-yellow-800 text-xs">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-6 rounded-xl transition-colors"
              >
                Cancel
              </button>
              {permissionStatus === "denied" && (
                <button
                  onClick={checkCameraPermission}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
                >
                  Retry Permission
                </button>
              )}
              {(permissionStatus === "no-camera" ||
                permissionStatus === "error") && (
                <button
                  onClick={async () => {
                    try {
                      const hasQrCamera = await QrScanner.hasCamera();
                      console.log("QrScanner.hasCamera():", hasQrCamera);
                      if (hasQrCamera) {
                        setHasCamera(true);
                        setPermissionStatus("granted");
                        toast.success("Camera detected! Try scanning now.");
                      } else {
                        toast.error("No camera detected by QR scanner library");
                      }
                    } catch (e) {
                      console.error("QrScanner.hasCamera() failed:", e);
                      toast.error("Camera detection failed");
                    }
                  }}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
                >
                  Try Fallback
                </button>
              )}
              {hasCamera === true &&
                permissionStatus === "granted" &&
                !isScanning && (
                  <button
                    onClick={startScanner}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors"
                  >
                    Start Scanning
                  </button>
                )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default QRCodeScanner;
