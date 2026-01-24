# 🚀 Sperm.io - Coolify Deployment Guide (For Dummies)

## 📋 სარჩევი
1. [წინასწარი მოთხოვნები](#წინასწარი-მოთხოვნები)
2. [Coolify-ის მომზადება](#coolify-ის-მომზადება)
3. [PostgreSQL-ის დაყენება](#postgresql-ის-დაყენება)
4. [Redis-ის დაყენება](#redis-ის-დაყენება)
5. [API Server-ის Deploy](#api-server-ის-deploy)
6. [Game Server-ის Deploy](#game-server-ის-deploy)
7. [Frontend-ის Deploy](#frontend-ის-deploy)
8. [DNS კონფიგურაცია](#dns-კონფიგურაცია)
9. [SSL სერტიფიკატები](#ssl-სერტიფიკატები)
10. [ტესტირება](#ტესტირება)

---

## 🔧 წინასწარი მოთხოვნები

### შენი VPS სპეციფიკაციები:
- ✅ CPU: 4 cores
- ✅ RAM: 8GB
- ✅ SSD: 150GB
- ✅ დომენი: spermiobeta.xyz

### რა გჭირდება:
- [ ] SSH წვდომა სერვერზე
- [ ] Coolify v4.0.0-beta.460 დაყენებული
- [ ] დომენის DNS წვდომა

---

## 📦 Coolify-ის მომზადება

### ნაბიჯი 1: შედი Coolify Dashboard-ში
```
https://your-server-ip:8000
```

### ნაბიჯი 2: შექმენი ახალი Project
1. დააჭირე **"+ New Project"**
2. სახელი: `spermio-production`
3. აღწერა: `Sperm.io Biological Battle Arena`

### ნაბიჯი 3: შექმენი Environment
1. Project-ში დააჭირე **"+ New Environment"**
2. სახელი: `production`

---

## 🗄️ PostgreSQL-ის დაყენება

### ნაბიჯი 1: დაამატე PostgreSQL სერვისი
1. Environment-ში დააჭირე **"+ New"** → **"Database"** → **"PostgreSQL"**
2. კონფიგურაცია:
   - **Name:** `spermio-postgres`
   - **Version:** `16`
   - **Database:** `spermio`
   - **Username:** `spermio_app`
   - **Password:** (შექმენი ძლიერი პაროლი და ჩაინიშნე!)

### ნაბიჯი 2: Deploy და დაელოდე
1. დააჭირე **"Deploy"**
2. დაელოდე სანამ სტატუსი გახდება **"Running"**

### ნაბიჯი 3: Database Schema-ს ინიციალიზაცია
1. Coolify-ში გახსენი PostgreSQL Terminal:
   - დააჭირე **"Terminal"** ტაბს
2. გაუშვი შემდეგი ბრძანება:

```bash
psql -U spermio_app -d spermio
```

3. დააკოპირე და ჩასვი `database/init.sql` ფაილის შიგთავსი
4. დააჭირე Enter და დაელოდე

### ნაბიჯი 4: შეინახე Connection String
```
postgresql://spermio_app:YOUR_PASSWORD@spermio-postgres:5432/spermio
```

---

## 🔴 Redis-ის დაყენება

### ნაბიჯი 1: დაამატე Redis სერვისი
1. **"+ New"** → **"Database"** → **"Redis"**
2. კონფიგურაცია:
   - **Name:** `spermio-redis`
   - **Version:** `7`
   - **Password:** (შექმენი და ჩაინიშნე!)

### ნაბიჯი 2: Deploy
დააჭირე **"Deploy"** და დაელოდე **"Running"** სტატუსს

---

## 🔌 API Server-ის Deploy

### ნაბიჯი 1: დაამატე სერვისი
1. **"+ New"** → **"Application"** → **"Docker Image"**
2. **Name:** `spermio-api`

### ნაბიჯი 2: Build Configuration
1. **Source:** Git Repository
2. **Repository URL:** შენი GitHub repo URL
3. **Branch:** `main`
4. **Build Pack:** `Dockerfile`
5. **Dockerfile Location:** `Dockerfile.api`

### ნაბიჯი 3: Environment Variables
დააჭირე **"Environment Variables"** და დაამატე:

```env
NODE_ENV=production
API_PORT=3001
DB_HOST=spermio-postgres
DB_PORT=5432
DB_NAME=spermio
DB_USER=spermio_app
DB_PASSWORD=YOUR_POSTGRES_PASSWORD
JWT_SECRET=YOUR_JWT_SECRET_HERE
REDIS_HOST=spermio-redis
REDIS_PORT=6379
REDIS_PASSWORD=YOUR_REDIS_PASSWORD
ALLOWED_ORIGINS=https://spermiobeta.xyz,https://api.spermiobeta.xyz
```

### ნაბიჯი 4: Network Settings
1. **Port Exposes:** `3001`
2. **Domain:** `api.spermiobeta.xyz`

### ნაბიჯი 5: Deploy
დააჭირე **"Deploy"**

---

## 🎮 Game Server-ის Deploy

### ნაბიჯი 1: დაამატე სერვისი
1. **"+ New"** → **"Application"** → **"Docker Image"**
2. **Name:** `spermio-game-server`

### ნაბიჯი 2: Build Configuration
1. **Source:** Git Repository (იგივე repo)
2. **Branch:** `main`
3. **Dockerfile Location:** `Dockerfile.game-server`

### ნაბიჯი 3: Environment Variables
```env
NODE_ENV=production
PORT=3002
ALLOWED_ORIGINS=https://spermiobeta.xyz
REDIS_HOST=spermio-redis
REDIS_PORT=6379
REDIS_PASSWORD=YOUR_REDIS_PASSWORD
```

### ნაბიჯი 4: Network Settings
1. **Port Exposes:** `3002`
2. **Domain:** `game.spermiobeta.xyz`
3. **⚠️ IMPORTANT:** WebSocket Support-ის ჩართვა:
   - Coolify v4-ში: Settings → **"Enable WebSocket"** ✅

### ნაბიჯი 5: Deploy
დააჭირე **"Deploy"**

---

## 🌐 Frontend-ის Deploy

### ნაბიჯი 1: დაამატე სერვისი
1. **"+ New"** → **"Application"** → **"Docker Image"**
2. **Name:** `spermio-frontend`

### ნაბიჯი 2: Build Configuration
1. **Source:** Git Repository (იგივე repo)
2. **Branch:** `main`
3. **Dockerfile Location:** `Dockerfile.frontend`

### ნაბიჯი 3: Build Arguments
**⚠️ IMPORTANT:** ეს არის build-time ცვლადები!

დააჭირე **"Build Arguments"** და დაამატე:
```
VITE_API_URL=https://api.spermiobeta.xyz
VITE_GAME_SERVER_URL=https://game.spermiobeta.xyz
VITE_SOLANA_CLUSTER=devnet
```

### ნაბიჯი 4: Environment Variables
```env
NODE_ENV=production
PORT=3000
```

### ნაბიჯი 5: Network Settings
1. **Port Exposes:** `3000`
2. **Domain:** `spermiobeta.xyz` და `www.spermiobeta.xyz`

### ნაბიჯი 6: Deploy
დააჭირე **"Deploy"**

---

## 🌍 DNS კონფიგურაცია

შენს Domain Provider-ში (Cloudflare, Namecheap, etc.) დაამატე:

### A Records
| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | YOUR_SERVER_IP | Auto |
| A | www | YOUR_SERVER_IP | Auto |
| A | api | YOUR_SERVER_IP | Auto |
| A | game | YOUR_SERVER_IP | Auto |

### მაგალითი Cloudflare-სთვის:
```
spermiobeta.xyz      →  A  →  YOUR_SERVER_IP
www.spermiobeta.xyz  →  A  →  YOUR_SERVER_IP
api.spermiobeta.xyz  →  A  →  YOUR_SERVER_IP
game.spermiobeta.xyz →  A  →  YOUR_SERVER_IP
```

**⚠️ Cloudflare-ზე:** Proxy სტატუსი **OFF** (DNS Only) game subdomain-ისთვის WebSocket-ის გამო!

---

## 🔒 SSL სერტიფიკატები

### Coolify v4 ავტომატურად აგენერირებს Let's Encrypt SSL-ს!

1. თითოეული სერვისისთვის:
   - გახსენი Settings
   - **"Enable SSL"** ✅
   - **"Force HTTPS"** ✅

2. დაელოდე 2-3 წუთი სანამ სერტიფიკატები გამოიცემა

---

## ✅ ტესტირება

### 1. შეამოწმე PostgreSQL
```bash
# Coolify Terminal-ში
psql -U spermio_app -d spermio -c "SELECT COUNT(*) FROM profiles;"
```

### 2. შეამოწმე API
```bash
curl https://api.spermiobeta.xyz/api/health
```
მოსალოდნელი პასუხი:
```json
{"status":"ok","database":"connected"}
```

### 3. შეამოწმე Game Server
```bash
curl https://game.spermiobeta.xyz/health
```
მოსალოდნელი პასუხი:
```json
{"status":"ok","message":"Game server is running"}
```

### 4. შეამოწმე Frontend
გახსენი ბრაუზერში: `https://spermiobeta.xyz`

### 5. WebSocket ტესტი
ბრაუზერის Console-ში:
```javascript
const ws = new WebSocket('wss://game.spermiobeta.xyz/socket.io/?EIO=4&transport=websocket');
ws.onopen = () => console.log('✅ WebSocket Connected!');
ws.onerror = (e) => console.error('❌ WebSocket Error:', e);
```

---

## 🚨 Troubleshooting

### პრობლემა: "502 Bad Gateway"
**გადაწყვეტა:**
1. შეამოწმე logs: Coolify → Service → Logs
2. დარწმუნდი რომ port სწორია
3. გადატვირთე სერვისი

### პრობლემა: "WebSocket Connection Failed"
**გადაწყვეტა:**
1. Cloudflare Proxy გათიშე game subdomain-ზე
2. შეამოწმე რომ WebSocket enabled არის Coolify-ში
3. შეამოწმე CORS settings

### პრობლემა: "Database Connection Error"
**გადაწყვეტა:**
1. შეამოწმე DB_HOST (უნდა იყოს container name: `spermio-postgres`)
2. შეამოწმე DB_PASSWORD
3. შეამოწმე რომ PostgreSQL running არის

### პრობლემა: "Build Failed"
**გადაწყვეტა:**
1. შეამოწმე Dockerfile path
2. შეამოწმე Build logs
3. დარწმუნდი რომ ყველა ფაილი git-ში არის

---

## 📊 მონიტორინგი (50 Users Target)

### Resource Limits (Coolify Settings):
| Service | CPU | Memory |
|---------|-----|--------|
| PostgreSQL | 1 core | 1GB |
| Redis | 0.5 core | 512MB |
| API Server | 1 core | 1GB |
| Game Server | 1 core | 2GB |
| Frontend | 0.5 core | 512MB |
| **Total** | **4 cores** | **5GB** |

შენ გაქვს 8GB RAM, ასე რომ 3GB რჩება OS-ისთვის და buffer-ისთვის ✅

---

## 🎉 დასრულება

თუ ყველაფერი სწორად გააკეთე:
1. ✅ https://spermiobeta.xyz - მთავარი საიტი
2. ✅ https://api.spermiobeta.xyz - API
3. ✅ https://game.spermiobeta.xyz - Game Server (WebSocket)
4. ✅ PostgreSQL და Redis - ლოკალურად სერვერზე

---

## 📞 დახმარება

თუ პრობლემა გაქვს:
1. შეამოწმე Coolify Logs
2. შეამოწმე Docker container logs
3. გადატვირთე სერვისი

**Good luck! 🎮**
