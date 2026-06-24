# Eikensystem — System Documentation

> อัพเดทล่าสุด: 2026-06-24  
> Stack: Spring Boot 3.5 / Java 21 / MS SQL Server / React 18 / TypeScript / Ant Design 5

---

## สารบัญ

1. [โครงสร้าง Role และ Function](#1-โครงสร้าง-role-และ-function)
2. [โครงสร้างฐานข้อมูล (Database)](#2-โครงสร้างฐานข้อมูล-database)
3. [API Endpoints](#3-api-endpoints)
4. [Flow การใช้งาน](#4-flow-การใช้งาน)

---

## 1. โครงสร้าง Role และ Function

### 1.1 Role ทั้งหมดในระบบ

| Role | ชื่อเต็ม | สิทธิ์หลัก |
|---|---|---|
| `OPERATOR` | พนักงานชั่ง | ชั่งน้ำหนัก / Sorting / ดู WO ที่ตัวเองทำ |
| `LEADER` | หัวหน้า / ผู้จัดการ | สร้าง WO / อนุมัติ RED + Cleaning / ดู Report |
| `QA` | Quality Assurance | อนุมัติ Std ใหม่ / ตรวจ Outer / ดู Report |
| `DATA_ADMIN` | ผู้ดูแลข้อมูล Master | CRUD ข้อมูล Product / Scale / Machine / User |
| `ADMIN` | Admin ระบบ | สิทธิ์ทุกอย่าง (ยกเว้น DATA_ADMIN เท่านั้น) |
| `MANAGEMENT` | ผู้บริหาร | อ่านได้อย่างเดียว: Report / QA Dashboard / Leader Dashboard |

### 1.2 หน้าจอ (Page) ที่แต่ละ Role เข้าได้

| เมนู | Component | Role ที่เข้าได้ | หมายเหตุ |
|---|---|---|---|
| ชั่งน้ำหนัก | `MeasurementEntry` | OPERATOR | เฉพาะ OPERATOR เท่านั้น |
| Sorting | `SortingPage` | OPERATOR | เลือกเหตุผลจาก dropdown |
| QA Dashboard | `QADashboard` | QA, MANAGEMENT | MANAGEMENT ดูได้ แต่กดอนุมัติไม่ได้ |
| Leader Dashboard | `LeaderDashboard` | LEADER, MANAGEMENT | MANAGEMENT ดูได้ แต่กดอนุมัติไม่ได้ |
| Work Order | `WorkOrderManagement` | LEADER | สร้าง / แก้ไข / ปิด WO |
| Report | `WOReportPage` | LEADER, QA, MANAGEMENT | ดูรายงาน + Export Excel |
| Admin | `AdminData` | DATA_ADMIN, ADMIN | จัดการข้อมูล Master |

### 1.3 สิทธิ์ API ตาม Role (สรุป)

| กลุ่ม Endpoint | GET | POST/PUT/DELETE |
|---|---|---|
| `/api/admin/**` | DATA_ADMIN | DATA_ADMIN |
| `/api/reports/**` | LEADER, QA, ADMIN, MANAGEMENT | - |
| `/api/approvals/**` | ทุก Role (รายละเอียดใน Controller) | ตาม @PreAuthorize ของแต่ละ endpoint |
| `/api/measurements/**` | OPERATOR, LEADER, QA, ADMIN, MANAGEMENT | OPERATOR, LEADER, QA, ADMIN |
| `/api/products/**`, `/api/scales/**` | ทุก Role ที่ login แล้ว | LEADER, QA, ADMIN |
| `/api/sorting-reasons` | ทุก Role ที่ login แล้ว | ADMIN |
| `/api/work-orders/**` | ทุก Role ที่ login แล้ว | LEADER, ADMIN |
| `/api/auth/**` | Public | Public |
| `/health` | Public | - |

### 1.4 Function หลักของแต่ละ Role

#### OPERATOR
- เลือก Work Order ที่ต้องการทำงาน
- บันทึกชื่อทีม → เริ่มชั่ง
- ชั่งน้ำหนักชิ้นงาน (GREEN / YELLOW / RED)
- ขอ Outer Inspection เมื่อกล่อง Outer เต็ม
- ขอ Cleaning Check ก่อนเริ่มกะ
- Sorting ชิ้นงาน พร้อมเหตุผล

#### LEADER
- สร้าง / แก้ไข / ปิด Work Order
- อนุมัติ RED Event (Unlock ให้ชั่งซ้ำ หรือ เริ่ม Recalc Std)
- อนุมัติ Cleaning Check
- อนุมัติ Outer Inspection (หากสินค้านั้นกำหนดให้ Leader ตรวจ)
- ดู Report ภาพรวม + Export Excel

#### QA
- อนุมัติการเปลี่ยน Standard Weight (Yellow Streak 5 กล่อง / Initial Std 10 กล่อง)
- ตรวจ Outer Inspection (สำหรับสินค้าที่กำหนด QA ตรวจ)
- ชั่งซ้ำชิ้นงานใน Outer ที่น่าสงสัย (QA Reweigh)
- ย้าย Inner Box ระหว่างการตรวจ (Relocate)
- ดู Report

#### DATA_ADMIN
- CRUD Product (สินค้า), Scale (เครื่องชั่ง), Machine (เครื่องจักร)
- CRUD User + กำหนด Role + ลงทะเบียนลายนิ้วมือ
- CRUD SortingReason (เหตุผล Sorting)
- Import CSV ข้อมูล Master ทุกประเภท

---

## 2. โครงสร้างฐานข้อมูล (Database)

### 2.1 ภาพรวม Entity Relationship

```
AppUser ─── (roles) ─── app_user_roles
AppUser ─── WebAuthnCredential (1:N)

WorkOrder ──┬── Product (N:1)
            ├── Scale   (N:1)
            ├── Machine (N:1)
            └── WorkOrder [rework: self-ref]

Measurement ──┬── Product (N:1)
              └── Scale   (N:1)

Approval ── (targetId → Measurement.measurementId / Scale:Hour / Product:Scale:Lot:Outer)

OuterInspection ── (approvalId → Approval)

StandardWeightLog ── (approvalId → Approval)

ChangeLog ── (free: productCode, lotNo, changeType, description JSON)

CleaningLog ── (scaleId)

SortingReason (standalone)
```

---

### 2.2 ตาราง app_users

| คอลัมน์ | Type | Constraint | คำอธิบาย |
|---|---|---|---|
| username | VARCHAR | PK | ชื่อผู้ใช้ |
| password_hash | VARCHAR | NOT NULL | รหัสผ่านที่ Hash แล้ว |

**ตาราง app_user_roles** (junction)

| คอลัมน์ | Type | คำอธิบาย |
|---|---|---|
| app_user_username | VARCHAR | FK → app_users.username |
| role | VARCHAR | OPERATOR / LEADER / QA / ADMIN / DATA_ADMIN / MANAGEMENT |

---

### 2.3 ตาราง work_order

| คอลัมน์ | Type | Constraint | คำอธิบาย |
|---|---|---|---|
| work_order_id | BIGINT | PK, auto | รหัส WO |
| product_code | VARCHAR | FK → product | รหัสสินค้า |
| scale_id | VARCHAR | FK → scale | เครื่องชั่ง |
| machine_id | VARCHAR | FK → machine | เครื่องจักร |
| lot_no | VARCHAR | NOT NULL | หมายเลข Lot |
| start_date | DATE | | วันเริ่มผลิต |
| end_date | DATE | | วันสุดท้ายผลิต |
| target_tubes | INT | | เป้าหมายจำนวนหลอด |
| custom_std | DOUBLE | | ค่า Std กำหนดเอง (SINGLE mode) |
| custom_std1 | DOUBLE | | ค่า Std1 กำหนดเอง (DOUBLE mode) |
| custom_std2 | DOUBLE | | ค่า Std2 กำหนดเอง (DOUBLE mode) |
| status | VARCHAR | | ACTIVE / SORTING / END |
| created_by | VARCHAR | | ผู้สร้าง WO |
| created_at | DATETIME | | เวลาสร้าง |
| operator_names | NVARCHAR(MAX) | | ชื่อทีมงาน (free text) |
| started_by | VARCHAR | | ผู้เปิดงาน (Operator) |
| session_started_at | DATETIME | | เวลาเริ่มงาน |
| closed_at | DATETIME | | เวลาปิดงาน |
| closed_by | VARCHAR | | ผู้ปิดงาน |
| rework_source_wo_id | BIGINT | FK → work_order (self) | WO ต้นฉบับ (ถ้าเป็น Rework) |
| rework_reason | NVARCHAR(MAX) | | เหตุผล Rework |
| line | VARCHAR | | Legacy field |

---

### 2.4 ตาราง measurement

| คอลัมน์ | Type | Constraint | คำอธิบาย |
|---|---|---|---|
| measurement_id | BIGINT | PK, auto | รหัส Measurement |
| product_code | VARCHAR | FK → product | รหัสสินค้า |
| scale_id | VARCHAR | FK → scale | เครื่องชั่ง |
| lot_no | VARCHAR | | หมายเลข Lot |
| outer_box_number | VARCHAR | | หมายเลข Outer กล่อง (เช่น "001") |
| inner_box_order | VARCHAR | | ลำดับ Inner กล่อง (เช่น "0001") |
| weight | DOUBLE | | น้ำหนักรวม |
| weight1 | DOUBLE | | น้ำหนักครั้งที่ 1 (DOUBLE mode) |
| weight2 | DOUBLE | | น้ำหนักครั้งที่ 2 (DOUBLE mode) |
| timestamp | DATETIME | | เวลาชั่ง |
| operator_name | VARCHAR | | ชื่อพนักงานชั่ง |
| status | VARCHAR | | GREEN / YELLOW / RED / RECALC_SAMPLE |
| approval_id | BIGINT | | FK → approvals (ถ้า RED ที่รอ approve) |
| note | NVARCHAR(MAX) | | หมายเหตุ |
| is_for_standard_adjustment | BIT | | true = Barrier record |
| work_order_id | BIGINT | | FK → work_order (optional) |
| effective_std | DOUBLE | | Snapshot ค่า Std ที่ใช้ตอนชั่ง |
| effective_std1 | DOUBLE | | Snapshot ค่า Std1 (DOUBLE mode) |
| effective_std2 | DOUBLE | | Snapshot ค่า Std2 (DOUBLE mode) |

**Barrier Records (Special Measurements):**

| outer_box_number | inner_box_order | is_for_std_adj | ความหมาย |
|---|---|---|---|
| "000" | "RST1" | true | Apply Standard Barrier (Std เปลี่ยน) |
| "000" | "RECALC_START" | true | เริ่ม Recalc Std Mode (หลัง Red Approve) |

---

### 2.5 ตาราง approvals

| คอลัมน์ | Type | Constraint | คำอธิบาย |
|---|---|---|---|
| id | BIGINT | PK, auto | รหัส Approval |
| type | VARCHAR | | RED_EVENT / STD_CHANGE_REQUEST / CLEANING_CHECK / OUTER_INSPECTION |
| target_id | VARCHAR | | Reference: measurementId / scaleId:hour / product:scale:lot:outer |
| status | VARCHAR | | PENDING / APPROVED / REJECTED |
| approver_role | VARCHAR | | LEADER หรือ QA (ใครต้องอนุมัติ) |
| requested_by | VARCHAR | | ผู้สร้าง request |
| requested_at | DATETIME | | เวลาสร้าง |
| action_at | DATETIME | | เวลาอนุมัติ/ปฏิเสธ |
| action_by | VARCHAR | | ผู้อนุมัติ/ปฏิเสธ |
| note | NVARCHAR(MAX) | | เหตุผล / หมายเหตุ |
| stage | VARCHAR | | REQUESTED / ALLOW_4_5 / READY_FOR_APPLY / APPLIED |
| payload_json | NVARCHAR(MAX) | | JSON บริบทเพิ่มเติม |
| recalc_std_mode | BIT | | true = เริ่ม Recalc Std Mode หลัง RED |

**Approval Type รายละเอียด:**

| type | ใครสร้าง | ใครอนุมัติ | ผล |
|---|---|---|---|
| RED_EVENT | Operator (auto) | LEADER | Unlock ชั่งซ้ำ หรือ เริ่ม Recalc |
| STD_CHANGE_REQUEST | ระบบ (yellow 5 / initial 10) | QA | เปลี่ยน Standard Weight |
| CLEANING_CHECK | Operator | LEADER | ยืนยันทำความสะอาดเครื่องชั่ง |
| OUTER_INSPECTION | Operator | QA หรือ LEADER (ตาม Product config) | ตรวจ Outer Box |

---

### 2.6 ตาราง product

| คอลัมน์ | Type | Constraint | คำอธิบาย |
|---|---|---|---|
| product_code | VARCHAR | PK | รหัสสินค้า |
| product_name | VARCHAR | | ชื่อสินค้า |
| weight_per_piece | DOUBLE | | น้ำหนักต่อชิ้น (wpp) |
| quantity_per_measurement | INT | | จำนวนชิ้นต่อการชั่ง 1 ครั้ง |
| standard_weight | DOUBLE | | Std = wpp × qty |
| min_weight | DOUBLE | | ขอบล่าง RED = Std - wpp/2 |
| max_weight | DOUBLE | | ขอบบน RED = Std + wpp/2 |
| tolerance | DOUBLE | | ช่วง YELLOW = wpp/4 (default) |
| inner_box_quantity | INT | | จำนวน Inner ต่อ Outer กล่อง |
| unit | VARCHAR | | หน่วย (g, kg, pcs) |
| weighing_mode | VARCHAR | | SINGLE (default) / DOUBLE |
| double_weighing_tolerance | DOUBLE | | ความต่างสูงสุด weight1 vs weight2 (DOUBLE) |
| inner_numbering_mode | VARCHAR | | CONTINUOUS / RESET_PER_OUTER |
| standard_weight1 | DOUBLE | | Std ชั่งครั้งที่ 1 (DOUBLE) |
| standard_weight2 | DOUBLE | | Std ชั่งครั้งที่ 2 (DOUBLE) |
| tolerance1 | DOUBLE | | Tolerance ชั่งครั้งที่ 1 (DOUBLE) |
| tolerance2 | DOUBLE | | Tolerance ชั่งครั้งที่ 2 (DOUBLE) |
| cleaner_time | INT | | ชั่วโมงห่างระหว่างแจ้งทำความสะอาด (null/0 = ปิด) |
| outer_approver_role | VARCHAR | | QA (default) / OPERATOR (self-check) / LEADER |
| outer_approver_note | VARCHAR | | คำแนะนำสำหรับผู้ตรวจ Outer |
| description | VARCHAR | | คำอธิบาย |

**กฎการจำแนกสถานะ (SINGLE mode):**
```
RED    : weight < (Std - wpp/2)  หรือ  weight > (Std + wpp/2)
YELLOW : weight < (Std - tol)    หรือ  weight > (Std + tol)  [และไม่ RED]
GREEN  : อยู่ในช่วง (Std ± tol)
```

---

### 2.7 ตาราง scale

| คอลัมน์ | Type | Constraint | คำอธิบาย |
|---|---|---|---|
| scale_id | VARCHAR | PK | รหัสเครื่องชั่ง |
| scale_name | VARCHAR | | ชื่อแสดง |
| weight_unit | VARCHAR | | g / kg |
| description | VARCHAR | | คำอธิบาย |
| is_active | BIT | | เปิด/ปิดใช้งาน |

---

### 2.8 ตาราง machine

| คอลัมน์ | Type | Constraint | คำอธิบาย |
|---|---|---|---|
| machine_id | VARCHAR | PK | รหัสเครื่องจักร (เช่น RLB101) |
| machine_name | VARCHAR | NOT NULL | ชื่อแสดง |
| machine_type | VARCHAR | | PRODUCTION / MANUAL / PACKING |
| is_active | BIT | | เปิด/ปิดใช้งาน |
| sort_order | INT | | ลำดับแสดงผล |

---

### 2.9 ตาราง outer_inspections

| คอลัมน์ | Type | Constraint | คำอธิบาย |
|---|---|---|---|
| id | BIGINT | PK, auto | รหัส |
| product_code | VARCHAR | | รหัสสินค้า |
| scale_id | VARCHAR | | เครื่องชั่ง |
| lot_no | VARCHAR | | หมายเลข Lot |
| outer_box | VARCHAR | | หมายเลข Outer กล่อง |
| work_order_id | BIGINT | | FK → work_order |
| approval_id | BIGINT | | FK → approvals |
| inspector_role | VARCHAR | | QA / OPERATOR / LEADER |
| inspector_user | VARCHAR | | ผู้ตรวจ |
| inspected_at | DATETIME | | เวลาตรวจ |
| status | VARCHAR | | AUTO_APPROVED / APPROVED / REJECTED |
| approver_note | NVARCHAR(500) | | หมายเหตุจากผู้อนุมัติ |
| notes | NVARCHAR(500) | | หมายเหตุทั่วไป |
| reweigh_count | INT | | จำนวนครั้งที่ชั่งซ้ำ |
| created_at | DATETIME | | เวลาสร้างรายการ |

---

### 2.10 ตาราง change_logs

| คอลัมน์ | Type | Constraint | คำอธิบาย |
|---|---|---|---|
| id | BIGINT | PK, auto | รหัส |
| product_code | VARCHAR | | รหัสสินค้า |
| change_type | VARCHAR | | MEASUREMENT_REWEIGH / BOX_RELOCATE / QA_OUTER_REWEIGH / WEIGHT_UPDATE / TOLERANCE_UPDATE |
| description | NVARCHAR(MAX) | | JSON detail หรือ free text |
| created_by | VARCHAR | | ผู้ดำเนินการ |
| created_at | DATETIME | | เวลา |
| lot_no | VARCHAR | | หมายเลข Lot |
| reason_code | VARCHAR | | รหัสเหตุผล Sorting |
| reason_note | NVARCHAR(500) | | หมายเหตุเพิ่มเติม |

**ตัวอย่าง description JSON สำหรับ MEASUREMENT_REWEIGH:**
```json
{
  "measurementId": 123,
  "prevWeight": 375.5,
  "prevStatus": "RED",
  "newWeight": 374.1,
  "newStatus": "GREEN"
}
```

---

### 2.11 ตาราง standard_weight_logs

| คอลัมน์ | Type | คำอธิบาย |
|---|---|---|
| id | BIGINT | PK |
| product_code | VARCHAR | รหัสสินค้า |
| old_std | DOUBLE | Std เก่า |
| new_std | DOUBLE | Std ใหม่ |
| old_std1 / new_std1 | DOUBLE | Std1 เก่า/ใหม่ (DOUBLE mode) |
| old_std2 / new_std2 | DOUBLE | Std2 เก่า/ใหม่ (DOUBLE mode) |
| sample_weights_json | NVARCHAR(MAX) | JSON array น้ำหนัก 5 ตัวอย่าง |
| approval_id | BIGINT | FK → approvals |
| approved_by | VARCHAR | QA ที่อนุมัติ |
| approved_at | DATETIME | เวลาอนุมัติ |
| reason | NVARCHAR(MAX) | เหตุผล |

---

### 2.12 ตาราง cleaning_logs

| คอลัมน์ | Type | คำอธิบาย |
|---|---|---|
| id | BIGINT | PK |
| scale_id | VARCHAR | เครื่องชั่ง |
| cleaned_by | VARCHAR | ผู้ทำความสะอาด |
| cleaned_at | DATETIME | เวลาทำความสะอาด |
| notes | VARCHAR | หมายเหตุ |

---

### 2.13 ตาราง sorting_reasons

| คอลัมน์ | Type | Constraint | คำอธิบาย |
|---|---|---|---|
| id | BIGINT | PK, auto | รหัส |
| code | VARCHAR | UNIQUE | รหัสเหตุผล (เช่น WRONG_WEIGHT) |
| label_th | NVARCHAR(255) | NOT NULL | ชื่อภาษาไทย |
| label_en | VARCHAR | | ชื่อภาษาอังกฤษ |
| description | NVARCHAR(500) | | คำอธิบาย |
| scope | VARCHAR | | BULK / SINGLE / BOTH (ใช้กับประเภทใด) |
| sort_order | INT | | ลำดับแสดง (default 100) |
| is_active | BIT | | เปิด/ปิดใช้งาน |
| requires_note | BIT | | บังคับกรอกหมายเหตุ |
| created_at / updated_at | DATETIME | | Timestamps |
| created_by / updated_by | VARCHAR | | ผู้ดำเนินการ |

---

### 2.14 ตาราง webauthn_credential

| คอลัมน์ | Type | Constraint | คำอธิบาย |
|---|---|---|---|
| credential_id | VARCHAR | PK | Base64URL-encoded ID |
| username | VARCHAR | | FK → app_users |
| public_key_cose | TEXT | | COSE public key (Base64URL) |
| sign_count | BIGINT | | Counter ป้องกัน clone |
| created_at | DATETIME | | เวลาลงทะเบียน |

---

## 3. API Endpoints

### 3.1 Auth (`/api/auth`)

| Method | Path | Role | คำอธิบาย |
|---|---|---|---|
| POST | `/api/auth/login` | Public | Login ด้วย username/password หรือ fingerprint |
| POST | `/api/auth/refresh` | Public | Refresh JWT token |
| GET | `/api/auth/me` | Authenticated | ข้อมูล user ปัจจุบัน + roles |
| PUT | `/api/auth/password` | Authenticated | เปลี่ยนรหัสผ่าน |
| POST | `/api/auth/register-fingerprint` | Authenticated | ลงทะเบียน fingerprint (PC/KiosBioAgent) |
| POST | `/api/auth/webauthn/register/begin` | Authenticated | เริ่ม WebAuthn enrollment (Tablet) |
| POST | `/api/auth/webauthn/register/finish` | Authenticated | จบ WebAuthn enrollment |
| POST | `/api/auth/logout` | Authenticated | Logout |

---

### 3.2 Measurements (`/api/measurements`)

| Method | Path | Role | คำอธิบาย |
|---|---|---|---|
| POST | `/api/measurements` | OPERATOR, LEADER, ADMIN | บันทึกการชั่งใหม่ |
| GET | `/api/measurements/classify` | Authenticated | จำแนกสถานะ GREEN/YELLOW/RED |
| GET | `/api/measurements/yellow-streak` | Authenticated | นับ YELLOW ต่อเนื่อง |
| GET | `/api/measurements/last` | Authenticated | ข้อมูล outer/inner ล่าสุด |
| GET | `/api/measurements/recalc-samples` | Authenticated | ตัวอย่าง Recalc Std Mode |
| GET | `/api/measurements/current-outer` | Authenticated | ข้อมูล Outer Box ปัจจุบัน |
| GET | `/api/measurements/history` | Authenticated | ประวัติการชั่งทั้งหมดของ lot |
| GET | `/api/measurements/by-outer` | QA, LEADER, OPERATOR, ADMIN | รายการชั่งใน Outer Box |
| GET | `/api/measurements/std-source` | Authenticated | ค่า Std ที่ใช้งานอยู่ปัจจุบัน |
| GET | `/api/measurements/exists` | Authenticated | ตรวจว่า box นั้นมีข้อมูลแล้วหรือไม่ |
| PUT | `/api/measurements/reweigh` | OPERATOR, QA, LEADER, ADMIN | ชั่งซ้ำหลังได้รับ approve |
| PUT | `/api/measurements/{id}/relocate` | OPERATOR, LEADER, ADMIN | ย้าย box ไป outer/inner อื่น |
| PUT | `/api/measurements/{id}/qa-reweigh` | QA, ADMIN | QA ชั่งซ้ำระหว่างตรวจ Outer |

---

### 3.3 Approvals (`/api/approvals`)

| Method | Path | Role | คำอธิบาย |
|---|---|---|---|
| GET | `/api/approvals` | QA, LEADER, ADMIN | รายการ approval ทั้งหมด |
| POST | `/api/approvals` | Authenticated | สร้าง approval ใหม่ |
| GET | `/api/approvals/leader-pending` | LEADER, MANAGEMENT | รายการรอ Leader อนุมัติ (RED + CLEANING + OUTER) |
| GET | `/api/approvals/leader-pending/count` | LEADER, MANAGEMENT | จำนวนรายการรอ Leader |
| GET | `/api/approvals/qa-pending` | QA, MANAGEMENT | รายการรอ QA อนุมัติ (STD_CHANGE) |
| GET | `/api/approvals/qa-pending-count` | QA, MANAGEMENT | จำนวนรายการรอ QA ทั้งหมด |
| GET | `/api/approvals/qa-red-pending` | QA, MANAGEMENT | รายการ RED ที่รอ QA |
| GET | `/api/approvals/outer-inspection/pending` | QA, MANAGEMENT | รายการ Outer รอตรวจ |
| POST | `/api/approvals/red-for-measurement/{id}` | OPERATOR, LEADER, ADMIN | สร้าง RED Approval |
| POST | `/api/approvals/{id}/approve-with-note` | LEADER, QA | อนุมัติ RED พร้อมเหตุผล |
| POST | `/api/approvals/{id}/approve-recalc-std` | QA, ADMIN | อนุมัติ RED + เริ่ม Recalc Std Mode |
| POST | `/api/approvals/{id}/allow-4-5` | QA | อนุญาต YELLOW ครั้งที่ 4-5 |
| POST | `/api/approvals/{id}/update-proposal` | Authenticated | อัพเดทข้อมูลเสนอ Std ใหม่ |
| POST | `/api/approvals/{id}/apply-std` | QA | Apply Standard ใหม่ |
| POST | `/api/approvals/cleaning-check` | OPERATOR, ADMIN | ขอทำความสะอาดเครื่องชั่ง |
| GET | `/api/approvals/cleaning-check/status` | Authenticated | ตรวจสถานะ Cleaning Check |
| POST | `/api/approvals/outer-inspection` | OPERATOR, ADMIN | ขอตรวจ Outer Box |
| POST | `/api/approvals/{id}/approve-outer` | QA, LEADER | อนุมัติ Outer Inspection |

---

### 3.4 Work Orders (`/api/work-orders`)

| Method | Path | Role | คำอธิบาย |
|---|---|---|---|
| GET | `/api/work-orders` | Authenticated | รายการ WO (filter: status, date) |
| GET | `/api/work-orders/{id}` | Authenticated | ดู WO เดี่ยว |
| POST | `/api/work-orders` | LEADER, ADMIN | สร้าง WO ใหม่ |
| PUT | `/api/work-orders/{id}` | LEADER, ADMIN | แก้ไข WO |
| PUT | `/api/work-orders/{id}/status` | LEADER, ADMIN | เปลี่ยน status WO |
| POST | `/api/work-orders/{id}/start` | OPERATOR, ADMIN | เริ่มงาน + บันทึกทีม |
| POST | `/api/work-orders/{id}/close` | OPERATOR, LEADER, ADMIN | ปิด WO |
| DELETE | `/api/work-orders/{id}` | LEADER, ADMIN | ลบ WO (ถ้าไม่มี measurement) |
| GET | `/api/work-orders/availability` | LEADER, ADMIN | ตรวจ Machine/Scale ว่างในช่วงวันที่ |

---

### 3.5 Reports (`/api/reports`)

| Method | Path | Role | คำอธิบาย |
|---|---|---|---|
| GET | `/api/reports/lot-summary` | Authenticated | สรุป Lot ทั้งหมดของสินค้า |
| GET | `/api/reports/lot-details` | Authenticated | รายละเอียดการชั่งใน Lot |
| GET | `/api/reports/lot-events` | Authenticated | Timeline events (RED, Std change, YELLOW) |
| GET | `/api/reports/wo-performance` | LEADER, QA, ADMIN | สรุป WO: green/yellow/red/pass rate |
| GET | `/api/reports/scale-status` | QA, LEADER, ADMIN | สถานะ real-time ของเครื่องชั่งทุกตัว |
| GET | `/api/reports/machine-status` | QA, LEADER, ADMIN, MANAGEMENT | สถานะ real-time ของเครื่องจักรทุกตัว |

---

### 3.6 Admin Master Data (`/api/admin`) — DATA_ADMIN เท่านั้น

| กลุ่ม | Endpoints |
|---|---|
| Products | GET/POST `/api/admin/products`, PUT/DELETE `/{code}`, POST `/import` |
| Scales | GET/POST `/api/admin/scales`, PUT/DELETE `/{id}`, POST `/import` |
| Machines | GET/POST `/api/admin/machines`, PUT/DELETE `/{id}`, POST `/import` |
| Users | GET/POST `/api/admin/users`, PUT/DELETE `/{username}`, POST `/import`, POST `/{username}/fingerprint` |
| SortingReasons | GET/POST `/api/admin/sorting-reasons`, PUT/DELETE `/{id}` |
| System | GET `/api/admin/db-info`, POST `/api/admin/schema/ensure-columns` |

---

## 4. Flow การใช้งาน

### 4.1 Flow หลัก — การชั่งน้ำหนัก (Operator Weighing)

```
[OPERATOR]
    │
    ├─1─ Login (username/password หรือ fingerprint)
    │
    ├─2─ เลือก Work Order (ACTIVE)
    │       → บันทึกชื่อทีมงาน
    │       → POST /api/work-orders/{id}/start
    │
    ├─3─ ขอ Cleaning Check (ก่อนเริ่มกะ)
    │       → POST /api/approvals/cleaning-check
    │       → รอ LEADER อนุมัติ
    │
    ├─4─ วนซ้ำ: ชั่งน้ำหนักชิ้นงาน
    │   │
    │   ├─ ชั่งแต่ละกล่อง Inner
    │   │   POST /api/measurements  → GREEN ✓ → ชั่งต่อ
    │   │                           → YELLOW  → เพิ่ม streak counter
    │   │                           → RED     → สร้าง RED_EVENT approval
    │   │                                       → รอ LEADER อนุมัติ (ดู Flow 4.3)
    │   │
    │   ├─ YELLOW 5 ครั้งติดกัน → ระบบ Lock
    │   │   → ส่ง STD_CHANGE_REQUEST → รอ LEADER/QA (ดู Flow 4.4)
    │   │
    │   └─ ครบ innerBoxQuantity กล่องแรก (Initial Std)
    │       → ส่ง STD_CHANGE_REQUEST → รอ QA (ดู Flow 4.5)
    │
    ├─5─ ครบ Outer Box → ขอตรวจ
    │       POST /api/approvals/outer-inspection
    │       → ตาม outerApproverRole: (ดู Flow 4.6)
    │         OPERATOR → Auto Approved (ทำเองได้)
    │         QA       → รอ QA ตรวจ
    │         LEADER   → รอ LEADER ตรวจ
    │
    ├─6─ Sorting ชิ้นงาน (ถ้า WO status = SORTING)
    │       SortingPage: เลือก Case + เหตุผล Sorting
    │
    └─7─ ปิดงาน
            POST /api/work-orders/{id}/close
```

---

### 4.2 Flow — Work Order Lifecycle

```
[LEADER] สร้าง WO
    │
    ├─ POST /api/work-orders
    │   └─ เลือก: Product / Scale / Machine / Lot No. / วันผลิต
    │   └─ ตรวจ availability (Machine/Scale ไม่ซ้ำกับ WO อื่น)
    │
    ▼
 [WO status: ACTIVE]
    │
    ├─ [OPERATOR] POST /api/work-orders/{id}/start (เปิดกะ)
    ├─ ... ชั่งน้ำหนัก (ดู Flow 4.1) ...
    │
    ▼
 [LEADER] เปลี่ยน status → SORTING
    │
    ├─ [OPERATOR] ทำ Sorting
    │
    ▼
 [LEADER] เปลี่ยน status → END
    │
    └─ ปิด WO สมบูรณ์ → ดู Report ได้
```

---

### 4.3 Flow — RED Event (ชั่งเกินขอบเขต)

```
[ระบบ] ตรวจพบ weight RED
    │
    ├─ Measurement บันทึก status=RED
    ├─ สร้าง RED_EVENT approval (PENDING, approverRole=LEADER)
    └─ Frontend: "รอ Leader อนุมัติ" → ชั่งต่อไม่ได้

[LEADER] เปิด Leader Dashboard → เห็น RED ที่รอ
    │
    ├─ Option A: อนุมัติธรรมดา (approve-with-note)
    │   └─ POST /api/approvals/{id}/approve-with-note + เหตุผล
    │   └─ Unlock → [OPERATOR] ชั่งซ้ำได้ (PUT /api/measurements/reweigh)
    │   └─ ChangeLog: MEASUREMENT_REWEIGH บันทึก prevStatus=RED
    │
    └─ Option B: เริ่ม Recalc Std Mode
        └─ POST /api/approvals/{id}/approve-recalc-std
        └─ ใส่ Barrier "RECALC_START"
        └─ [OPERATOR] ชั่งต่อ → status = RECALC_SAMPLE (10 กล่อง)
        └─ ครบ 10 → สร้าง STD_CHANGE_REQUEST ให้ QA อนุมัติ (ดู Flow 4.4)
```

---

### 4.4 Flow — YELLOW Streak (5+ ต่อเนื่อง)

```
[ระบบ] นับ YELLOW ต่อเนื่อง
    │
    ├─ ครั้งที่ 1-3: แสดง warning bar เท่านั้น
    ├─ ครั้งที่ 4-5: Leader สามารถ allow-4-5 เพื่อให้ชั่งต่อ
    │
    └─ ครั้งที่ 5 (ครบ 5): สร้าง STD_CHANGE_REQUEST (PENDING, approverRole=LEADER)
        → ระบบ Lock: ชั่งต่อไม่ได้

[LEADER] อนุมัติ / เลือก allow-4-5
    │
    └─ [QA] รับ proposal เมื่อ stage=READY_FOR_APPLY
        └─ POST /api/approvals/{id}/apply-std + น้ำหนัก 5 ตัวอย่าง
        └─ บันทึก StandardWeightLog
        └─ ใส่ Barrier "RST1" → Std ใหม่มีผล → ล้าง YELLOW streak
```

---

### 4.5 Flow — Initial Standard (10 กล่องแรก)

```
[ระบบ] ครบ innerBoxQuantity กล่อง (threshold)
    │
    └─ สร้าง STD_CHANGE_REQUEST (stage=READY_FOR_APPLY, approverRole=QA)
        → Frontend แจ้ง Operator

[QA] เห็นใน QA Dashboard
    └─ ตรวจสอบน้ำหนัก 10 ตัวอย่าง + ค่าเฉลี่ย
    └─ POST /api/approvals/{id}/apply-std
    └─ ใส่ Barrier "RST1" → ล็อค Std สำหรับ lot นี้
    └─ ชั่งต่อโดยใช้ Std ที่ QA อนุมัติ
```

---

### 4.6 Flow — Outer Inspection

```
[OPERATOR] ชั่งครบ Outer Box (innerBoxQuantity กล่อง)
    │
    └─ POST /api/approvals/outer-inspection
        │
        ├─ Product.outerApproverRole = OPERATOR
        │   └─ Auto Approved → OuterInspection(AUTO_APPROVED) ทันที
        │
        ├─ Product.outerApproverRole = QA (default)
        │   └─ สร้าง OUTER_INSPECTION approval (PENDING, approverRole=QA)
        │   └─ QA Dashboard แสดง "รอตรวจ"
        │   └─ [QA] ดูรายการชั่งใน Outer → ชั่งซ้ำ / ย้าย → อนุมัติ
        │   └─ POST /api/approvals/{id}/approve-outer
        │
        └─ Product.outerApproverRole = LEADER
            └─ สร้าง OUTER_INSPECTION approval (PENDING, approverRole=LEADER)
            └─ Leader Dashboard แสดง "รอตรวจ"
            └─ [LEADER] อนุมัติ (หมายเหตุไม่บังคับ)
            └─ POST /api/approvals/{id}/approve-outer
```

---

### 4.7 Flow — Cleaning Check

```
[OPERATOR] กดขอทำความสะอาดเครื่องชั่ง
    │
    └─ POST /api/approvals/cleaning-check
        └─ targetId = "scaleId:YYYY-MM-DDTHH"
        └─ Dedup: 1 รายการต่อเครื่องต่อชั่วโมง
        └─ ระบบรอ LEADER อนุมัติ

[LEADER] เห็นใน Leader Dashboard
    └─ POST /api/approvals/{id}/approve → CleaningLog บันทึก

[OPERATOR] Poll สถานะ GET /api/approvals/cleaning-check/status
    └─ status=APPROVED → ชั่งต่อได้
```

---

### 4.8 Flow — RED ใน WO Report (ข้อมูลประวัติ)

```
ปัญหา: PUT /api/measurements/reweigh เขียนทับข้อมูล RED เดิมใน Measurement
    → ถ้าชั่งซ้ำได้ GREEN แล้ว ตาราง measurement แสดง GREEN เท่านั้น (RED หาย)

วิธีแก้ (WOReportPage):
    ├─ อ่าน ChangeLog ที่ changeType=MEASUREMENT_REWEIGH
    ├─ กรอง: description JSON มี prevStatus=RED
    └─ นับเป็น RED ใน redCount = realMeasurements(status=RED) + redReweighedCount
```

---

### 4.9 การ Login (Multi-Factor)

```
PC (Windows + KiosBioAgent):
    └─ POST /api/auth/login {fingerprintTemplate}
        → KiosBioAgent จับลายนิ้วมือ → ส่ง template ไปยืนยัน

Tablet (iOS/Android + WebAuthn):
    └─ POST /api/auth/webauthn/register/begin → สร้าง challenge
    └─ POST /api/auth/webauthn/register/finish → ลงทะเบียน public key
    └─ Login ด้วย biometric ของอุปกรณ์ (Face ID / Touch ID / Android fingerprint)

Password (fallback):
    └─ POST /api/auth/login {username, password}
```

---

### 4.10 Priority ของ Standard Weight

ระบบหา Std ที่ใช้ตาม priority ดังนี้:

```
1. Barrier Record (isForStandardAdjustment=true, outer="000", inner="RST1")
   → ล่าสุดในชุดเดียวกัน (productCode + scaleId + lotNo)

2. WO.customStd (ถ้ากำหนดใน Work Order)

3. Product.standardWeight (จากตาราง Master)

4. Fallback: weightPerPiece × quantityPerMeasurement
```

---

### 4.11 กฎ YELLOW Streak Counter

```
นับ YELLOW ต่อเนื่องจากล่าสุดย้อนขึ้นไป:
  ✓ YELLOW    → นับเพิ่ม
  ✗ GREEN     → หยุดนับ (reset streak)
  - RED       → ข้าม (ไม่หยุด streak ไม่นับเพิ่ม)
  ✗ Barrier   → หยุดนับ (reset streak)

≥ 5 ติดกัน → requiresApproval = true → ชั่งต่อไม่ได้จนกว่า QA/LEADER จะอนุมัติ
```

---

*End of Document*
