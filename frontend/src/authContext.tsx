import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  fetchMe,
  loginWithPassword as loginWithPasswordApi,
  logout as logoutApi,
  registerProfile as registerProfileApi,
  requestOtp as requestOtpApi,
  setAuthToken,
  verifyOtp as verifyOtpApi,
  writeStoredToken,
  readStoredToken,
  type AuthUser,
} from "./api";
import { disconnectSocket } from "./sockets";

export type VerifyStep = "profile" | "logged-in";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  otpEmail: string | null;
  error: string | null;
  clearError: () => void;
  requestOtp: (email: string) => Promise<boolean>;
  verifyOtp: (code: string) => Promise<VerifyStep | null>;
  completeProfile: (username: string, password: string) => Promise<boolean>;
  loginWithPassword: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [otpEmail, setOtpEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applySession = useCallback((nextUser: AuthUser, nextToken: string) => {
    setAuthToken(nextToken);
    writeStoredToken(nextToken);
    setUser(nextUser);
    setToken(nextToken);
    setError(null);
  }, []);

  const clearSession = useCallback(() => {
    setAuthToken(null);
    writeStoredToken(null);
    disconnectSocket();
    setUser(null);
    setToken(null);
  }, []);

  // Açılışta var olan oturumu geri yükle.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const stored = readStoredToken();
      setAuthToken(stored);

      const res = await fetchMe();
      if (cancelled) return;

      if (res.ok) {
        setUser(res.user);
        setToken(res.token);
        setAuthToken(res.token);
        writeStoredToken(res.token);
      } else {
        clearSession();
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [clearSession]);

  const requestOtp = useCallback(async (email: string) => {
    setError(null);
    const normalized = email.trim().toLowerCase();
    const res = await requestOtpApi(normalized);
    if (res.ok) {
      setOtpEmail(normalized);
      return true;
    }
    setError(res.error);
    return false;
  }, []);

  const verifyOtp = useCallback(
    async (code: string): Promise<VerifyStep | null> => {
      if (!otpEmail) {
        setError("Önce e-posta adresinizi girin.");
        return null;
      }

      setError(null);
      const res = await verifyOtpApi(otpEmail, code);

      if (!res.ok) {
        setError(res.error);
        return null;
      }

      if (res.step === "logged-in" && res.user && res.token) {
        applySession(res.user, res.token);
        setOtpEmail(null);
        return "logged-in";
      }

      return "profile";
    },
    [otpEmail, applySession],
  );

  const completeProfile = useCallback(
    async (username: string, password: string) => {
      if (!otpEmail) {
        setError("Önce e-posta adresinizi doğrulayın.");
        return false;
      }

      setError(null);
      const res = await registerProfileApi(otpEmail, username, password);

      if (res.ok) {
        applySession(res.user, res.token);
        setOtpEmail(null);
        return true;
      }

      setError(res.error);
      return false;
    },
    [otpEmail, applySession],
  );

  const loginWithPassword = useCallback(
    async (email: string, password: string) => {
      setError(null);
      const res = await loginWithPasswordApi(email.trim().toLowerCase(), password);
      if (res.ok) {
        applySession(res.user, res.token);
        setOtpEmail(null);
        return true;
      }
      setError(res.error);
      return false;
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    await logoutApi();
    clearSession();
    setOtpEmail(null);
    setError(null);
  }, [clearSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      otpEmail,
      error,
      clearError: () => setError(null),
      requestOtp,
      verifyOtp,
      completeProfile,
      loginWithPassword,
      logout,
    }),
    [user, token, loading, otpEmail, error, requestOtp, verifyOtp, completeProfile, loginWithPassword, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth, AuthProvider içinde kullanılmalıdır.");
  return ctx;
}
