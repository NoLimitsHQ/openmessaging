import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAuth } from "../authContext";

const OTP_LENGTH = 6;

export default function VerifyOtpPage() {
  const navigate = useNavigate();
  const { otpEmail, verifyOtp, requestOtp, error, clearError } = useAuth();

  const [digits, setDigits] = useState<string[]>(() => Array(OTP_LENGTH).fill(""));
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  // E-posta gönderilmediyse girişe dön.
  useEffect(() => {
    if (!otpEmail) navigate("/login", { replace: true });
  }, [otpEmail, navigate]);

  const focusAt = (index: number) => inputs.current[index]?.focus();

  const handleChange = (index: number, raw: string) => {
    clearError();
    const value = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

    if (!value) {
      setDigits((prev) => prev.map((d, i) => (i === index ? "" : d)));
      return;
    }

    // Yapıştırma veya hızlı yazımda birden fazla karakter gelebilir.
    const chars = value.slice(0, OTP_LENGTH).split("");
    setDigits((prev) => {
      const next = [...prev];
      chars.forEach((c, offset) => {
        if (index + offset < OTP_LENGTH) next[index + offset] = c;
      });
      return next;
    });

    focusAt(Math.min(index + chars.length, OTP_LENGTH - 1));
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      if (digits[index]) {
        setDigits((prev) => prev.map((d, i) => (i === index ? "" : d)));
      } else if (index > 0) {
        e.preventDefault();
        setDigits((prev) => prev.map((d, i) => (i === index - 1 ? "" : d)));
        focusAt(index - 1);
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      focusAt(index - 1);
    } else if (e.key === "ArrowRight" && index < OTP_LENGTH - 1) {
      focusAt(index + 1);
    } else if (e.key === "Enter") {
      void handleVerify();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, OTP_LENGTH);
    if (!text) return;
    const chars = text.split("");
    setDigits(Array.from({ length: OTP_LENGTH }, (_, i) => chars[i] ?? ""));
    focusAt(Math.min(chars.length, OTP_LENGTH - 1));
  };

  const code = digits.join("");

  const handleVerify = async () => {
    clearError();
    if (code.length !== OTP_LENGTH) {
      toast.error("Lütfen 6 haneli kodu eksiksiz girin.");
      return;
    }

    setBusy(true);
    try {
      const step = await verifyOtp(code);
      if (step === "logged-in") {
        toast.success("Giriş yapıldı");
        navigate("/chat", { replace: true });
      } else if (step === "profile") {
        toast.success("E-posta doğrulandı");
        navigate("/register", { replace: true });
      }
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    if (!otpEmail) return;
    setResending(true);
    const ok = await requestOtp(otpEmail);
    setResending(false);
    if (ok) {
      toast.success("Yeni kod gönderildi");
      setDigits(Array(OTP_LENGTH).fill(""));
      focusAt(0);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-logo">
        <div className="auth-logo-icon">O</div>
        <div className="auth-logo-text">OpenMessaging</div>
      </div>

      <div className="auth-card">
        <div className="auth-step">Adım 2 / 3 — Doğrulama</div>
        <h1 className="auth-title">
          {otpEmail ? `${otpEmail} adresine kod gönderdik` : "Kodu girin"}
        </h1>
        <p className="auth-subtitle">
          E-postanızdaki 6 haneli kodu girin. Kod 10 dakika geçerlidir.
        </p>

        {error && <div className="auth-error">{error}</div>}

        <div className="otp-inputs">
          {digits.map((value, index) => (
            <input
              key={index}
              ref={(el) => {
                inputs.current[index] = el;
              }}
              className="otp-input"
              type="text"
              inputMode="text"
              autoComplete="one-time-code"
              maxLength={OTP_LENGTH}
              value={value}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              onFocus={(e) => e.target.select()}
              disabled={busy}
            />
          ))}
        </div>

        <p className="auth-hint" style={{ marginBottom: 12 }}>
          Kod harf ve rakam içerebilir (I, O, 1, 0 kullanılmaz).
        </p>

        <button
          className="auth-btn"
          onClick={handleVerify}
          disabled={code.length !== OTP_LENGTH || busy}
        >
          {busy ? "Doğrulanıyor…" : "Kodu doğrula"}
        </button>

        <button
          className="auth-btn auth-btn-secondary"
          onClick={handleResend}
          disabled={resending}
        >
          {resending ? "Gönderiliyor…" : "Yeni kod gönder"}
        </button>

        <p className="auth-hint" style={{ marginTop: 16 }}>
          Yanlış adres mi?{" "}
          <button type="button" className="auth-link" onClick={() => navigate("/login")}>
            E-postayı değiştir
          </button>
        </p>
      </div>
    </div>
  );
}
