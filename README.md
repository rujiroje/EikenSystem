# Eikensystem

ระบบ Eiken Weight System (สรุปจาก `EikenDetail.doc`)

ภาษา/เทคโนโลยีเป้าหมายตามสเปค:
- Backend: Java + Spring (จะพัฒนาเต็มในขั้นถัดไป)
- Frontend: React
- Database: SQL Server

เพื่อเริ่มงานได้เร็วบนเครื่องปัจจุบัน (มี Node.js แต่ยังไม่มี Maven/Gradle/.NET/SQL Server): โปรเจกต์นี้ตั้งสเคเลตันดังนี้
- frontend: React + Vite + TypeScript พร้อมหน้า Login และ Measurement Entry
- backend: Node.js + Express (TypeScript) mock API ชุดแรก (Auth, Product, Measurement Classifier)
- backend (ชั่วคราว): Node.js + Express (TypeScript) mock API ชุดแรก (Auth, Product, Measurement Classifier)
- backend (หลัก): Spring Boot + Java 17 (จะค่อย ๆ ย้ายการทำงานหลักมาที่นี่และเชื่อมต่อ MS SQL Server ตามสเปค)

## โครงสร้าง
```
Eikensystem/
  backend/            # Express + TS (mock API ชั่วคราว)
  backend-spring/     # Spring Boot (Java 17) เชื่อมต่อ MS SQL Server
  frontend/           # React + Vite + TS
  EikenDetail.doc     # เอกสารสเปคต้นฉบับ
  EikenDetail.txt     # ข้อความที่ถอดจาก .doc เพื่ออ้างอิง
  README.md
  .gitignore
  .env.example        # ตัวอย่างตัวแปรแวดล้อม
  docker-compose.yml  # (ตัวเลือก) SQL Server dev container
```

## สรุปความต้องการ (ย่อ)
- ตารางหลัก: Product, Measurement, ChangeLog, CleaningLog, StandardWeightLog, Users, Notifications, Scale
- การคำนวณ: StandardWeight = WeightPerPiece * Qty; Min/Max = StandardWeight ± (WeightPerPiece/2); DMin/DMax = StandardWeight ± Tolerance
- การจัดกลุ่มผลชั่ง: Green (ในช่วง DMin..DMax), Yellow (ขอบ), Red (นอก Min/Max)
- Yellow Count และเงื่อนไข lock/อนุมัติจาก Leader/QA
- Role: Operator, Leader, QA
- ฟังก์ชัน: Auth, Data Mgmt, Approval, Reporting, Notification, Session Mgmt

รายละเอียดเต็มอยู่ใน `EikenDetail.txt` (แปลงจากเอกสารเดิมเพื่ออ่านสะดวก)

## เริ่มต้นใช้งาน (Windows PowerShell)
1) ติดตั้ง dependencies
```
# Backend
cd backend
npm install

# Frontend
cd ../frontend
npm install
```

2) รันทั้งสองส่วน (เปิด 2 terminal)
```
# Terminal 1 - Backend
cd backend
npm run dev

# Terminal 2 - Frontend
cd frontend
npm run dev
```
4) รัน Spring Boot Backend (เมื่อพร้อม)
- เครื่องนี้มี Java 17 แล้ว แต่ยังไม่มี Maven/Gradle ติดตั้ง หากสะดวกให้ติดตั้ง Maven ก่อน หรือใช้ IDE ที่มีตัวรัน Spring Boot ในตัว
```powershell
cd "backend-spring"
# ถ้ามี Maven
mvn spring-boot:run
# หรือถ้าใช้ VS Code กับ Spring Boot Extension ให้กด Run จากแถบ Spring Boot Dashboard
```
ค่าเชื่อมต่อ DB ตั้งค่าไว้สำหรับเซิร์ฟเวอร์ MS SQL `10.1.53.32` โดยอ่านค่าจาก Environment Variables เพื่อไม่ต้องเก็บรหัสผ่านลงไฟล์
 - Backend dev (Node mock): http://localhost:8080
 - Backend default port changed to 8090 (configurable via application.yml). Frontend now uses a central API base helper (`src/api.ts`) with `VITE_API_BASE` env var; set `.env.development`:
 ```
 VITE_API_BASE=http://localhost:8090
 ```
 If you revert backend port to 8081, just update the env var—no code edits needed.

3) (ตัวเลือก) ใช้ SQL Server แบบ container
- ต้องมี Docker Desktop ติดตั้งก่อน
cd ..
docker compose up -d
```
ปรับ `.env` ตาม `.env.example` แล้วแก้การเชื่อมต่อใน backend ภายหลังเมื่อสลับเป็น Spring Boot

## ขั้นถัดไป
- สร้าง Spring Boot backend (Maven Wrapper) ให้ครบ entity/service/controller ตามสเปค และย้าย logic classifier จาก mock API
- เชื่อมต่อ SQL Server จริง พร้อม migration และ seed
- เพิ่ม auth จริง (JWT/Session) และ Role-based Access Control
- เขียนเทสต์ service/คำนวณ และหน้า UI เพิ่มเติม (CleaningLog, Approval Flow, Reports)
