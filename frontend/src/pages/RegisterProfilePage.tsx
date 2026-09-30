import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../authContext";

const USERNAME_RE = /^[a-zA-Z0-9_]{3,32}$/;

export default function RegisterProfilePage() {
  const navigate = useNavigate();
  const { otpEmail, completeProfile, error, clearError } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!otpEmail) navigate("/login", { replace: true });
  }, [otpEmail, navigate]);

  const validate = (): string | null => {
    if (!username.trim()) return "Kullanıcı adı gerekli.";
    if (!USERNAME_RE.test(username.trim())) {
      return "Kullanıcı adı 3-32 karakter olmalı; sadece harf, rakam ve _ kullanabilirsin.";
    }
    if (password.length < 8) return "Şifre en az 8 karakter olmalı.";
    if (!/[A-Za-z]/.test(password)) return "Şifre en az bir harf içermeli.";
    if (!/[0-9]/.test(password)) return "Şifre en az bir rakam içermeli.";
    if (password !== confirm) return "Şifreler eşleşmiyor.";
    return null;
  };

  const handleSubmit = async () => {
    clearError();
    const problem = validate();
    setFieldError(problem);
    if (problem) return;

    setBusy(true);
    try {
      const ok = await completeProfile(username.trim(), password);
      if (ok) {
        toast.success("Hesabınız oluşturuldu");
        navigate("/chat", { replace: true });
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
        <div className="auth-step">Adım 3 / 3 — Profil</div>
        <h1 className="auth-title">Hesabını tamamla</h1>
        <p className="auth-subtitle">
          <strong>{otpEmail}</strong> adresine bağlı hesabın için bir kullanıcı adı ve şifre
          belirle. Sana özel 6 haneli Kullanıcı Kodu (ör. <code>K83M2P</code>) otomatik
          oluşturulacak.
        </p>

        {shownError && <div className="auth-error">{shownError}</div>}

        <label className="auth-field-label" htmlFor="reg-username">
          Kullanıcı adı
        </label>
        <input
          id="reg-username"
          className="auth-field-input"
          type="text"
          autoComplete="username"
          placeholder="ornek_kullanici"
          value={username}
          onChange={(e) => {
            setUsername(e.target.value);
            setFieldError(null);
          }}
          disabled={busy}
        />

        <label className="auth-field-label" htmlFor="reg-password" style={{ marginTop: 12 }}>
          Şifre
        </label>
        <input
          id="reg-password"
          className="auth-field-input"
          type="password"
          autoComplete="new-password"
          placeholder="En az 8 karakter, harf ve rakam"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setFieldError(null);
          }}
          disabled={busy}
        />

        <label className="auth-field-label" htmlFor="reg-confirm" style={{ marginTop: 12 }}>
          Şifre (tekrar)
        </label>
        <input
          id="reg-confirm"
          className="auth-field-input"
          type="password"
          autoComplete="new-password"
          placeholder="Şifreyi tekrar girin"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setFieldError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") void handleSubmit();
          }}
          disabled={busy}
        />

        <button
          className="auth-btn"
          onClick={handleSubmit}
          disabled={busy || !username.trim() || !password || !confirm}
        >
          {busy ? "Hesap oluşturuluyor…" : "Hesabı oluştur"}
        </button>

        <p className="auth-hint" style={{ marginTop: 16 }}>
          Giriş yaparken kullanıcı adını değil, e-posta adresini kullanacaksın.
        </p>
      </div>
    </div>
  );
}
