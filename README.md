# OpenMessaging

Gerçek zamanlı, WhatsApp temalı full-stack mesajlaşma uygulaması.

## Özellikler

- **2 aşamalı kayıt:** E-posta → 6 haneli OTP (10 dk geçerli) → kullanıcı adı + şifre
- **Şifre ile giriş:** OTP'ye ek olarak e-posta + şifre ile doğrudan giriş
- **Benzersiz Kullanıcı Kodu (User Tag):** `K83M2P` formatında 6 haneli kod (`I, O, 1, 0` kullanılmaz)
- **Kişi ekleme yalnızca User Tag ile** — e-posta/telefon paylaşımı yok
- **Gerçek zamanlı mesajlaşma** (Socket.io) + `SENT / DELIVERED / READ` durum göstergeleri
- **Yazıyor… göstergesi**, okundu bilgisi, çevrimiçi durumu
- **WhatsApp koyu/açık tema** ve mobil uyumlu arayüz

## Teknoloji

| Katman | Teknoloji |
| --- | --- |
| Backend | Node.js + Express + TypeScript (ESM) + Prisma + PostgreSQL + Socket.io |
| Kimlik doğrulama | JWT (httpOnly cookie **ve** Socket.io handshake için token) + bcrypt |
| E-posta | nodemailer (SMTP yoksa Ethereal test hesabı) |
| Frontend | React 18 + Vite + TypeScript + react-router-dom + axios + socket.io-client + sonner |

## Klasör yapısı

```
openmessaging/
├─ backend/
│  ├─ prisma/schema.prisma      # User, OtpAttempt, Contact, Conversation, Message
│  └─ src/
│     ├─ auth/                  # OTP + kayıt + giriş
│     ├─ contacts/              # User Tag ile kişi ekleme
│     ├─ conversations/         # Sohbet + mesaj servisleri
│     ├─ sockets/               # Socket.io olayları
│     ├─ middleware/auth.ts     # JWT doğrulama
│     └─ server.ts
└─ frontend/
   └─ src/
      ├─ pages/                 # Login, VerifyOtp, RegisterProfile, Chat
      ├─ components/            # Sidebar, MessagePanel, MessageBubble
      ├─ api.ts                 # HTTP istemcisi
      ├─ sockets.ts             # Socket.io istemcisi
      └─ authContext.tsx        # Oturum yönetimi
```

## Gereksinimler

1. **Node.js 20 veya üzeri** — https://nodejs.org (LTS sürümünü kurun)
2. **PostgreSQL** — yerel kurulum **veya** ücretsiz bulut (aşağıya bakın)

## Kurulum

### 1) Backend

```bash
cd openmessaging/backend
npm install
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
```

`.env` içinde **mutlaka** şu üç değeri ayarlayın:

```env
DATABASE_URL="postgresql://kullanici:sifre@localhost:5432/openmessaging?schema=public"
JWT_SECRET="uzun-rastgele-bir-deger"
JWT_REFRESH_SECRET="baska-uzun-rastgele-bir-deger"
```

Ardından veritabanı tablolarını oluşturup sunucuyu başlatın:

```bash
npx prisma generate
npx prisma migrate dev --name init   # tabloları oluşturur
npm run dev                          # http://localhost:4000
```

### 2) Frontend

```bash
cd openmessaging/frontend
npm install
npm run dev                          # http://localhost:5173
```

Tarayıcıda **http://localhost:5173** adresini açın.

### 3) Kayıt akışını deneyin

1. E-posta adresinizi girin → "Kodu gönder"
2. Doğrulama kodu:
   - `SMTP_*` ayarları boşsa **konsola** yazılır: `🔑 [DEV] mail@ornek.com için doğrulama kodu: K83M2P`
   - Ayrıca Ethereal önizleme linki loglanır (e-posta gerçekten gönderilmez)
3. Kodu girin → kullanıcı adı + şifre belirleyin → size özel **Kullanıcı Kodu** oluşur
4. İkinci bir hesapla giriş yapıp, ilk hesabın Kullanıcı Kodunu **+ Kişi** ile ekleyin
5. İki tarayıcı penceresinde sohbet edin; `✓` / `✓✓` / mavi `✓✓` durumlarını görün

> Not: `experimental` uyarıları görmezden gelinebilir.

## E-posta gönderimi (doğrulama kodları)

Varsayılan olarak hiçbir ayar yapmadan çalışır: **Ethereal test hesabı** kullanılır, e-posta gerçekten gönderilmez ama kod konsola yazılır ve bir önizleme linki loglanır.

```
🔑 [DEV] mail@ornek.com için doğrulama kodu: K83M2P
📧 E-posta önizlemesi: https://ethereal.email/message/...
```

Gerçek bir adresten göndermek için `backend/.env` içinde `SMTP_*` değerlerini doldurun. Ayarları doğrulamak için:

```bash
npm run email:test                 # SMTP_USER adresine test maili gönderir
npm run email:test -- senin@mail.com
```

### Seçenek A — Gmail (kişisel hesap)

1. Google hesabında **2 Adımlı Doğrulama**'yı açın (zorunlu)
2. https://myaccount.google.com/apppasswords → yeni **Uygulama Şifresi** oluşturun
3. Çıkan 16 haneli şifreyi (boşlukları silerek) `.env`'e yazın:

```env
SMTP_HOST="smtp.gmail.com"
SMTP_PORT=587
SMTP_USER="senin.adresin@gmail.com"
SMTP_PASS="abcd efgh ijkl mnop"      # Uygulama Şifresi (normal şifren DEĞİL)
SMTP_FROM="OpenMessaging <senin.adresin@gmail.com>"
```

> ⚠️ Gmail, `SMTP_FROM` adresinin giriş yapılan hesapla **aynı** olmasını şart koşar. Farklı olursa gönderim reddedilir.

Gmail'in günlük limiti kişisel hesaplarda ~500 mail/gündür.

### Seçenek B — Brevo (önerilen, ücretsiz 300/gün)

Toplu/test e-postaları için kurumsal bir adres daha sağlıklı. 2FA uğraşı yok.

1. https://www.brevo.com → ücretsiz hesap (kredi kartı istemez)
2. **SMTP & API** → **SMTP** sekmesinden kullanıcı adı ve anahtarı alın
3. Aynı ekranda **sender** (gönderen) adresini doğrulayın

```env
SMTP_HOST="smtp-relay.brevo.com"
SMTP_PORT=587
SMTP_USER="<Brevo'nun verdiği login>"
SMTP_PASS="<Brevo'nun verdiği SMTP anahtarı>"
SMTP_FROM="OpenMessaging <dogrulanmis@adresin.com>"
```

### Diğer sağlayıcılar

| Sağlayıcı | SMTP_HOST | Port | Not |
| --- | --- | --- | --- |
| Outlook / Hotmail | `smtp-mail.outlook.com` | 587 | `SMTP_FROM` = hesap adresi olmalı |
| Yandex | `smtp.yandex.com` | 465 | Uygulama şifresi gerekir |
| Resend | `smtp.resend.com` | 587 | `SMTP_USER="resend"`, kendi alan adınızı doğrulamanız gerekir |
| Mailtrap | `sandbox.smtp.mailtrap.io` | 587 | Sadece test; mailler gerçek adrese gitmez |

> İpucu: 587 portu ağınızda blokluysa `SMTP_PORT=465` deneyin (kod bunu otomatik olarak `secure` bağlantıya çevirir).

## Ortam değişkenleri

### backend/.env

| Değişken | Zorunlu | Açıklama |
| --- | --- | --- |
| `DATABASE_URL` | ✅ | PostgreSQL bağlantı adresi |
| `JWT_SECRET` | ✅ | Access token imzası (üretimde değiştirin!) |
| `JWT_REFRESH_SECRET` | ✅ | Refresh token imzası |
| `PORT` | – | Varsayılan `4000` |
| `CORS_ORIGIN` | – | İzinli origin(ler), virgülle ayrılır. Varsayılan `http://localhost:5173` |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | – | Boşsa Ethereal + konsol |
| `LOG_OTP` | – | `true` ise kod konsola yazılır |

### frontend/.env

| Değişken | Açıklama |
| --- | --- |
| `VITE_API_URL` | Üretimde backend adresi (boşsa Vite proxy kullanılır) |
| `VITE_SOCKET_URL` | Üretimde Socket.io adresi (boşsa `VITE_API_URL`) |
| `VITE_BACKEND_URL` | Dev proxy hedefi (varsayılan `http://localhost:4000`) |

## Ücretsiz yayına alma (hosting)

Socket.io **uzun ömürlü** bir bağlantı gerektirir. Bu yüzden backend'i **serverless** bir platforma (Vercel/Netlify Functions) koymak çalışmaz — sürekli çalışan bir web servise ihtiyacınız var.

### Önerilen kombinasyon (hepsi ücretsiz)

| Bileşen | Platform | Not |
| --- | --- | --- |
| **Veritabanı** | **Neon** (neon.tech) veya **Supabase** | Neon daha hızlı kurulur; connection string'i olduğu gibi `DATABASE_URL`'e yapıştırın (`?sslmode=require` ekleyin) |
| **Backend** | **Render** (render.com) ücretsiz Web Service | WebSocket destekler. Ücretsiz planda 15 dk hareketsizlikte uykuya geçer; ilk istek ~30 sn sürebilir |
| **Frontend** | **Vercel** (vercel.com) | Vite otomatik algılanır. Root: `openmessaging/frontend` |

### Alternatifler

- Backend için **Railway** (deneme kredisi) veya **Fly.io** (kredi kartı ister)
- Frontend için **Netlify** veya **Cloudflare Pages**
- Tek platformda toplamak isterseniz: **Supabase** (DB) + **Render** (backend) + **Vercel** (frontend) en sorunsuz üçlü

### Deploy adımları

**1. Veritabanı (Neon):** proje açın → connection string'i kopyalayın.

**2. Backend (Render):**
- New → Web Service → repo'yu bağlayın
- Root Directory: `openmessaging/backend`
- Build Command: `npm install && npx prisma generate && npm run build`
- Start Command: `npm run start` (ilk deploy'dan önce tablolar için `npx prisma migrate deploy` çalıştırın veya Render'ın Shell'inden bir kez çalıştırın)
- Environment:
  ```
  DATABASE_URL=<Neon connection string>
  JWT_SECRET=<rastgele uzun değer>
  JWT_REFRESH_SECRET=<rastgele uzun değer>
  NODE_ENV=production
  CORS_ORIGIN=https://<vercel-uygulamanız>.vercel.app
  ```

**3. Frontend (Vercel):**
- Root Directory: `openmessaging/frontend`
- Framework: Vite (otomatik)
- Environment:
  ```
  VITE_API_URL=https://<render-servisiniz>.onrender.com
  VITE_SOCKET_URL=https://<render-servisiniz>.onrender.com
  ```

**4. Son kontrol:** Render'da `CORS_ORIGIN` değerinin Vercel adresiyle **birebir** aynı olduğundan emin olun (sonda `/` olmasın).

## Komutlar

### backend

| Komut | Açıklama |
| --- | --- |
| `npm run dev` | Geliştirme sunucusu (tsx watch, hot reload) |
| `npm run build` | TypeScript → `dist/` |
| `npm run start` | Üretim sunucusu |
| `npm run typecheck` | Tip kontrolü |
| `npm run email:test` | SMTP ayarını test et (test maili gönder) |
| `npm run db:migrate` | Yeni migration oluştur + uygula |
| `npm run db:deploy` | Mevcut migration'ları uygula (üretim) |
| `npm run db:studio` | Prisma Studio (veritabanı arayüzü) |

### frontend

| Komut | Açıklama |
| --- | --- |
| `npm run dev` | Vite geliştirme sunucusu |
| `npm run build` | Tip kontrolü + üretim derlemesi (`dist/`) |
| `npm run preview` | Derlenmiş çıktıyı önizle |

## API özeti

| Metot | Yol | Açıklama |
| --- | --- | --- |
| `POST` | `/auth/register-email` | OTP gönder |
| `POST` | `/auth/verify-otp` | Kodu doğrula (hesap hazırsa giriş yapar) |
| `POST` | `/auth/register-profile` | Kullanıcı adı + şifre + User Tag oluştur |
| `POST` | `/auth/login` | E-posta + şifre ile giriş |
| `GET` | `/auth/me` | Mevcut oturum |
| `POST` | `/auth/logout` | Çıkış |
| `GET` | `/contacts` | Kişi listesi |
| `POST` | `/contacts` | `{ userTag }` ile kişi ekle |
| `GET` | `/conversations` | Sohbet listesi |
| `POST` | `/conversations` | `{ userId }` ile sohbet başlat |
| `GET` | `/conversations/:id` | Mesajlar |
| `POST` | `/conversations/:id/read` | Okundu işaretle |

### Socket.io olayları

| Yön | Olay | Açıklama |
| --- | --- | --- |
| ↗ | `join_conversation` / `leave_conversation` | Oda katıl/ayrıl (yazıyor göstergesi için) |
| ↗ | `send_message` | `{ conversationId, content }` |
| ↗ | `typing_start` / `typing_stop` | Yazıyor göstergesi |
| ↗ | `mark_seen` | Sohbeti okundu işaretle |
| ↙ | `message:new` | `{ conversationId, message }` |
| ↙ | `message:ack` | `{ messageId, status }` |
| ↙ | `contact:added` | Yeni kişi eklendi |
