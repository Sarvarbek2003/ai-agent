# Deploy — Call Analytic AI Agent

NewTel VPBX qo‘ng‘iroqlarini qabul qiladi, audioni MinIO ga yozadi, kerak bo‘lsa transkripsiya va operator baholashini qiladi. Dashboard alohida static frontend.

| Qism | Repo / papka | Produksiya |
|---|---|---|
| Backend API | `https://github.com/Sarvarbek2003/ai-agent` (`main`) | `root@217.114.11.64:/root/ai-agent`, PM2 `agent`, port **4444**, `https://dev.anjir.net` |
| Dashboard | lokal `ai-agent-dashboard` | `root@5.182.26.107:/var/www/call`, `https://call.xostlive.uz` |

`.env` va serverdagi `src/lib/minio.ts` gitga kiritilmaydi. Ularni overwrite qilmang.

---

## 1. Nima kerak

### Runtime

- **Node.js 22** (serverda 22.19)
- **npm**
- **PostgreSQL** (Prisma 6)
- **MinIO** (S3-compatible). Lokal: `docker compose up -d` (`9000` API, `9001` console)
- **PM2** (produksiya)
- **nginx** + Let’s Encrypt (dashboard va API reverse proxy)

### Tashqi xizmatlar

- **OpenAI API key** — transkripsiya (`gpt-transcribe`), tahlil (`gpt-4o` + `file_search` / vector store)
- **NewTel VPBX** webhook + imzo kaliti
- **Telegram bot** (ixtiyoriy) — long-poll

### Portlar

| Servis | Lokal | Produksiya |
|---|---|---|
| API | `5050` | `4444` (nginx → `dev.anjir.net`) |
| MinIO | `9000` / `9001` | serverdagi MinIO |
| Dashboard Vite | `5173` | static `443` (`call.xostlive.uz`) |

---

## 2. Environment

Fayl: loyiha ildizida `.env`. Namuna: `.env.example`.

`NODE_ENV=production` bo‘lsa `DATABASE_URL` va `AUTH_SECRET` majburiy.

```bash
# API
PORT=4444
NODE_ENV=production
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/ai_agent?schema=public"
PUBLIC_BASE_URL=https://dev.anjir.net
APP_TIMEZONE=Asia/Tashkent
FRONTEND_ORIGIN=https://call.xostlive.uz

# Auth (dashboard login)
AUTH_SECRET=<uzun-random-string>
AUTH_TOKEN_TTL_SEC=604800
DASHBOARD_EMAIL=admin@anjir.net
DASHBOARD_PASSWORD=<birinchi-user-uchun>
DASHBOARD_NAME=Admin
# Mavjud user parolini yangilash: DASHBOARD_PASSWORD_RESET=true qilib bir marta restart

# OpenAI
OPENAI_API_KEY=
OPENAI_ANALYSIS_MODEL=gpt-4o
# OPENAI_AGENT_MODEL=gpt-5.6-luna   # ixtiyoriy, eski Agents API

# NewTel
NEWTEL_WEBHOOK_KEY=

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_USE_SSL=false
MINIO_ACCESS_KEY=
MINIO_SECRET_KEY=
MINIO_BUCKET=call-recordings
MINIO_PUBLIC_URL=

# Telegram (bo'sh bo'lsa bot ishlamaydi)
TELEGRAM_BOT_TOKEN=
TELEGRAM_ALLOWED_USER_IDS=123456789
```

**Eslatma**

- `PUBLIC_BASE_URL` NewTel webhook URL ni beradi: `{PUBLIC_BASE_URL}/webhooks/newtel`
- `FRONTEND_ORIGIN` CORS. Bo‘sh bo‘lsa `*`
- Birinchi login: `DASHBOARD_EMAIL` + `DASHBOARD_PASSWORD` start paytida `User` yaratadi. Keyin parolni `.env` dan olib tashlash mumkin
- Parolni reset: `DASHBOARD_PASSWORD_RESET=true` + `DASHBOARD_PASSWORD`, restart, keyin flag ni o‘chiring

---

## 3. Lokal ishga tushirish (backend)

```bash
git clone https://github.com/Sarvarbek2003/ai-agent.git
cd ai-agent
cp .env.example .env
# .env ni to'ldiring

docker compose up -d          # MinIO
createdb ai_agent             # yoki o'z Postgres

npm install
npx prisma generate
npx prisma db push            # schema sync (produksiyada ham shu)
npm run prisma:seed           # ixtiyoriy

npm run dev                   # http://localhost:5050
```

Tekshiruv:

```bash
curl http://localhost:5050/health
# docs: http://localhost:5050/docs
```

Build + start:

```bash
npm run build
NODE_ENV=production npm start
```

### Lokal dashboard

Papka: `ai-agent-dashboard` (backend repodan alohida).

```bash
cd ai-agent-dashboard
npm install
npm run dev                   # http://localhost:5173
# /api → vite.config.ts dagi proxy (hozir https://dev.anjir.net)
```

Lokal API ga ulash uchun `vite.config.ts` ichida `server.proxy["/api"].target` ni `http://localhost:5050` qiling, yoki `.env`:

```
VITE_API_URL=http://localhost:5050
```

---

## 4. Produksiya — backend (PM2 `agent`)

Server: `root@217.114.11.64`  
Papka: `/root/ai-agent`  
Process: **`pm2` name `agent`**  
Port: **4444**

### Birinchi marta

```bash
git clone https://github.com/Sarvarbek2003/ai-agent.git /root/ai-agent
cd /root/ai-agent
# .env ni qo'lda yarating — gitdan kelmaydi
# src/lib/minio.ts serverga mos bo'lsa, gitdagi nusxani overwrite qilmang

npm install
npx prisma generate
npx prisma db push
npm run build

# PM2 (ecosystem.config.cjs serverda local, gitda yo'q)
pm2 start dist/index.js --name agent --cwd /root/ai-agent --update-env
pm2 save
```

`ecosystem.config.cjs` namuna:

```js
module.exports = {
  apps: [{
    name: "agent",
    cwd: "/root/ai-agent",
    script: "dist/index.js",
    interpreter: "node",
    env: { NODE_ENV: "production", PORT: "4444" },
  }],
};
```

### Oddiy deploy (git orqali)

```bash
cd /root/ai-agent
git stash push -m "server-local" -- src/lib/minio.ts || true
git pull --ff-only origin main
git stash pop || true

npm install
npx prisma db push
npx prisma generate
npm run build
pm2 restart agent --update-env
# to'xtagan bo'lsa: pm2 start agent --update-env
```

**Prisma:** `prisma migrate deploy` bu bazada P3005 berishi mumkin. Ishlatiladigan yo‘l — `npx prisma db push`. Ustun o‘chirishda Prisma data-loss ogohlantirsa: `npx prisma db push --accept-data-loss` (faqat nima o‘chishini bilib).

### PM2

```bash
pm2 status
pm2 logs agent --lines 50
pm2 stop agent
pm2 start agent --update-env
pm2 restart agent --update-env
```

### nginx (API)

`https://dev.anjir.net` → `http://127.0.0.1:4444`

Webhook: `POST https://dev.anjir.net/webhooks/newtel` (auth yo‘q, imzo `NEWTEL_WEBHOOK_KEY`).

---

## 5. Produksiya — dashboard

Server: `root@5.182.26.107`  
Root: `/var/www/call`  
Domen: `https://call.xostlive.uz`

Frontend API ni `/api` orqali chaqiradi. nginx:

```nginx
location /api/ {
    client_max_body_size 10M;
    proxy_pass https://dev.anjir.net/;
    proxy_ssl_server_name on;
    proxy_set_header Host dev.anjir.net;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
}

location / {
    root /var/www/call;
    try_files $uri $uri/ /index.html;
}
```

`.docx` mezon fayli 8 MB gacha. `client_max_body_size` shunga mos.

Deploy:

```bash
cd ai-agent-dashboard
npm ci
npm run build
rsync -az --delete dist/ root@5.182.26.107:/var/www/call/
ssh root@5.182.26.107 'chown -R www-data:www-data /var/www/call'
```

SPA: refresh `/calls/:id` ishlashi uchun `try_files ... /index.html` shart.

---

## 6. NewTel webhook

Kabinet: https://my.new-tel.net/

1. Webhook-оповещения → imzo kaliti → `NEWTEL_WEBHOOK_KEY`
2. URL: `https://dev.anjir.net/webhooks/newtel`
3. Eventlar: `inboundCallStart/End`, `outboundCallStart/End`, `ringingStart/End`, `inboundCallAnswer`

Tekshiruv (auth shart emas):

```bash
curl https://dev.anjir.net/webhooks/newtel
curl https://dev.anjir.net/health
```

---

## 7. Ishlash oqimi

1. NewTel webhook → `Call` + `WebhookEvent`
2. Audio NewTel linkidan MinIO `call-recordings` bucketiga
3. Sozlama **Avtomatik transkripsiya va tahlil** yoqilgan bo‘lsa: OpenAI transcribe → `file_search` (kiruvchi/chiquvchi vector store) → JSON baholash
4. O‘chiq bo‘lsa: audio saqlanadi, status `transcribing`. Tahlil — dashboardda **Qayta tahlil**
5. Cron (har 1 daqiqa): `createdAt` 10–30 daqiqa oldin, `callRecordLink` bor, `recordingObjectKey` yo‘q — faqat audio yuklash, transkripsiya yo‘q

Dashboarddan sozlash (login kerak):

- Prompt, avto tahlil kaliti
- Baholash agenti: kiruvchi + chiquvchi `.docx` → alohida OpenAI vector store
- DNID → ilova, operator kodi (`firstAnswer`)

Seed ilovalar (`MilliyPay`, `AnjirPay`, `Migsend`) `ensureDefaultApps` hozir upsert qilmaydi. Ilovalarni dashboarddan qo‘shing.

---

## 8. Auth va ochiq endpointlar

Login: `POST /auth/login` `{ "email", "password" }` → Bearer token.

Ochiq (token yo‘q): `/`, `/health`, `/auth/login`, `/webhooks/*`, `/ask/*`, `/docs`, `/openapi.json`.

Qolganlar: `Authorization: Bearer <token>`.

---

## 9. Health / loglar

```bash
curl https://dev.anjir.net/health
# { ok, database, minio, timezone, webhookUrl, swagger }

pm2 logs agent --lines 80
# "Recording download cron queued N call(s)"
# "Server running on http://localhost:4444"
```

Telegram `ETIMEDOUT` / `polling conflict` — token bo‘sh yoki boshqa instance poll qilayotgan bo‘lsa. Bir bot — bitta poller.

---

## 10. Cheklovlar

| Narsa | Qoida |
|---|---|
| `.env` | gitga kiritilmasin; serverda qo‘lda |
| `src/lib/minio.ts` | serverdagi local o‘zgarish; `git pull` oldin stash |
| Secretlar | `OPENAI_API_KEY`, `AUTH_SECRET`, MinIO, NewTel, Telegram, dashboard parol |
| Schema | `npx prisma db push`, `migrate deploy` emas |
| Process | faqat PM2 `agent`; `main`/`migsend` va boshqalarga tegmang |

---

## 11. Tezkor checklist

- [ ] Node 22, Postgres, MinIO
- [ ] `.env` to‘liq, `NODE_ENV=production`
- [ ] `npm install && npx prisma generate && npx prisma db push && npm run build`
- [ ] `pm2 start|restart agent --update-env`
- [ ] `GET /health` — `database: up`, `minio: up`
- [ ] NewTel URL + `NEWTEL_WEBHOOK_KEY`
- [ ] Dashboard user yaratilgan, `call.xostlive.uz` login
- [ ] Sozlamalarda kiruvchi/chiquvchi `.docx` vector store **Tayyor**
- [ ] nginx API 4444, dashboard `/api/` → `dev.anjir.net`, `client_max_body_size 10M`
