import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import nodemailer from "nodemailer";
import { z } from "zod";
import prisma from "../db.js";

// ---------------------------------------------------------------
// Validasyon şemaları
// ---------------------------------------------------------------
export const registerEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email("Lütfen geçerli bir e-posta girin."),
});

export const verifyOtpSchema = z.object({
  email: z.string().trim().toLowerCase().email("Lütfen geçerli bir e-posta girin."),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .length(6, "Kod 6 haneli olmalıdır.")
    .regex(/^[A-Z0-9]+$/, "Kod sadece harf ve rakam içerebilir."),
});

export const registerProfileSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  username: z
    .string()
    .trim()
    .min(3, "Kullanıcı adı en az 3 karakter olmalıdır.")
    .max(32, "Kullanıcı adı en fazla 32 karakter olabilir.")
    .regex(/^[a-zA-Z0-9_]+$/, "Kullanıcı adı sadece harf, rakam ve alt çizgi içerebilir."),
  password: z
    .string()
    .min(8, "Şifre en az 8 karakter olmalıdır.")
    .regex(/[A-Za-z]/, "Şifre en az bir harf içermeli.")
    .regex(/[0-9]/, "Şifre en az bir rakam içermeli."),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Lütfen geçerli bir e-posta girin."),
  password: z.string().min(1, "Şifre gerekli."),
});

// ---------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------
// I, O, 1 ve 0 karıştırılabildiği için kullanılmaz.
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const OTP_LENGTH = 6;
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 dakika
const OTP_RESEND_COOLDOWN_MS = 30 * 1000; // 30 saniye
const MAX_OTP_ATTEMPTS = 5;

// ---------------------------------------------------------------
// Kod üretimi + hash
// ---------------------------------------------------------------
function randomCode(length = OTP_LENGTH): string {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return out;
}

function hashOtpCode(code: string, salt: string): string {
  return crypto.createHmac("sha256", salt).update(code.toUpperCase()).digest("hex");
}

// ---------------------------------------------------------------
// E-posta gönderimi
// ---------------------------------------------------------------
let transporterPromise: Promise<nodemailer.Transporter> | null = null;

/** SMTP ayarlarının eksiksiz olup olmadığını kontrol eder. */
export function isSmtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** Sunucu başlarken hangi e-posta modunda çalıştığımızı loglamak için. */
export function describeEmailMode(): string {
  if (!isSmtpConfigured()) {
    return "Ethereal test hesabı (e-posta gerçekten gönderilmez) + kod konsola yazılır";
  }

  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT ?? "587";
  const from = process.env.SMTP_FROM ?? "(SMTP_FROM ayarlı değil!)";
  return `${host}:${port} → from: ${from}`;
}

/**
 * Bazı sağlayıcılar (Gmail, Outlook, Yandex) `From` adresinin, giriş yapılan
 * hesapla aynı olmasını şart koşar. Yanlış yapılandırmayı erken yakalayalım.
 */
export function emailConfigWarnings(): string[] {
  const warnings: string[] = [];
  const host = (process.env.SMTP_HOST ?? "").toLowerCase();
  const user = process.env.SMTP_USER ?? "";
  const from = process.env.SMTP_FROM ?? "";

  if (!isSmtpConfigured()) return warnings;

  const strictFromProviders = ["gmail", "outlook", "office365", "yandex", "hotmail"];
  if (strictFromProviders.some((p) => host.includes(p)) && !from.includes(user)) {
    warnings.push(
      `SMTP_FROM (${from || "boş"}) giriş yaptığınız hesabı (${user}) içermiyor. ` +
        "Bu sağlayıcılar genelde From adresinin hesap adresiyle aynı olmasını ister.",
    );
  }

  if (!from) {
    warnings.push("SMTP_FROM ayarlı değil, varsayılan gönderen adresi kullanılacak.");
  }

  return warnings;
}

async function getTransporter(): Promise<nodemailer.Transporter> {
  if (transporterPromise) return transporterPromise;

  transporterPromise = (async () => {
    const host = process.env.SMTP_HOST;
    const port = Number.parseInt(process.env.SMTP_PORT ?? "587", 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && user && pass) {
      return nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
    }

    // SMTP tanımlı değilse Ethereal test hesabı oluştur (ücretsiz, e-posta gerçekten gitmez).
    const testAccount = await nodemailer.createTestAccount();
    console.log(`✉️  Ethereal test hesabı hazır: ${testAccount.user}`);
    return nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: { user: testAccount.user, pass: testAccount.pass },
    });
  })();

  return transporterPromise;
}

export async function sendOtpEmail(email: string, code: string): Promise<void> {
  try {
    const transporter = await getTransporter();
    const from = process.env.SMTP_FROM ?? "OpenMessaging <noreply@openmessaging.local>";
    const info = await transporter.sendMail({
      from,
      to: email,
      subject: "OpenMessaging — Doğrulama Kodu",
      text: `OpenMessaging doğrulama kodunuz: ${code}\n\nKod 10 dakika geçerlidir.`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto">
          <h2 style="color:#128C7E">Merhaba,</h2>
          <p>OpenMessaging hesabınız için doğrulama kodu:</p>
          <h1 style="font-size:34px;letter-spacing:8px;color:#128C7E">${code}</h1>
          <p>Kod <strong>10 dakika</strong> boyunca geçerlidir.</p>
        </div>
      `,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`📧 E-posta önizlemesi: ${previewUrl}`);
    }
  } catch (err) {
    // E-posta gönderimi başarısız olsa bile akışı durdurmuyoruz (dev deneyimi).
    console.warn("⚠️  OTP e-postası gönderilemedi:", (err as Error).message);
    for (const warning of emailConfigWarnings()) {
      console.warn(`   ↳ ${warning}`);
    }
    if (isSmtpConfigured()) {
      console.warn(
        "   ↳ İpucu: Gmail kullanıyorsanız normal şifre DEĞİL, 2 adımlı doğrulama ile alınan " +
          '16 haneli "Uygulama Şifresi" gerekir.',
      );
    }
  }

  // Geliştirme kolaylığı: kodu konsola da yaz.
  if (process.env.NODE_ENV !== "production" || process.env.LOG_OTP === "true") {
    console.log(`🔑 [DEV] ${email} için doğrulama kodu: ${code}`);
  }
}

// ---------------------------------------------------------------
// OTP akışı
// ---------------------------------------------------------------
export async function startOtpFlow(email: string): Promise<{ ok: true; existing: boolean }> {
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { username: true },
  });

  const recent = await prisma.otpAttempt.findUnique({ where: { email } });
  if (recent && Date.now() - recent.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    const wait = Math.ceil(
      (OTP_RESEND_COOLDOWN_MS - (Date.now() - recent.createdAt.getTime())) / 1000,
    );
    throw new Error(`Çok sık kod istendi. Lütfen ${wait} saniye bekleyin.`);
  }

  const salt = crypto.randomBytes(16).toString("hex");
  const code = randomCode();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  await prisma.otpAttempt.upsert({
    where: { email },
    create: { email, codeHash: hashOtpCode(code, salt), salt, attempts: 0, expiresAt },
    update: {
      codeHash: hashOtpCode(code, salt),
      salt,
      attempts: 0,
      expiresAt,
      createdAt: new Date(),
    },
  });

  await sendOtpEmail(email, code);

  return { ok: true, existing: Boolean(existingUser?.username) };
}

/**
 * Kodu doğrular, kullanıcıyı `verified = true` olacak şekilde upsert eder
 * ve doğrulanmış kullanıcıyı döndürür. Profil tamamlanmamışsa username null'dur.
 */
export async function verifyOtpFlow(email: string, code: string) {
  const record = await prisma.otpAttempt.findUnique({ where: { email } });

  if (!record) {
    throw new Error("Bu e-posta için doğrulama kodu bulunamadı. Lütfen yeni kod isteyin.");
  }

  if (record.expiresAt.getTime() < Date.now()) {
    await prisma.otpAttempt.delete({ where: { email } }).catch(() => {});
    throw new Error("Doğrulama kodunun süresi doldu. Lütfen yeni kod isteyin.");
  }

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    throw new Error("Çok fazla hatalı deneme yapıldı. Lütfen yeni bir kod isteyin.");
  }

  if (hashOtpCode(code, record.salt) !== record.codeHash) {
    await prisma.otpAttempt.update({
      where: { email },
      data: { attempts: { increment: 1 } },
    });
    throw new Error("Kod hatalı. Lütfen tekrar deneyin.");
  }

  await prisma.otpAttempt.delete({ where: { email } });

  return prisma.user.upsert({
    where: { email },
    create: { email, verified: true },
    update: { verified: true },
  });
}

// ---------------------------------------------------------------
// Profil / kullanıcı
// ---------------------------------------------------------------
export async function getVerifiedUser(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return null;
  if (!user.verified) throw new Error("E-posta henüz doğrulanmamış.");
  return user;
}

export async function verifyPassword(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

/**
 * Profil tamamlar: username + password + benzersiz userTag atar.
 */
export async function completeProfile(input: {
  email: string;
  username: string;
  password: string;
}) {
  const user = await getVerifiedUser(input.email);
  if (!user) throw new Error("Lütfen önce e-postanızı doğrulayın.");
  if (user.username) throw new Error("Bu e-posta zaten bir hesaba sahip.");

  const usernameTaken = await prisma.user.findUnique({
    where: { username: input.username },
    select: { id: true },
  });
  if (usernameTaken && usernameTaken.id !== user.id) {
    throw new Error("Bu kullanıcı adı zaten alınmış. Lütfen başka bir tane deneyin.");
  }

  const passwordHash = await bcrypt.hash(input.password, 12);

  // userTag çakışması olasılığı düşük ama yine de birkaç kez dene.
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await prisma.user.update({
        where: { id: user.id },
        data: {
          username: input.username,
          passwordHash,
          userTag: randomCode(),
          verified: true,
        },
      });
    } catch (err: any) {
      const target = err?.meta?.target;
      if (err?.code === "P2002" && Array.isArray(target) && target.includes("userTag")) {
        continue; // yeni kod üret
      }
      if (err?.code === "P2002") {
        throw new Error("Bu kullanıcı adı zaten alınmış. Lütfen başka bir tane deneyin.");
      }
      throw err;
    }
  }

  throw new Error("Benzersiz kullanıcı kodu üretilemedi. Lütfen tekrar deneyin.");
}

export async function lookupUserByTag(userTag: string) {
  return prisma.user.findFirst({
    where: { userTag: userTag.toUpperCase() },
    select: {
      id: true,
      email: true,
      userTag: true,
      username: true,
      displayName: true,
      avatarUrl: true,
      lastSeen: true,
    },
  });
}
