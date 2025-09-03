import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import QrScanner from "qr-scanner";
import { toast } from "react-toastify";

const QRCodeScanner = ({ isOpen, onClose, onScan }) => {
  const videoRef = useRef(null);
  const scannerRef = useRef(null);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      startScanner();
    }
    return () => stopScanner();
  }, [isOpen]);

  const startScanner = async () => {
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
          } else {
            toast.warning("Invalid QR code format");
          }
        },
        {
          highlightScanRegion: true,
          highlightCodeOutline: true,
          preferredCamera: "environment",
        }
      );

      await scannerRef.current.start();
    } catch (error) {
      console.error("Camera error:", error);
      setIsScanning(false);

      if (error.name === "NotAllowedError") {
        setError(
          "Camera permission denied. Please allow access and try again."
        );
      } else if (error.name === "NotFoundError") {
        setError("No camera found on this device.");
      } else {
        setError("Camera not available. Please enter code manually.");
      }
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
              Point your camera at the QR code to connect instantly
            </p>

            {error ? (
              <div className="bg-red-50 rounded-xl p-6 mb-6">
                <div className="text-4xl mb-4">�</div>
                <p className="text-red-600 text-sm font-medium mb-2">{error}</p>
                <button
                  onClick={startScanner}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-lg transition-colors text-sm"
                >
                  Try Again
                </button>
              </div>
            ) : (
              <div className="relative mb-6">
                <video
                  ref={videoRef}
                  className="w-full h-64 bg-gray-900 rounded-xl object-cover"
                  playsInline
                  muted
                />
                {isScanning && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-40 h-40 border-2 border-blue-600 rounded-lg animate-pulse"></div>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold py-3 px-6 rounded-xl transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default QRCodeScanner;
