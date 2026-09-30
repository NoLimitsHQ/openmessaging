/**
 * SMTP ayarlarını doğrulamak için test e-postası gönderir.
 *
 * Kullanım:
 *   npm run email:test              → .env içindeki SMTP_USER adresine gönderir
 *   npm run email:test -- senin@mail.com
 */
import "dotenv/config";
import nodemailer from "nodemailer";
import { describeEmailMode, emailConfigWarnings, isSmtpConfigured } from "../auth/services.js";

async function main() {
  const to = process.argv[2] ?? process.env.SMTP_USER;

  console.log("\n📮 OpenMessaging e-posta testi");
  console.log(`   Mod          : ${describeEmailMode()}`);

  if (!to) {
    console.error("\n✗ Hedef adres yok. Şöyle çalıştırın: npm run email:test -- senin@mail.com\n");
    process.exit(1);
  }

  console.log(`   Alıcı        : ${to}`);

  for (const warning of emailConfigWarnings()) {
    console.warn(`   ⚠️  ${warning}`);
  }

  const from = process.env.SMTP_FROM ?? "OpenMessaging <noreply@openmessaging.local>";
  console.log(`   Gönderen     : ${from}`);
  console.log(isSmtpConfigured() ? "   Durum        : gerçek SMTP\n" : "   Durum        : Ethereal test hesabı\n");

  const started = Date.now();

  try {
    let transporter: nodemailer.Transporter;

    if (isSmtpConfigured()) {
      const port = Number.parseInt(process.env.SMTP_PORT ?? "587", 10);
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
    } else {
      const account = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: account.smtp.host,
        port: account.smtp.port,
        secure: account.smtp.secure,
        auth: { user: account.user, pass: account.pass },
      });
    }

    // Bağlantıyı ve kimlik bilgilerini önce doğrula: hatayı daha net gösterir.
    await transporter.verify();
    console.log("✓ SMTP bağlantısı ve kimlik doğrulaması başarılı.");

    const info = await transporter.sendMail({
      from,
      to,
      subject: "OpenMessaging — SMTP testi",
      text: "Bu bir test e-postasıdır. SMTP ayarlarınız çalışıyor. 🎉",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto">
          <h2 style="color:#128C7E">SMTP ayarları çalışıyor 🎉</h2>
          <p>Bu bir test e-postasıdır. Artık OpenMessaging doğrulama kodları bu adresten gönderilecek.</p>
          <p style="color:#888;font-size:12px">Süre: ${Date.now() - started} ms</p>
        </div>
      `,
    });

    console.log(`✓ E-posta gönderildi (${Date.now() - started} ms)`);
    console.log(`   Message ID: ${info.messageId}`);

    const preview = nodemailer.getTestMessageUrl(info);
    if (preview) console.log(`   Önizleme  : ${preview}`);
    console.log("\nGelen kutunu (ve spam klasörünü) kontrol et.\n");
  } catch (err) {
    console.error("\n✗ E-posta gönderilemedi.");
    console.error(`   ${(err as Error).message}\n`);
    console.error("Sık görülen nedenler:");
    console.error("  • Gmail: normal şifre değil, 2FA ile alınan 16 haneli 'Uygulama Şifresi' gerekir");
    console.error("  • 587 portu bloklu ise SMTP_PORT=465 deneyin (secure bağlantı)");
    console.error("  • SMTP_USER adresinin tamamı olmalı (örn. senin@gmail.com)");
    console.error("  • SMTP_FROM, giriş yapılan hesapla aynı olmalı (Gmail/Outlook/Yandex)\n");
    process.exit(1);
  }
}

main();
