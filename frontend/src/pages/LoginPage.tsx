import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../authContext";

type Mode = "otp" | "password";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const navigate = useNavigate();
  const { requestOtp, loginWithPassword, error, clearError } = useAuth();

  const [mode, setMode] = useState<Mode>("otp");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setFieldError(null);
    clearError();
  };

  const handleSubmit = async () => {
    clearError();
    setFieldError(null);

    const trimmed = email.trim();
    if (!trimmed) return setFieldError("E-posta adresi gerekli.");
    if (!EMAIL_RE.test(trimmed)) return setFieldError("Geçerli bir e-posta adresi girin.");

    if (mode === "password" && !password) {
      return setFieldError("Şifre gerekli.");
    }

    setBusy(true);
    try {
      if (mode === "password") {
        const ok = await loginWithPassword(trimmed, password);
        if (ok) {
          toast.success("Giriş yapıldı");
          navigate("/chat", { replace: true });
        }
        return;
      }

      const ok = await requestOtp(trimmed);
      if (ok) {
        toast.success("Doğrulama kodu gönderildi");
        navigate("/verify-otp");
      }
    } finally {
      setBusy(false);
    }
  };

  const shownError = fieldError ?? error;

  return (
    <div className="auth-page">
      <div className="auth-logo">
        <div className="auth-logo-icon">O</div>
        <div className="auth-logo-text">OpenMessaging</div>
      </div>

      <div className="auth-card">
        <div className="auth-tabs">
          <button
            type="button"
            className={`auth-tab ${mode === "otp" ? "auth-tab--active" : ""}`}
            onClick={() => switchMode("otp")}
          >
            Kod ile giriş
          </button>
          <button
            type="button"
            className={`auth-tab ${mode === "password" ? "auth-tab--active" : ""}`}
            onClick={() => switchMode("password")}
          >
            Şifre ile giriş
          </button>
        </div>

        <h1 className="auth-title">
          {mode === "otp" ? "E-posta adresinizi girin" : "Tekrar hoş geldiniz"}
        </h1>
        <p className="auth-subtitle">
          {mode === "otp"
            ? "Hesap oluşturmak veya giriş yapmak için adresinize 6 haneli doğrulama kodu gönderilecek."
            : "Hesabınıza kullanıcı adı ve şifrenizle giriş yapın."}
        </p>

        {shownError && <div className="auth-error">{shownError}</div>}

        <label className="auth-field-label" htmlFor="login-email">
          E-posta adresi
        </label>
        <input
          id="login-email"
          className="auth-field-input"
          type="email"
          autoComplete="email"
          placeholder="ornek@email.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (fieldError) setFieldError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && mode === "otp") void handleSubmit();
          }}
          disabled={busy}
        />

        {mode === "password" && (
          <>
            <label className="auth-field-label" htmlFor="login-password" style={{ marginTop: 12 }}>
              Şifre
            </label>
            <input
              id="login-password"
              className="auth-field-input"
              type="password"
              autoComplete="current-password"
              placeholder="Şifreniz"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldError) setFieldError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleSubmit();
              }}
              disabled={busy}
            />
          </>
        )}

        <button
          className="auth-btn"
          onClick={handleSubmit}
          disabled={busy || !email.trim() || (mode === "password" && !password)}
        >
          {busy ? "Lütfen bekleyin…" : mode === "otp" ? "Kodu gönder" : "Giriş yap"}
        </button>

        <p className="auth-hint" style={{ marginTop: 16 }}>
          {mode === "otp"
            ? "Henüz hesabınız yok mu? Aynı akış sizi sıfırdan kaydeder."
            : "Şifrenizi mi unuttunuz? Yukarıdan “Kod ile giriş” sekmesini kullanın."}
        </p>
      </div>
    </div>
  );
}
