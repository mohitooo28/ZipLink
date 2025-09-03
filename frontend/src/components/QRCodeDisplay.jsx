import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "qrcode";

const QRCodeDisplay = ({ sessionCode, isOpen, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState("");

  useEffect(() => {
    if (sessionCode && isOpen) {
      QRCode.toDataURL(sessionCode, {
        width: 256,
        margin: 2,
        color: {
          dark: "#1f2937",
          light: "#ffffff",
        },
      })
        .then(setQrDataUrl)
        .catch(console.error);
    }
  }, [sessionCode, isOpen]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 backdrop-blur-sm bg-black/30 flex items-center justify-center z-50 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-xl shadow-xl p-8 max-w-sm w-full mx-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center">
            <h2 className="text-2xl font-bold mb-6 text-gray-900">
              QR Code
            </h2>
            <p className="text-gray-600 text-sm mb-6">
              Scan this QR code to connect instantly
            </p>
            
            {qrDataUrl && (
              <div className="bg-white p-4 rounded-xl border-2 border-gray-200 mb-6">
                <img
                  src={qrDataUrl}
                  alt="Session QR Code"
                  className="w-full h-auto"
                />
              </div>
            )}
            
            <div className="bg-gray-50 rounded-xl p-4 mb-6">
              <p className="text-sm text-gray-600 mb-1">Session Code</p>
              <p className="text-lg font-mono font-bold text-gray-900 tracking-widest">
                {sessionCode}
              </p>
            </div>
            
            <button
              onClick={onClose}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg transition-colors"
            >
              Close
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default QRCodeDisplay;
