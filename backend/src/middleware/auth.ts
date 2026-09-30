import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthenticatedRequest extends Request {
  user?: { id: string; email?: string };
}

export const JWT_SECRET = () => process.env.JWT_SECRET ?? "change-me-in-production";
export const JWT_REFRESH_SECRET = () => process.env.JWT_REFRESH_SECRET ?? "change-me-too";

export function generateAccessToken(userId: string, email?: string): string {
  return jwt.sign({ sub: userId, email }, JWT_SECRET(), { expiresIn: "7d" });
}

export function generateRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, JWT_REFRESH_SECRET(), { expiresIn: "30d" });
}

export function verifyAccessToken(token: string): { sub: string; email?: string } {
  return jwt.verify(token, JWT_SECRET()) as { sub: string; email?: string };
}

export function extractToken(req: Request): string | null {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  if (cookies?.accessToken) return cookies.accessToken;

  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);

  return null;
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ ok: false, error: "Yetkiniz yok. Lütfen giriş yapın." });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    res.status(401).json({ ok: false, error: "Geçersiz veya süresi dolmuş oturum." });
  }
}

const isProd = process.env.NODE_ENV === "production";

// Üretimde frontend ve backend farklı alan adlarında olabileceği için
// cross-site cookie gerekir (SameSite=None + Secure).
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? "none" : "lax") as "none" | "lax",
  path: "/",
};
