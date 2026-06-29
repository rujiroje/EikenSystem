# Eikensystem — แผนการ Deploy ขึ้น Server (Production)

> เอกสารนี้เป็น **คู่มือการนำระบบขึ้น Production Server**
> Base version: commit `777aada` (main branch)
> วันที่: 2026-06-24

---

## สารบัญ

1. [ภาพรวม Infrastructure](#1-ภาพรวม-infrastructure)
2. [Pre-deployment Checklist](#2-pre-deployment-checklist)
3. [Phase A: Server Preparation](#3-phase-a-server-preparation)
4. [Phase B: Database Setup](#4-phase-b-database-setup)
5. [Phase C: Backend Deployment](#5-phase-c-backend-deployment)
6. [Phase D: Frontend Deployment](#6-phase-d-frontend-deployment)
7. [Phase E: KiosBioAgent (Client PC)](#7-phase-e-kiosbioagent-client-pc)
8. [Phase F: SSL / HTTPS](#8-phase-f-ssl--https)
9. [Phase G: Smoke Test หลัง Deploy](#9-phase-g-smoke-test-หลัง-deploy)
10. [Backup & Recovery Strategy](#10-backup--recovery-strategy)
11. [Monitoring & Alerting](#11-monitoring--alerting)
12. [Rollback Plan](#12-rollback-plan)
13. [Day-2 Operations](#13-day-2-operations)

---

## 1. ภาพรวม Infrastructure

```
┌─────────────────────────────────────────────────────────────┐
│  Operator PC (Windows)                                       │
│  ┌────────────────┐         ┌──────────────────────────┐   │
│  │ Browser        │ HTTPS   │ KiosBioAgent (.NET)     │   │
│  │ (Eikensystem) │ ←→port  │ DigitalPersona SDK      │   │
│  └───────┬────────┘  5001   └──────────────────────────┘   │
└─────────┬─────────────────────────────────────────────────┘
          │ HTTPS (443)
          ▼
┌─────────────────────────────────────────────────────────────┐
│  Eikensystem Server (Linux Ubuntu/RHEL หรือ Windows Server) │
│  ┌────────────┐   ┌──────────────┐   ┌──────────────────┐ │
│  │ nginx      │ ↔ │ Spring Boot  │ ↔ │ SQL Server 2022  │ │
│  │ (443/80)   │   │ (8090)       │   │ (1433)           │ │
│  └────────────┘   └──────────────┘   └──────────────────┘ │
│  ↑                                                          │
│  Frontend Static                                            │
│  (React build)                                              │
└─────────────────────────────────────────────────────────────┘
```

**Components:**
- **nginx** — reverse proxy + serve frontend static files
- **Spring Boot Backend** — Java 21 + JJWT + Yubico WebAuthn
- **MS SQL Server 2022** — main database
- **KiosBioAgent** — .NET app บน Operator PC สำหรับเครื่องสแกนลายนิ้วมือ

**Network ports ที่ต้องเปิด:**
| Port | Service | Direction |
|------|---------|-----------|
| 443 | nginx (HTTPS) | Client → Server |
| 80 | nginx (HTTP redirect) | Client → Server |
| 1433 | SQL Server | Server internal |
| 8090 | Spring Boot | Server internal |
| 5001 | KiosBioAgent | Browser → Local PC (HTTPS, self-signed) |

---

## 2. Pre-deployment Checklist

### 2.1 ข้อตกลงกับทีม
- [ ] **Maintenance window** — แจ้งวันเวลา deploy ล่วงหน้า ≥3 วัน
- [ ] **Rollback plan** — ทุกคนรู้ว่าใครรับผิดชอบถ้า deploy ล้มเหลว
- [ ] **Contact list** — เบอร์โทร DBA, DevOps, Lead Developer, QA Lead

### 2.2 เอกสารที่ต้องมี
- [ ] `SYSTEM_DOCUMENTATION.md` (Database schema, API spec)
- [ ] `MANUAL.md` (User manual)
- [ ] `WORKFLOW.md` (Process diagrams)
- [ ] `db-migration/*.sql` (Migration scripts)
- [ ] Production credentials (DB password, JWT secret) — เก็บใน password manager

### 2.3 ฮาร์ดแวร์ขั้นต่ำที่แนะนำ

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **CPU** | 4 cores | 8 cores |
| **RAM** | 8 GB | 16 GB |
| **Disk** | 100 GB SSD | 500 GB SSD |
| **Network** | 100 Mbps | 1 Gbps |
| **OS** | Ubuntu 22.04 LTS / RHEL 9 / Windows Server 2022 | เหมือนกัน |

### 2.4 Software Prerequisites
- [ ] Docker 24+ + docker-compose v2
- [ ] Java 21 (OpenJDK / Eclipse Temurin)
- [ ] Maven 3.9+ (สำหรับ build) หรือใช้ `mvnw` wrapper
- [ ] Node.js 20+ + npm 10+ (สำหรับ build frontend)
- [ ] Git
- [ ] OpenSSL (สำหรับสร้าง SSL cert)

---

## 3. Phase A: Server Preparation

### 3.1 ติดตั้ง Dependencies (Ubuntu 22.04 ตัวอย่าง)

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Java 21
sudo apt install -y openjdk-21-jdk
java -version    # ตรวจสอบ

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install -y nodejs
node -v && npm -v

# Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker

# Git
sudo apt install -y git
```

### 3.2 สร้าง user สำหรับ application (security best practice)

```bash
sudo useradd -m -s /bin/bash eiken
sudo usermod -aG docker eiken
sudo passwd eiken
```

### 3.3 สร้าง directory structure

```bash
sudo mkdir -p /opt/eiken/{app,data,logs,backup,ssl}
sudo chown -R eiken:eiken /opt/eiken
```

### 3.4 Clone repository

```bash
su - eiken
cd /opt/eiken/app
git clone https://github.com/rujiroje/EikenSystem.git .
git checkout main
git pull origin main
```

### 3.5 Firewall

```bash
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 80/tcp     # HTTP (redirect)
sudo ufw allow 443/tcp    # HTTPS
sudo ufw enable
```

---

## 4. Phase B: Database Setup

### 4.1 รัน SQL Server ด้วย Docker

```bash
cd /opt/eiken/app

# สร้าง .env file สำหรับ production
cat > .env <<'EOF'
DB_PASS=<STRONG_PASSWORD_AT_LEAST_16_CHARS_HERE>
JWT_SECRET=<RANDOM_64_BYTE_BASE64_STRING>
DB_NAME=eikensystem
DB_USER=sa
EOF

chmod 600 .env

# Start MS SQL container
docker compose --env-file .env up -d mssql

# รอ 30 วินาทีให้ DB พร้อม
sleep 30
docker logs eiken-mssql | tail -10
```

### 4.2 สร้าง database + schema

```bash
# Connect ด้วย sqlcmd
docker exec -it eiken-mssql /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "$(grep DB_PASS .env | cut -d= -f2)" -C \
  -Q "CREATE DATABASE eikensystem;"
```

### 4.3 รัน migration scripts (ตามลำดับ)

```bash
cd /opt/eiken/app/db-migration

# ลำดับ migration (ตามชื่อไฟล์ V001, V002, ...)
for f in $(ls V*.sql | sort); do
  echo "Running $f..."
  docker exec -i eiken-mssql /opt/mssql-tools18/bin/sqlcmd \
    -S localhost -U sa -P "$DB_PASS" -C -d eikensystem < $f
done
```

> ⚠️ **สำคัญ:** ถ้าใช้ Flyway/Liquibase ใน Spring Boot — ข้ามขั้น 4.3 และให้ Spring Boot run migration ตอน startup แทน

### 4.4 สร้าง user สำหรับ application (ไม่ใช่ sa)

```sql
USE eikensystem;
CREATE LOGIN eiken_app WITH PASSWORD = 'AnotherStrongPasswordHere!2026';
CREATE USER eiken_app FOR LOGIN eiken_app;
ALTER ROLE db_datareader ADD MEMBER eiken_app;
ALTER ROLE db_datawriter ADD MEMBER eiken_app;
ALTER ROLE db_ddladmin ADD MEMBER eiken_app;  -- ถ้าใช้ JPA ddl-auto
```

### 4.5 Seed initial data

```bash
# DataInitializer (Spring Boot) จะ seed ตอนรันครั้งแรก (profile dev เท่านั้น)
# Production ต้อง seed manually:
# - Admin user (เปลี่ยน password ทันที)
# - DataAdmin user
# - QA users (อย่างน้อย 2 คน)
# - Leader users
# - Products (import จาก CSV)
# - Scales / Machines
# - Sorting Reasons (master data)
# - Outer Approver mapping
```

ใช้ admin endpoint หรือ direct SQL insert:
```sql
INSERT INTO users (username, password_hash, role, first_name, last_name, active)
VALUES ('admin', '<bcrypt_hash>', 'ADMIN', 'System', 'Admin', 1);
```

> 🔐 รหัสผ่านต้อง bcrypt hash (cost 12)

---

## 5. Phase C: Backend Deployment

### 5.1 Build Spring Boot Backend

```bash
cd /opt/eiken/app/backend-spring

# Build
./mvnw clean package -DskipTests
# Output: target/eikensystem-*.jar

ls -lh target/*.jar
```

### 5.2 สร้าง systemd service

```bash
sudo tee /etc/systemd/system/eiken-backend.service > /dev/null <<'EOF'
[Unit]
Description=Eikensystem Backend (Spring Boot)
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=eiken
Group=eiken
WorkingDirectory=/opt/eiken/app/backend-spring
Environment="SPRING_PROFILES_ACTIVE=prod"
EnvironmentFile=/opt/eiken/app/.env
ExecStart=/usr/bin/java -Xms512m -Xmx2g \
  -Dspring.datasource.url=jdbc:sqlserver://localhost:1433;databaseName=eikensystem;encrypt=false \
  -Dspring.datasource.username=eiken_app \
  -Dspring.datasource.password=${DB_APP_PASS} \
  -Dapp.jwt.secret=${JWT_SECRET} \
  -jar /opt/eiken/app/backend-spring/target/eikensystem-0.1.0.jar
Restart=on-failure
RestartSec=10
StandardOutput=append:/opt/eiken/logs/backend.log
StandardError=append:/opt/eiken/logs/backend-error.log

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable eiken-backend
sudo systemctl start eiken-backend

# ตรวจสอบ
sudo systemctl status eiken-backend
tail -f /opt/eiken/logs/backend.log
```

### 5.3 ตรวจสอบ Backend ทำงาน

```bash
curl http://localhost:8090/api/health
# Expected: {"status":"UP"}
```

### 5.4 ตั้งค่า log rotation

```bash
sudo tee /etc/logrotate.d/eiken-backend > /dev/null <<'EOF'
/opt/eiken/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    missingok
    create 0640 eiken eiken
    sharedscripts
    postrotate
        systemctl reload eiken-backend > /dev/null 2>&1 || true
    endscript
}
EOF
```

---

## 6. Phase D: Frontend Deployment

### 6.1 สร้าง .env.production

```bash
cd /opt/eiken/app/frontend
cat > .env.production <<EOF
VITE_API_BASE=https://eiken.yourcompany.com/api
EOF
```

> เปลี่ยน URL ให้ตรงกับ domain ของคุณ

### 6.2 Build

```bash
npm ci                 # ติดตั้ง dependencies (ใช้ package-lock.json)
npm run build         # output → dist/
ls -lh dist/
```

### 6.3 Start nginx ด้วย Docker

```bash
cd /opt/eiken/app

# ตรวจสอบ nginx.conf
cat nginx/nginx.conf

# Run nginx
docker compose --env-file .env up -d nginx

# ตรวจสอบ
docker ps | grep nginx
curl -k https://localhost
```

---

## 7. Phase E: KiosBioAgent (Client PC)

### 7.1 Build (one-time, ทำที่เครื่อง dev)

```cmd
cd KiosAgent\KiosBioAgent
dotnet publish -c Release -r win-x64 --self-contained=true -o publish
```

### 7.2 ติดตั้งที่ Operator PC แต่ละเครื่อง

1. Copy folder `publish\` ไปวางที่ `C:\Program Files\Eiken\KiosBioAgent\`
2. ติดตั้ง **DigitalPersona SDK driver** (จาก vendor)
3. ตั้ง **Auto-start at login**:
   - กด Win+R → `shell:startup`
   - สร้าง shortcut ไปยัง `KiosBioAgent.exe`
4. ทดสอบ:
   - เปิด browser → `https://localhost:5001/health`
   - ต้องได้: `{"ok":true,"service":"KioskBioAgent","deviceStatus":"Ready"}`
   - หากเป็น "Not Ready" — เครื่องอ่านลายนิ้วมือไม่ต่อ

### 7.3 ตั้งค่า certificate trust

KiosBioAgent ใช้ self-signed cert บน localhost:5001 → browser ต้องเชื่อใจ
- Chrome/Edge: เข้า `https://localhost:5001` ครั้งแรก แล้วกด "Advanced → Proceed"
- หรือ install certificate ผ่าน Group Policy (ฝั่ง IT)

---

## 8. Phase F: SSL / HTTPS

### 8.1 ใช้ Let's Encrypt (ฟรี)

```bash
# ติดตั้ง certbot
sudo apt install -y certbot

# หยุด nginx ชั่วคราว
docker compose down nginx

# ขอ certificate (standalone mode)
sudo certbot certonly --standalone \
  -d eiken.yourcompany.com \
  --email admin@yourcompany.com \
  --agree-tos --no-eff-email

# Copy cert ไปที่ที่ nginx อ่าน
sudo cp /etc/letsencrypt/live/eiken.yourcompany.com/fullchain.pem /opt/eiken/app/nginx/ssl/
sudo cp /etc/letsencrypt/live/eiken.yourcompany.com/privkey.pem /opt/eiken/app/nginx/ssl/
sudo chown eiken:eiken /opt/eiken/app/nginx/ssl/*

# Restart nginx
docker compose --env-file .env up -d nginx
```

### 8.2 Auto-renew cert

```bash
sudo crontab -e
# เพิ่มบรรทัด:
0 3 * * * certbot renew --quiet --deploy-hook "cp /etc/letsencrypt/live/eiken.yourcompany.com/*.pem /opt/eiken/app/nginx/ssl/ && docker compose -f /opt/eiken/app/docker-compose.yml restart nginx"
```

### 8.3 ใช้ Internal CA (ถ้าระบบอยู่ใน intranet)

```bash
cd /opt/eiken/app/nginx
./generate-ssl.sh
# จะสร้าง self-signed cert สำหรับ internal use
```

> ⚠️ ถ้าใช้ self-signed → ต้อง install root CA ทุก client PC

---

## 9. Phase G: Smoke Test หลัง Deploy

> รัน checklist นี้ทันทีหลัง deploy เสร็จ ก่อนเปิดให้ user ใช้งานจริง

### 9.1 Backend Health
- [ ] `curl https://eiken.yourcompany.com/api/health` → 200 OK
- [ ] DB connection OK (ดู log ของ backend)
- [ ] JWT secret loaded (ไม่ใช่ default)

### 9.2 Authentication
- [ ] Login ด้วย admin/admin → ได้ token
- [ ] **เปลี่ยน password admin ทันที**

### 9.3 หน้าหลัก
- [ ] เปิด https://eiken.yourcompany.com → load หน้า Login ได้
- [ ] Login → เห็นเมนูตาม Role
- [ ] Logout ทำงาน

### 9.4 ตรวจ Endpoint สำคัญ
- [ ] `GET /api/products` (DataAdmin) → return list
- [ ] `GET /api/work-orders` (Leader) → return list
- [ ] `GET /api/approvals/leader-pending` (Leader)
- [ ] `GET /api/approvals/qa-pending` (QA)
- [ ] `GET /api/sorting-reasons?scope=BOTH` → return list

### 9.5 KiosBioAgent (จาก Operator PC)
- [ ] เปิด browser → `https://localhost:5001/health` → 200
- [ ] เปิด https://eiken.yourcompany.com → ตรวจ "สถานะเครื่องอ่าน" สีเขียว

### 9.6 ทดสอบ End-to-end flow
- [ ] Leader สร้าง WO ใหม่ → สำเร็จ
- [ ] Operator เลือก WO → ชั่ง 1 กล่อง → save → status GREEN
- [ ] ดูใน Leader Dashboard → เห็น measurement
- [ ] ทดสอบ Sorting → dropdown reason → save → ChangeLog เก็บ

---

## 10. Backup & Recovery Strategy

### 10.1 Database Backup

```bash
# Daily full backup (cronjob)
sudo crontab -e
# เพิ่มบรรทัด:
0 2 * * * docker exec eiken-mssql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$DB_PASS" -C -Q "BACKUP DATABASE eikensystem TO DISK = '/var/opt/mssql/data/eiken-$(date +\%Y\%m\%d).bak' WITH FORMAT, COMPRESSION;"

# Copy backup ออกจาก container ไป external storage
30 2 * * * docker cp eiken-mssql:/var/opt/mssql/data/eiken-$(date +\%Y\%m\%d).bak /opt/eiken/backup/
```

### 10.2 Retention
- Daily backup: เก็บ 30 วัน
- Weekly backup: เก็บ 12 สัปดาห์
- Monthly backup: เก็บ 12 เดือน
- พิจารณา offsite backup (S3, Azure Blob, NAS อื่น)

### 10.3 Restore test (ทำทุกเดือน)
- [ ] Restore backup ไป test DB
- [ ] รัน Spring Boot ชี้ไป test DB → ตรวจ data ครบไหม
- [ ] ทดสอบ login + ชั่ง 1 กล่อง

---

## 11. Monitoring & Alerting

### 11.1 ระดับขั้นต่ำ
- [ ] Disk space alert (> 80%)
- [ ] Memory alert (> 85%)
- [ ] Backend service down (systemd notify)
- [ ] DB connection failure

### 11.2 เครื่องมือที่แนะนำ
- **Prometheus + Grafana** — metrics + dashboard
- **Loki / ELK** — log aggregation
- **Uptime Robot / Healthchecks.io** — external uptime monitoring
- **Spring Boot Actuator** — `/actuator/health`, `/actuator/metrics`

### 11.3 KPI ที่ต้อง monitor
| Metric | Threshold | Action |
|--------|-----------|--------|
| API response time | < 500ms (p95) | Investigate ถ้าเกิน |
| Login success rate | > 99% | Alert ถ้าต่ำกว่า |
| Active WO count | — | ดู trend |
| DB connection pool | < 80% used | Tune ถ้าเกิน |
| Disk free | > 20% | Cleanup logs/backup เก่า |

---

## 12. Rollback Plan

### 12.1 เงื่อนไขที่ต้อง Rollback
- ❌ Smoke test ไม่ผ่าน
- ❌ Critical bug พบใน 1 ชั่วโมงแรก
- ❌ Performance ตกมากกว่า 3x
- ❌ User report ปัญหา > 5 raids ใน 1 ชั่วโมง

### 12.2 ขั้นตอน Rollback (target: < 15 นาที)

```bash
# 1. หยุด backend ปัจจุบัน
sudo systemctl stop eiken-backend

# 2. Restore DB (ถ้ามี schema change)
docker exec -i eiken-mssql /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "$DB_PASS" -C \
  -Q "RESTORE DATABASE eikensystem FROM DISK='/var/opt/mssql/data/eiken-pre-deploy.bak' WITH REPLACE"

# 3. Git checkout commit ก่อนหน้า
cd /opt/eiken/app
git fetch
git checkout <PREVIOUS_GOOD_COMMIT>

# 4. Rebuild
cd backend-spring && ./mvnw clean package -DskipTests
cd ../frontend && npm ci && npm run build

# 5. Restart services
sudo systemctl start eiken-backend
docker compose restart nginx

# 6. Smoke test อีกครั้ง
```

### 12.3 Pre-deploy snapshot
**ก่อน deploy ใหม่ทุกครั้ง ทำ snapshot:**
```bash
# Full DB backup
docker exec eiken-mssql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$DB_PASS" -C \
  -Q "BACKUP DATABASE eikensystem TO DISK = '/var/opt/mssql/data/eiken-pre-deploy.bak' WITH FORMAT"

# Tag git commit
cd /opt/eiken/app
git tag -a "pre-deploy-$(date +%Y%m%d-%H%M)" -m "Snapshot before deploy"
git push --tags
```

---

## 13. Day-2 Operations

### 13.1 Update procedure
```bash
# ทุกครั้งที่ update:
cd /opt/eiken/app
git fetch && git pull origin main
cd backend-spring && ./mvnw clean package -DskipTests
sudo systemctl restart eiken-backend
cd ../frontend && npm ci && npm run build
# nginx serve dist อัตโนมัติ — ไม่ต้อง restart
```

### 13.2 ตรวจ log
```bash
# Backend
tail -f /opt/eiken/logs/backend.log

# nginx
docker logs -f eiken-nginx

# SQL Server
docker logs -f eiken-mssql
```

### 13.3 User management
- เพิ่ม user ใหม่ → DataAdmin ใช้หน้า "Admin: Master Data → Users"
- Reset password → DataAdmin
- Disable user → ปุ่ม "ปิดใช้งาน" (ไม่ลบ — เก็บ audit)

### 13.4 Master data updates
- เพิ่ม Product → ProductsAdmin → กรอก outerApproverRole + outerApproverNote
- เพิ่ม Sorting Reason → SortingReasonsAdmin
- เพิ่ม Scale / Machine → ScalesAdmin / MachinesAdmin

---

## ภาคผนวก: ไฟล์ environment ที่สำคัญ

### `.env` (production)
```bash
DB_PASS=<sa_password_for_docker>
DB_APP_PASS=<eiken_app_password>
JWT_SECRET=<random_base64_64bytes>
FRONTEND_ORIGIN=https://eiken.yourcompany.com
```

### `application-prod.yml` (Backend)
```yaml
spring:
  datasource:
    url: jdbc:sqlserver://localhost:1433;databaseName=eikensystem;encrypt=false
    username: ${DB_USER:eiken_app}
    password: ${DB_PASSWORD}
  jpa:
    hibernate:
      ddl-auto: validate    # ห้าม update ใน prod!
    show-sql: false
server:
  port: 8090
app:
  jwt:
    secret: ${JWT_SECRET}
    expiration-ms: 3600000   # 1 hour
  cors:
    allowed-origins: ${FRONTEND_ORIGIN}
logging:
  level:
    root: INFO
    com.example.eikensystem: INFO
  file:
    name: /opt/eiken/logs/backend.log
```

---

## 🚦 Go / No-Go Decision

**ก่อนเปิดให้ user ใช้งานจริง:**

✅ **GO** ถ้า:
- ทุก Smoke Test ผ่าน
- DB backup ทำงาน
- Monitoring ทำงาน
- User Acceptance Test (ดู `TEST_PLAN.md`) ผ่าน ≥95%

⛔ **NO-GO** ถ้า:
- Critical bug ที่ blocking workflow ใด workflow หนึ่ง
- Performance ต่ำกว่าเกณฑ์ (response time > 2s)
- Security finding ที่ยังไม่ได้แก้
- ขาด backup/rollback plan
