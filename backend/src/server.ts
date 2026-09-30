import "dotenv/config";
import express from "express";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import cors from "cors";
import cookieParser from "cookie-parser";
import { allowedOrigins, initSocket } from "./sockets/handler.js";
import { describeEmailMode, emailConfigWarnings } from "./auth/services.js";
import authRoutes from "./auth/routes.js";
import contactsRoutes from "./contacts/routes.js";
import conversationsRoutes from "./conversations/routes.js";
import prisma from "./db.js";

const app = express();
const server = createServer(app);

initSocket(server);

app.use(
  cors({
    origin: allowedOrigins(),
    credentials: true,
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "OpenMessaging API", timestamp: new Date().toISOString() });
});

app.use("/auth", authRoutes);
app.use("/contacts", contactsRoutes);
app.use("/conversations", conversationsRoutes);

// Üretimde frontend build'ini servis et (opsiyonel; tek platformda deploy için).
const frontendDist = path.resolve(process.cwd(), "../frontend/dist");
if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/socket\.io|\/auth|\/contacts|\/conversations|\/health).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

const PORT = Number.parseInt(process.env.PORT ?? "4000", 10);

// `.env` dosyası henüz doldurulmadıysa kullanıcıyı anlaşılır bir hatayla karşıla.
function assertDatabaseUrl(): void {
  const url = (process.env.DATABASE_URL ?? "").trim();
  const missing =
    !url || url.includes("BURAYA_NEON") || url.includes("YAPISTIR") || url.includes("user:pass@");
  if (!missing) return;

  console.error("\n✗ DATABASE_URL ayarlanmamış görünüyor.\n");
  console.error("  Yapılacaklar:");
  console.error("   1) Neon konsolunda sağ üstteki \"Connect\" butonuna bas.");
  console.error("   2) Açılan pencerede \"Connection string\" sekmesini seçip kopyala.");
  console.error("   3) backend/.env dosyasındaki DATABASE_URL satırına yapıştır.");
  console.error("   4) Şifre kısmı boşsa Neon'un verdiği gerçek şifreyle değiştir.\n");
  process.exit(1);
}

async function start() {
  assertDatabaseUrl();

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("✓ PostgreSQL bağlantısı sağlandı.");
  } catch (err) {
    console.error("✗ PostgreSQL bağlantısı başarısız.");
    console.error("  DATABASE_URL değerini kontrol edin (bkz. .env.example).");
    console.error("  İnternet/DNS erişimi ve şifrenin doğru olduğundan emin olun.");
    console.error(" ", (err as Error).message);
    process.exit(1);
  }

  server.listen(PORT, () => {
    console.log(`\n🚀 OpenMessaging API: http://localhost:${PORT}`);
    console.log(`   CORS origin : ${allowedOrigins().join(", ")}`);
    console.log(`   Socket.io   : aktif`);
    console.log(`   E-posta     : ${describeEmailMode()}`);
    for (const warning of emailConfigWarnings()) {
      console.warn(`   ⚠️  ${warning}`);
    }
    console.log("");
  });
}

start().catch((err) => {
  console.error("Sunucu başlatılamadı:", err);
  process.exit(1);
});
