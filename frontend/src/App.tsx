import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./authContext";
import LoginPage from "./pages/LoginPage";
import VerifyOtpPage from "./pages/VerifyOtpPage";
import RegisterProfilePage from "./pages/RegisterProfilePage";
import ChatPage from "./pages/ChatPage";
import "./index.css";

function LoadingScreen() {
  return (
    <div className="app-loading">
      <div className="loader" />
      <span>OpenMessaging yükleniyor…</span>
    </div>
  );
}

function AppRoutes() {
  const { user, loading, otpEmail } = useAuth();

  if (loading) return <LoadingScreen />;

  return (
    <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/chat" replace /> : <LoginPage />}
      />

      {/* Adım 2: OTP doğrulama — sadece e-posta gönderilmişse erişilebilir */}
      <Route
        path="/verify-otp"
        element={
          user ? (
            <Navigate to="/chat" replace />
          ) : otpEmail ? (
            <VerifyOtpPage />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      {/* Adım 3: profil (kullanıcı adı + şifre) — OTP doğrulandıktan sonra */}
      <Route
        path="/register"
        element={
          user ? (
            <Navigate to="/chat" replace />
          ) : otpEmail ? (
            <RegisterProfilePage />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />

      <Route path="/chat" element={user ? <ChatPage /> : <Navigate to="/login" replace />} />

      <Route path="*" element={<Navigate to={user ? "/chat" : "/login"} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" theme="dark" richColors />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
