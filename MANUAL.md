# Eikensystem — คู่มือการใช้งาน (User Manual)

> เอกสารนี้เป็น **คู่มือผู้ใช้** แบบทำตามได้ทีละขั้น
> สำหรับ flow เชิงเทคนิค (sequence/state diagram) ดูที่ `WORKFLOW.md`
> สำหรับการติดตั้ง/dev setup ดูที่ `README.md`

---

## สารบัญ

1. [ภาพรวมระบบ](#1-ภาพรวมระบบ)
2. [Role และสิทธิ์การใช้งาน](#2-role-และสิทธิ์การใช้งาน)
3. [การเข้าสู่ระบบ](#3-การเข้าสู่ระบบ)
4. [คู่มือสำหรับ Operator](#4-คู่มือสำหรับ-operator)
5. [คู่มือสำหรับ Leader](#5-คู่มือสำหรับ-leader)
6. [คู่มือสำหรับ QA](#6-คู่มือสำหรับ-qa)
7. [คู่มือสำหรับ Data Admin](#7-คู่มือสำหรับ-data-admin)
8. [การจัดการบัญชี (ทุก Role)](#8-การจัดการบัญชี-ทุก-role)
9. [คำถามที่พบบ่อย / Troubleshooting](#9-คำถามที่พบบ่อย--troubleshooting)
10. [คำศัพท์ที่ควรรู้](#10-คำศัพท์ที่ควรรู้)

---

## 1. ภาพรวมระบบ

Eikensystem เป็นระบบควบคุมการชั่งน้ำหนัก (Weight Inspection) สำหรับสายการผลิต
แบ่งกล่องเป็น 3 สี ตามผลการชั่ง:

| สี | ความหมาย | สิ่งที่ต้องทำ |
|----|----------|---------------|
| 🟢 GREEN | น้ำหนักอยู่ในเกณฑ์มาตรฐาน | บันทึก → ชั่งกล่องถัดไป |
| 🟡 YELLOW | เกินช่วง tolerance แต่ยังอยู่ในช่วง half-piece | บันทึก + นับ streak (สะสม 5 ครั้ง → ล็อกรอ QA) |
| 🔴 RED | น้ำหนักนอกช่วง half-piece | ล็อกกล่อง รอ Leader อนุมัติ → ชั่งซ้ำ |

**องค์ประกอบของระบบ:**
- **Frontend** (React) — หน้าจอใช้งานผ่าน browser
- **Backend** (Spring Boot) — ตัวประมวลผลหลัก เชื่อม SQL Server
- **KiosBioAgent** (โปรแกรมบน PC) — ตัวกลางสำหรับเครื่องอ่านลายนิ้วมือ DigitalPersona
- **WebAuthn** — สำหรับ tablet ที่มี fingerprint sensor ในตัว

---

## 2. Role และสิทธิ์การใช้งาน

| Role | เมนูที่เห็น | หน้าที่หลัก |
|------|------------|-------------|
| **OPERATOR** | ชั่งน้ำหนัก / Sorting | ชั่งกล่อง, ขอ Cleaning Check, ส่ง Outer Inspection, ขอเปลี่ยน Std |
| **LEADER** | Leader Dashboard / Work Order / รายงาน WO | สร้าง WO, อนุมัติ RED / Cleaning, ปิด WO |
| **QA** | QA Dashboard / รายงาน WO | อนุมัติ Std change, ตรวจ Outer Inspection |
| **DATA_ADMIN / ADMIN** | Admin: Master Data | จัดการ User / Product / Scale / Std Log |

> Role ของแต่ละ User กำหนดโดย Admin (ดูข้อ 7)

---

## 3. การเข้าสู่ระบบ

### 3.1 เข้าสู่ระบบด้วย Username + Password
1. เปิด browser ไปที่ URL ของระบบ
2. กรอก **Username** และ **Password**
3. กดปุ่ม **เข้าสู่ระบบ**

### 3.2 เข้าสู่ระบบด้วยลายนิ้วมือ (PC + DigitalPersona)
**เงื่อนไข:** ต้องเปิดโปรแกรม **KiosBioAgent** ค้างไว้บนเครื่อง (ตรวจสอบที่ taskbar)

1. กดปุ่ม **Login with Biometric**
2. รอข้อความ "วางนิ้วบนเครื่องอ่าน"
3. วางนิ้วที่ลงทะเบียนไว้บนเครื่องอ่าน DigitalPersona
4. ระบบจะ Login อัตโนมัติเมื่อจับคู่ได้

### 3.3 เข้าสู่ระบบด้วยลายนิ้วมือ (Tablet — WebAuthn)
**เงื่อนไข:** Tablet ต้องมี fingerprint sensor และเคยลงทะเบียนแล้ว

1. กดปุ่ม **เข้าสู่ระบบด้วยลายนิ้วมือ Tablet**
2. แตะ sensor บน tablet (เช่น Touch ID / ปุ่ม Home)

### 3.4 Session หมดอายุ
- ก่อนหมดอายุ **5 นาที** ระบบจะแจ้งเตือนพร้อมปุ่ม **"ต่อ Session"**
- ถ้าหมดอายุแล้วจะถูก logout อัตโนมัติ ต้อง login ใหม่

---

## 4. คู่มือสำหรับ Operator

### 4.1 ก่อนเริ่มชั่ง
1. Login เข้าระบบ → ระบบจะเข้าหน้า **"ชั่งน้ำหนัก"** อัตโนมัติ
2. เลือก **Work Order (WO)** ที่สถานะ `ACTIVE` จาก dropdown
   - ถ้าไม่มี WO ในรายการ → แจ้ง Leader ให้สร้าง WO ก่อน
3. กรอกชื่อ **Operator** ทุกคนที่ทำงานในกะนี้
4. ตรวจสอบข้อมูล Product, Scale, Lot No. ให้ถูกต้อง

### 4.2 ชั่งกล่อง (Normal Flow)
1. **สแกน barcode** บนกล่อง Inner → ระบบกรอก Outer/Inner ให้อัตโนมัติ
2. **วางกล่องบนเครื่องชั่ง** → ระบบอ่านน้ำหนัก
3. กดปุ่ม **บันทึก**
4. ดูสีผลลัพธ์:
   - 🟢 **GREEN** → ชั่งกล่องถัดไปต่อได้เลย
   - 🟡 **YELLOW** → ดู streak counter ที่มุมจอ (ครบ 5 จะล็อก)
   - 🔴 **RED** → ระบบล็อก → ดู §4.3

### 4.3 เมื่อกล่อง RED
1. ระบบแสดงข้อความ "รอ Leader อนุมัติ"
2. แจ้ง Leader ทาง Dashboard (มี badge แจ้งอัตโนมัติ)
3. **รอ Leader กดอนุมัติ** + ระบุเหตุผล
4. เมื่อ approved → กด **ชั่งซ้ำ (Reweigh)** บนกล่องเดิม
5. ระบบบันทึก ChangeLog (audit trail) อัตโนมัติ
6. ชั่งกล่องถัดไปได้ปกติ

### 4.4 เมื่อ Yellow Streak ครบ 5
1. ที่ Yellow #3-4 ระบบจะแสดงคำเตือน
2. Yellow #5 → ระบบ **ล็อก** ไม่ให้ชั่งต่อ
3. กด **สร้างคำขอเปลี่ยน Std (STD_CHANGE_REQUEST)**
4. รอ QA ตรวจสอบและกด **Allow 4&5**
5. ระบบปลดล็อก → ชั่งกล่องที่ 4 และ 5 (รวม 5 ค่า)
6. กด **ส่ง Proposal** (ระบบเสนอ Std ใหม่จากค่าเฉลี่ย)
7. รอ QA กด **Apply Std**
8. ระบบสร้าง Barrier Measurement → reset streak เป็น 0 → ชั่งต่อปกติ

### 4.5 Cleaning Check (ทุก 1 ชั่วโมง)
1. เมื่อครบ 1 ชม. ระบบเตือนให้ขอ Cleaning Check
2. กดปุ่ม **ขอ Cleaning Check**
3. รอ Leader อนุมัติ (status: PENDING → APPROVED)
4. ทำความสะอาดเครื่องชั่งตามขั้นตอน
5. ชั่งต่อได้

### 4.6 Outer Inspection (เมื่อกล่อง Outer เต็ม)
1. ระบบแจ้งเมื่อกล่อง Outer เต็ม capacity
2. กดปุ่ม **ส่ง Outer Inspection**
3. **ชั่งกล่อง Outer ถัดไปต่อได้เลย** (ไม่ต้องรอ)
4. QA จะตรวจสอบและ approve ภายหลัง

### 4.7 หน้า Sorting (เมื่อ WO เป็น SORTING)
> Leader จะเปลี่ยน WO เป็น SORTING เมื่อจบการผลิต

1. เปิดเมนู **Sorting**
2. ดูรายการกล่องทั้งหมดใน Lot
3. หากพบกล่องอยู่ผิดตำแหน่ง → กด **Relocate** เพื่อย้าย Outer/Inner
4. หากต้องชั่งซ้ำ → กด **Reweigh** (ต้องมี Leader approval ก่อน)
5. การเปลี่ยนแปลงทุกครั้งบันทึก ChangeLog อัตโนมัติ

---

## 5. คู่มือสำหรับ Leader

### 5.1 สร้าง Work Order (ก่อนเริ่มกะ)
1. เปิดเมนู **Work Order**
2. กด **+ สร้าง WO ใหม่**
3. กรอกข้อมูล:
   - **Product** + **Scale** + **Line**
   - **Lot No.**
   - **วันที่เริ่ม / สิ้นสุด**
   - (ตัวเลือก) **customStd** หากต้องการ override Std จาก Product
   - สำหรับ DOUBLE mode: กรอก `customStd1` และ `customStd2` แยกกัน
4. กด **บันทึก** → WO อยู่ในสถานะ `ACTIVE`

### 5.2 Leader Dashboard — งานรอดำเนินการ
หน้านี้แสดง badge จำนวน approval ที่รอ พร้อมรายการ:

| ประเภท | การจัดการ |
|--------|-----------|
| **RED Event** | ตรวจสาเหตุ → กด **อนุมัติ + ระบุเหตุผล** |
| **Cleaning Check** | ตรวจว่า Operator ทำความสะอาดแล้ว → กด **อนุมัติ** |
| **Reweigh request** | ตรวจเหตุผล → อนุมัติ/ปฏิเสธ |

> ระบบ poll ทุก 20 วินาที — badge update อัตโนมัติ

### 5.3 เปลี่ยนสถานะ WO
- `ACTIVE` → `SORTING` : เมื่อจบการผลิต ให้ Operator ตรวจ/ย้ายกล่อง
- `SORTING` → `END` : ปิด WO หลัง Sorting เสร็จ
- หลังปิด WO → ออกรายงานได้

### 5.4 ดูรายงาน
ดูหัวข้อ §5.5 (เหมือนกับ QA)

### 5.5 รายงาน WO
เมนู **รายงาน WO** มี Tabs:
- **ภาพรวมทุก WO** — Cross-WO performance ตาม date range
- **รายละเอียด WO** — เลือก WO เดียว แล้วดู sub-tabs:
  - Lot Summary — สรุป GREEN/YELLOW/RED
  - Lot Details — รายการ measurement ทุก record
  - Lot Events — Timeline ของ STD change + Approval
  - Operator Stats — สถิติต่อ Operator
  - รายงานประสิทธิภาพ — Pass rate รายคน/รายวัน/รายกะ

---

## 6. คู่มือสำหรับ QA

### 6.1 QA Dashboard
แสดง badge รวม 3 รายการ:
- **STD Change (Ready for Apply)**
- **Outer Inspection**
- **Red Events** (สำหรับดูประวัติ)

### 6.2 อนุมัติ STD Change Request
**Stage flow:** `REQUESTED → ALLOW_4_5 → READY_FOR_APPLY → APPLIED`

1. เปิดรายการ **REQUESTED** → กด **Allow 4&5**
   - Operator จะปลดล็อก ชั่งกล่อง 4 และ 5
2. รอจน stage = **READY_FOR_APPLY** (Operator ส่ง 5 ค่ามาแล้ว)
3. ตรวจสอบ 5 ค่า + ค่า Std ที่ระบบเสนอ
4. กด **Apply Std** → ระบบ:
   - บันทึก `StandardWeightLog`
   - สร้าง Barrier Measurement (outer=000, inner=RST1)
   - Reset Yellow streak ของ Operator

### 6.3 ตรวจ Outer Inspection
1. เปิดรายการ **Outer Inspection**
2. ดูน้ำหนักทุก Inner ในกล่อง Outer นั้น
3. หากพบค่าผิดปกติ:
   - กด **ชั่งซ้ำ Inner** (`PUT /measurements/{id}/qa-reweigh`)
   - timestamp เดิมไม่เปลี่ยน → streak ไม่เพี้ยน
4. กด **Approve Outer** → กล่องผ่านการตรวจ

### 6.4 ดูรายงาน
ดูเมนู **รายงาน WO** (เหมือนกับ Leader §5.5)

---

## 7. คู่มือสำหรับ Data Admin

เมนู **Admin: Master Data** มี 4 หมวด:

### 7.1 Users
- เพิ่ม / แก้ไข / ลบ User
- กำหนด Role: OPERATOR / LEADER / QA / DATA_ADMIN / ADMIN
- **Reset password** ให้ user (ใช้เมื่อ user ลืมรหัส)
- **ลงทะเบียนนิ้วแทน user** (กรณีพิเศษ)
- Import จาก CSV ได้ (ดู `samples/`)

### 7.2 Products
ฟิลด์สำคัญ:
- `weightPerPiece` (WghPcs)
- `quantityPerMeasurement` (Qty)
- `tolerance` (DevW)
- `mode`: SINGLE หรือ DOUBLE
- `innerNumberingMode`
- `innerBoxQuantity`

**สูตรคำนวณ Std ของ Product:**
```
StandardWeight = weightPerPiece × quantityPerMeasurement
MinWeight      = StandardWeight − (weightPerPiece / 2)
MaxWeight      = StandardWeight + (weightPerPiece / 2)
DMin           = StandardWeight − tolerance
DMax           = StandardWeight + tolerance
```

### 7.3 Scales (เครื่องชั่ง)
- เพิ่ม / แก้ไข Scale: `ScaleID`, `ScaleName`, `Location`, `IsActive`

### 7.4 Standard Weight Log
- ดูประวัติการเปลี่ยน Std ทั้งหมด: เมื่อไหร่, โดยใคร, ค่าเก่า → ค่าใหม่

---

## 8. การจัดการบัญชี (ทุก Role)

กดที่ icon 🔑 ที่มุมบนขวา → Modal **จัดการบัญชี** มี 2 Tab

### 8.1 Tab "ลายนิ้วมือ"
**PC (DigitalPersona):**
1. เปิด KiosBioAgent บนเครื่อง
2. กด **ตรวจสอบ** ดูสถานะ → ต้องเป็น "พร้อมใช้งาน" สีเขียว
3. กด **วางนิ้วเพื่อลงทะเบียนใหม่ (PC)**
4. วางนิ้วตามข้อความ → สำเร็จ ✅

**Tablet (WebAuthn):**
1. ตรวจว่า browser/tablet รองรับ WebAuthn
2. กด **ลงทะเบียนนิ้วมือ Tablet (อุปกรณ์นี้)**
3. แตะ fingerprint sensor บน tablet → สำเร็จ ✅

> ⚠️ ลายนิ้วมือ Tablet จะใช้ได้ **เฉพาะอุปกรณ์ที่ลงทะเบียน** เท่านั้น (เปลี่ยนเครื่องต้องลงทะเบียนใหม่)

### 8.2 Tab "รหัสผ่าน"
1. กรอก **รหัสผ่านเดิม**
2. กรอก **รหัสผ่านใหม่** (อย่างน้อย 6 ตัวอักษร)
3. กรอก **ยืนยันรหัสผ่านใหม่** ให้ตรงกัน
4. กด **บันทึก**

---

## 9. คำถามที่พบบ่อย / Troubleshooting

| ปัญหา | สาเหตุ / แนวทางแก้ |
|-------|-------------------|
| Login ด้วยนิ้วไม่ได้ (PC) | ตรวจ KiosBioAgent ว่ารันอยู่; กด "ตรวจสอบ" ใน modal บัญชี |
| Login ด้วยนิ้วไม่ได้ (Tablet) | ต้องลงทะเบียนนิ้วบน tablet นี้ก่อน; ตรวจว่า browser รองรับ WebAuthn |
| ไม่เห็น WO ใน dropdown | WO ยังไม่ถูกสร้าง หรือสถานะไม่ใช่ ACTIVE → แจ้ง Leader |
| กล่อง RED แต่ไม่มีปุ่มชั่งซ้ำ | รอ Leader อนุมัติก่อน (badge ขึ้นที่ฝั่ง Leader) |
| Yellow ครบ 5 แล้วล็อก | ขั้นตอนปกติ → ต้องไป STD_CHANGE flow (ดู §4.4) |
| Session หมดอายุระหว่างใช้งาน | กด "ต่อ Session" ในแจ้งเตือน หรือ login ใหม่ |
| Badge ไม่ขึ้นเมื่อมีงานใหม่ | ระบบ poll ทุก 15-30 วินาที — รอสักครู่ |
| Cleaning Check ขอซ้ำไม่ได้ | dedup ต่อ `scaleId:hourLabel` — รอชั่วโมงถัดไป |

---

## 10. คำศัพท์ที่ควรรู้

| คำ | คำอธิบาย |
|----|----------|
| **WO (Work Order)** | คำสั่งผลิต — ระบุ Product, Scale, Line, Lot, ช่วงเวลา |
| **Lot** | รหัสล็อตการผลิต — measurement ทุก record ผูกกับ Lot |
| **Outer / Inner** | กล่องนอก/ใน — `OuterBoxNumber` + `InnerBoxOrder` ระบุตำแหน่งกล่อง |
| **Std (Standard Weight)** | น้ำหนักมาตรฐาน (ลำดับ: Barrier > customStd > Product.std > คำนวณจาก WghPcs×Qty) |
| **Tolerance (DevW)** | ค่าเบี่ยงเบนที่ยอมรับได้สำหรับ GREEN |
| **Yellow Streak** | จำนวน Yellow ต่อเนื่อง (ครบ 5 → ล็อกระบบ) |
| **Barrier Measurement** | record พิเศษ (outer=000, inner=RST1) ใช้ตัด streak ย้อนหลัง |
| **Approval Stage** | สถานะของ STD_CHANGE: REQUESTED → ALLOW_4_5 → READY_FOR_APPLY → APPLIED |
| **ChangeLog** | บันทึก audit ของทุกการแก้ไข measurement |
| **SINGLE / DOUBLE mode** | โหมดของ Product: ชั่ง 1 ครั้ง หรือ 2 ครั้ง (weight1, weight2) |
| **KiosBioAgent** | โปรแกรม .NET บน PC สำหรับติดต่อเครื่องอ่านลายนิ้วมือ DigitalPersona (port 5001) |
| **WebAuthn** | มาตรฐานยืนยันตัวด้วย biometric บน browser (ใช้กับ tablet) |

---

## ภาคผนวก: เอกสารอ้างอิงในโปรเจกต์

| ไฟล์ | เนื้อหา |
|------|---------|
| `README.md` | วิธี setup และรัน dev environment |
| `WORKFLOW.md` | Flow diagram เชิงเทคนิค (mermaid sequence/state) |
| `EikenDetail.txt` | สเปคต้นฉบับ — โครงสร้าง DB, สูตรคำนวณ, business logic |
| `MANUAL.md` | **ไฟล์นี้** — คู่มือผู้ใช้แบบ step-by-step ตาม role |
| `mockup_operator*.html` | Mockup UI สำหรับ Operator |
| `samples/` | ตัวอย่าง CSV สำหรับ Import (products, scales) |
| `db-migration/` | สคริปต์ migration SQL Server |
