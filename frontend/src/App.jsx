import React from "react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import HomePage from "./pages/HomePage";
import SendPage from "./pages/SendPage";
import ReceivePage from "./pages/ReceivePage";
import TransferPage from "./pages/TransferPage";
import FallbackPage from "./pages/FallbackPage";
function App() {
    return (
        <Router>
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
                <Routes>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/send" element={<SendPage />} />
                    <Route path="/receive" element={<ReceivePage />} />
                    <Route path="/transfer" element={<TransferPage />} />
                    <Route path="/fallback" element={<FallbackPage />} />
                </Routes>
                <ToastContainer
                    position="bottom-right"
                    autoClose={3000}
                    hideProgressBar={false}
                    newestOnTop={false}
                    closeOnClick
                    rtl={false}
                    pauseOnFocusLoss
                    draggable
                    pauseOnHover
                    theme="light"
                    className="toast-container"
                />
            </div>
        </Router>
    );
}
export default App;
