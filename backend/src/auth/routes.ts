import { Router, type Response } from "express";
import {
  registerEmailSchema,
  verifyOtpSchema,
  registerProfileSchema,
  loginSchema,
  startOtpFlow,
  verifyOtpFlow,
  completeProfile,
  verifyPassword,
} from "./services.js";
import {
  authenticate,
  generateAccessToken,
  generateRefreshToken,
  COOKIE_OPTIONS,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import prisma from "../db.js";

const router = Router();

// -------------------------------------------------------
// Yardımcılar
// -------------------------------------------------------
interface PublicUser {
  id: string;
  email: string;
  username: string | null;
  userTag: string | null;
  avatarUrl: string | null;
  displayName: string | null;
  lastSeen?: Date;
}

function toPublicUser(user: {
  id: string;
  email: string;
  username: string | null;
  userTag: string | null;
  avatarUrl: string | null;
  displayName: string | null;
  lastSeen?: Date;
}): PublicUser {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    userTag: user.userTag,
    avatarUrl: user.avatarUrl,
    displayName: user.displayName,
    lastSeen: user.lastSeen,
  };
}

/**
 * Token'ları hem httpOnly cookie olarak hem de gövdede döner.
 * Gövdedeki token, Socket.io handshake doğrulaması için gereklidir
 * (tarayıcı WebSocket handshake'ine httpOnly cookie gönderemez).
 */
function issueSession(res: Response, user: { id: string; email: string }) {
  const accessToken = generateAccessToken(user.id, user.email);
  const refreshToken = generateRefreshToken(user.id);

  res.cookie("accessToken", accessToken, { ...COOKIE_OPTIONS, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.cookie("refreshToken", refreshToken, { ...COOKIE_OPTIONS, maxAge: 30 * 24 * 60 * 60 * 1000 });

  return accessToken;
}

function handleZod(err: any): string | null {
  if (err?.issues?.length) return err.issues[0].message as string;
  return null;
}

// -------------------------------------------------------
// POST /auth/register-email → e-posta gir, OTP gönder
// -------------------------------------------------------
router.post("/register-email", async (req, res) => {
  try {
    const body = registerEmailSchema.parse(req.body);
    const result = await startOtpFlow(body.email);
    res.status(200).json({
      ok: true,
      existing: result.existing,
      message: "Doğrulama kodu e-postanıza gönderildi.",
    });
  } catch (err: any) {
    res.status(400).json({ ok: false, error: handleZod(err) ?? err?.message ?? "Beklenmeyen hata." });
  }
});

// -------------------------------------------------------
// POST /auth/verify-otp → kodu doğrula
//   - Hesap tamamlanmışsa: doğrudan giriş yapar (token döner)
//   - Değilse: step = "profile"
// -------------------------------------------------------
router.post("/verify-otp", async (req, res) => {
  try {
    const body = verifyOtpSchema.parse(req.body);
    const user = await verifyOtpFlow(body.email, body.code);

    if (user.username && user.userTag) {
      const token = issueSession(res, user);
      return res.status(200).json({ ok: true, step: "logged-in", user: toPublicUser(user), token });
    }

    return res.status(200).json({ ok: true, step: "profile" });
  } catch (err: any) {
    return res.status(400).json({
      ok: false,
      error: handleZod(err) ?? err?.message ?? "Doğrulama hatası.",
    });
  }
});

// -------------------------------------------------------
// POST /auth/register-profile → username + şifre ile hesabı tamamla
// -------------------------------------------------------
router.post("/register-profile", async (req, res) => {
  try {
    const body = registerProfileSchema.parse(req.body);
    const user = await completeProfile(body);
    const token = issueSession(res, user);
    res.status(201).json({ ok: true, user: toPublicUser(user), token });
  } catch (err: any) {
    const message = handleZod(err) ?? err?.message ?? "Profil oluşturulamadı.";
    const status = /zaten alınmış|zaten bir hesaba sahip/.test(message) ? 409 : 400;
    res.status(status).json({ ok: false, error: message });
  }
});

// -------------------------------------------------------
// POST /auth/login → e-posta + şifre ile giriş
// -------------------------------------------------------
router.post("/login", async (req, res) => {
  try {
    const body = loginSchema.parse(req.body);
    const user = await verifyPassword(body.email, body.password);
    if (!user) {
      return res.status(401).json({ ok: false, error: "E-posta veya şifre hatalı." });
    }
    const token = issueSession(res, user);
    return res.status(200).json({ ok: true, user: toPublicUser(user), token });
  } catch (err: any) {
    return res.status(400).json({ ok: false, error: handleZod(err) ?? err?.message ?? "Giriş yapılamadı." });
  }
});

// -------------------------------------------------------
// GET /auth/me → mevcut oturum (+ socket için taze token)
// -------------------------------------------------------
router.get("/me", authenticate, async (req: AuthenticatedRequest, res: Response) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) {
    return res.status(404).json({ ok: false, error: "Kullanıcı bulunamadı." });
  }
  const token = generateAccessToken(user.id, user.email);
  return res.status(200).json({ ok: true, user: toPublicUser(user), token });
});

// -------------------------------------------------------
// POST /auth/logout
// -------------------------------------------------------
router.post("/logout", (_req, res) => {
  res.clearCookie("accessToken", COOKIE_OPTIONS);
  res.clearCookie("refreshToken", COOKIE_OPTIONS);
  res.status(200).json({ ok: true });
});

export default router;
