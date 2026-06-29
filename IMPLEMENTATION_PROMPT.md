# Eikensystem — Implementation Prompt (สำหรับ VSCode AI)

> เอกสารนี้เป็น **prompt แบบสมบูรณ์** สำหรับสั่ง AI ใน VSCode (Claude Code / Copilot) ให้พัฒนา feature ทั้งหมด 12 ข้อ
> Source of truth: `TODO.md` (รายละเอียดเต็ม)
> วันที่: 2026-06-23

---

## 📌 วิธีใช้ Prompt นี้

**คัดลอกข้อความหลังบรรทัด `===== PROMPT START =====` ไปวางใน VSCode AI chat**
AI จะอ่าน TODO.md เป็น source of truth และทำตามลำดับใน prompt นี้

---

===== PROMPT START =====

# 🎯 Mission

ฉันเป็นผู้พัฒนาระบบ **Eikensystem** (Weight Inspection System สำหรับโรงงาน Toyo Seikan)
อ่านไฟล์ `TODO.md` ที่ root ของ repo เพื่อดู **specification ฉบับเต็ม** ของ 12 features ที่ต้อง implement
ทำตาม **ลำดับการพัฒนา** ในเอกสารนี้อย่างเคร่งครัด เพื่อให้ feature ที่ depend กันถูก implement ในลำดับที่ถูกต้อง

---

## 🗺️ โครงสร้างโปรเจกต์ (อ้างอิงด่วน)

```
EikenSystem/
├── frontend/                                       # React + Vite + TypeScript + antd v5
│   └── src/
│       ├── App.tsx, main.tsx, api.ts
│       └── ui/
│           ├── MeasurementEntry.tsx                # Operator ชั่งน้ำหนัก (2382 บรรทัด)
│           ├── SortingPage.tsx                     # Operator Sorting (676 บรรทัด)
│           ├── LeaderDashboard.tsx                 # Leader (1248 บรรทัด)
│           ├── QADashboard.tsx                     # QA (975 บรรทัด)
│           ├── WorkOrderManagement.tsx             # Leader สร้าง WO (656 บรรทัด)
│           ├── WOReportPage.tsx                    # รายงาน (1419 บรรทัด)
│           ├── App.tsx                             # Menu + routing (457 บรรทัด)
│           └── admin/
│               ├── ProductsAdmin.tsx
│               ├── ScalesAdmin.tsx
│               ├── MachinesAdmin.tsx
│               ├── UsersAdmin.tsx
│               └── CsvImport.tsx
├── backend-spring/                                 # Spring Boot 3.5 + Java 21
│   └── src/main/java/com/example/eikensystem/
│       ├── domain/      (entities)
│       ├── repo/        (JPA repositories)
│       ├── service/
│       ├── web/         (controllers)
│       ├── security/    (JWT + filter)
│       └── config/      (DataInitializer, WebSecurityConfig)
├── db-migration/                                   # SQL migration files
├── TODO.md                                         # 📖 SPEC ฉบับเต็ม (อ่านก่อนทำ)
├── MANUAL.md                                       # User manual
├── WORKFLOW.md                                     # Flow diagrams
└── README.md                                       # Setup docs
```

**Stack:**
- Backend: Spring Boot 3.5 / Java 21 / MS SQL Server / JJWT / Yubico WebAuthn
- Frontend: React 18 / Vite / TypeScript / Ant Design 5 / recharts / axios

---

## 📋 รายการ Feature ทั้งหมด (12 ข้อ)

| # | Role | Feature | Priority | Depends on |
|---|------|---------|:--------:|:----------:|
| 1 | Operator | Dropdown WO แสดง Machine/Product/Lot | Low | — |
| 2 | QA | Apply Std — Disable inputs, แก้แค่เหตุผล | Med | — |
| 3 | QA | Tag YELLOW ×5 สีตาม classification | Low | — |
| 4 | Leader+QA | RED Event ปลดล็อคได้แค่ QA | **High** | — |
| 5 | Report | แยกสี Tag ตามประเภท/สถานะ | Low | — |
| 6 | Dashboard | จำนวนหลอดที่ชั่ง | Med | — |
| 7 | Leader | เพิ่ม targetTubes ใน WO | Med | — |
| 8 | Operator | Outer actual/Target | Med | 7 |
| 9 | Dashboard | กราฟ Efficiency % | Med | 6, 7 |
| 10 | Management | Role ใหม่ Read-only | **High** | — |
| 11 | Op+Admin | Sorting reason dropdown | Med | — |
| 12 | Op+Admin | Outer Approver per Product | **High** | — |

---

## 🔢 ลำดับการพัฒนา (Implementation Order)

> ทำตามลำดับ **Phase 1 → Phase 6** ห้ามข้าม ห้ามทำพร้อมกันถ้าไม่ระบุชัด

### Phase 1: Security & Critical Fix (ต้องทำก่อน)

#### Step 1.1 — ข้อ 4: RED Event ปลดล็อคได้แค่ QA
- **Frontend:** `frontend/src/ui/LeaderDashboard.tsx:423-437`
  - ในตอน render column "ดำเนินการ" → ถ้า `row.type === 'RED_EVENT'` ให้แสดง `<Tag color="orange">⏳ รอ QA ปลดล็อค</Tag>` แทนปุ่ม "อนุมัติ"
- **Backend:** `backend-spring/src/main/java/com/example/eikensystem/web/ApprovalController.java`
  - ที่ endpoint POST approve → ถ้า `approval.type == RED_EVENT` ตรวจว่า user มี role QA เท่านั้น → ถ้าไม่มี return 403
- **Docs:** อัปเดต `WORKFLOW.md:140,296` และ `MANUAL.md §5.2, §6.1, §15` ตามที่ระบุใน TODO.md ข้อ 4.4

#### Step 1.2 — ข้อ 10: Role MANAGEMENT (Read-only)
- **Backend:**
  - `domain/Role.java` → เพิ่ม enum `MANAGEMENT`
  - `config/WebSecurityConfig.java` → อนุญาต GET endpoints (leader-pending, qa-pending, qa-red-pending, machines/status, reports/*, work-orders, measurements) ให้ MANAGEMENT
  - **ห้าม** อนุญาต POST/PUT/DELETE ใด ๆ ให้ MANAGEMENT
- **Frontend:**
  - `frontend/src/ui/App.tsx:253-268` (menu) → เพิ่ม `|| isMgmt` ในเงื่อนไข QA Dashboard, Leader Dashboard, รายงาน WO
  - `App.tsx:346-380` (render guard) → ส่ง prop `readOnly={isMgmt}` ลง LeaderDashboard และ QADashboard
  - `LeaderDashboard.tsx` + `QADashboard.tsx` → รับ prop `readOnly` และซ่อนปุ่ม action ทั้งหมดเมื่อ true (เก็บข้อมูล/ปุ่ม refresh/report ไว้)
  - `frontend/src/ui/admin/UsersAdmin.tsx` → เพิ่ม `MANAGEMENT` ใน role dropdown
- **Docs:** เพิ่ม row MANAGEMENT ใน `MANUAL.md §2`

---

### Phase 2: Master Data & Schema (ฐานข้อมูล)

#### Step 2.1 — ข้อ 12: Outer Approver per Product
1. DB migration: `db-migration/V00x__add_outer_approver_to_product.sql`
   ```sql
   ALTER TABLE products ADD outer_approver_role VARCHAR(20) NOT NULL DEFAULT 'QA';
   ALTER TABLE products ADD outer_approver_note NVARCHAR(500) NULL;
   ALTER TABLE products ADD CONSTRAINT CK_products_outer_approver_role
     CHECK (outer_approver_role IN ('QA', 'OPERATOR', 'LEADER'));
   ```
2. DB migration: `V00y__create_outer_inspections.sql` — สร้างตาราง `outer_inspections` ตาม schema ใน TODO.md ข้อ 12.5
3. **Backend:**
   - `domain/Product.java` → เพิ่ม `outerApproverRole`, `outerApproverNote`
   - `domain/OuterInspection.java` (ใหม่) → ตาม schema
   - `repo/OuterInspectionRepo.java` (ใหม่)
   - `web/ApprovalController.java` → แก้ logic `/api/approvals/outer-inspection` ให้ branch ตาม Product.outerApproverRole:
     - `QA` → สร้าง Approval ปกติ (approverRole=QA)
     - `OPERATOR` → บันทึก OuterInspection ทันที (status=AUTO_APPROVED) + return `{ selfChecked: true, note }`
     - `LEADER` → สร้าง Approval (approverRole=LEADER)
4. **Frontend:**
   - `frontend/src/ui/admin/ProductsAdmin.tsx` → เพิ่ม Form.Item `outerApproverRole` (Select: QA/Operator/Leader) + `outerApproverNote` (TextArea) + column ใน table
   - `frontend/src/ui/MeasurementEntry.tsx:1202-1224` → handle response ทั้ง 2 case (selfChecked vs pending) แสดงข้อความให้ Operator
   - `frontend/src/ui/LeaderDashboard.tsx` → รองรับ type=OUTER_INSPECTION ใน column ดำเนินการ → เปิด Modal approve พร้อมแสดง `approverNote` เป็น warning callout
   - `frontend/src/ui/QADashboard.tsx` → แสดง `approverNote` เป็น callout warning ใน Modal Approve Outer ถ้ามี
   - `frontend/src/ui/admin/CsvImport.tsx` + `service/AdminImportService.java` → mapping `Outer Approve` จาก CSV/Excel:
     - ถ้าเป็น `QA`/`Operator`/`Leader` → `outer_approver_role`
     - ถ้าเป็นข้อความอื่น → `outer_approver_note` + role = `QA` (default)
5. **Docs:** อัปเดต `WORKFLOW.md §10` และ `MANUAL.md §4.6, §15` ตามที่ระบุใน TODO ข้อ 12.12

#### Step 2.2 — ข้อ 11: Sorting Reasons Master
1. DB migration: `V00z__create_sorting_reasons.sql` ตาม schema ใน TODO.md ข้อ 11.2
2. DB migration: `V00w__add_reason_code_to_change_logs.sql`
   ```sql
   ALTER TABLE change_logs ADD reason_code VARCHAR(32) NULL;
   ALTER TABLE change_logs ADD reason_note NVARCHAR(500) NULL;
   ```
3. **Backend:**
   - `domain/SortingReason.java` (ใหม่)
   - `repo/SortingReasonRepo.java` (ใหม่) — มี method `findByIsActiveTrueOrderBySortOrderAsc()`, `findByIsActiveTrueAndScopeIn(...)`
   - `web/SortingReasonController.java` (ใหม่) — endpoints:
     - `GET /api/sorting-reasons?scope=BULK|SINGLE|BOTH` — public (auth required) สำหรับ Operator
     - `GET /api/admin/sorting-reasons` — DATA_ADMIN เท่านั้น
     - `POST/PUT/DELETE /api/admin/sorting-reasons[/{id}]` — DATA_ADMIN เท่านั้น (soft delete = set is_active=false)
   - `MeasurementController.java` / `web/Controller.java` ที่รับ relocate/reweigh → รับ `reasonCode` + `reasonNote` แทน `reason` (เก็บทั้ง 3 fields)
4. **Frontend:**
   - `frontend/src/ui/admin/SortingReasonsAdmin.tsx` (ใหม่) — CRUD table + Modal
   - `frontend/src/ui/AdminData.tsx` → เพิ่ม tab "เหตุผลการแก้ไข Sorting"
   - `frontend/src/ui/SortingPage.tsx` →
     - บรรทัด 412-413 (Bulk): เปลี่ยน `<Input>` → `<Select>` พร้อม conditional `<Input>` สำหรับ note ถ้า `requires_note`
     - บรรทัด 665-668 (Single): เปลี่ยน `<Input.TextArea>` → `<Select>` + conditional note
     - validation (บรรทัด 250, 306): check `!reasonCode` + `requires_note && !reasonNote.trim()`
     - submit (บรรทัด 271, 314): ส่ง `{ reasonCode, reasonNote }` แทน `{ reason }`
5. **Seed data** ใน `DataInitializer.java` (profile `!prod`): seed 7 reasons ตัวอย่างจาก TODO.md ข้อ 11.2

#### Step 2.3 — ข้อ 7: targetTubes ใน Work Order
1. DB migration: `V00v__add_target_tubes_to_work_order.sql`
   ```sql
   ALTER TABLE work_orders ADD target_tubes INT NULL;
   ```
2. **Backend:**
   - `domain/WorkOrder.java` → เพิ่ม `targetTubes: Integer`
   - `web/WorkOrderController.java` → รับ-ส่ง field ใน request/response
3. **Frontend:**
   - `frontend/src/ui/WorkOrderManagement.tsx`
     - บรรทัด 43-48: เพิ่ม `targetTubes?: number` ใน `WorkOrder` type
     - หลังบรรทัด 440 (ใต้ Lot No.): เพิ่ม `<Form.Item name="targetTubes">` พร้อม `<InputNumber>` (required, min=1)
     - แสดง preview "เป้าหมาย: X หลอด ≈ Y Outer" เป็น helper text
     - บรรทัด 145-150: ใส่ `targetTubes` ใน submit payload
     - บรรทัด 231: เพิ่ม column "Target (หลอด)" ในตาราง

---

### Phase 3: Operator UX

#### Step 3.1 — ข้อ 1: Dropdown WO แสดง Machine/Product/Lot
- ไฟล์: `frontend/src/ui/MeasurementEntry.tsx:1627`
- เปลี่ยน label format:
  ```tsx
  label: `Machine: ${wo.machine?.machineName ?? wo.scale?.scaleName ?? wo.scaleId ?? '-'} | Product: ${wo.product?.productCode ?? '-'} | Lot: ${wo.lotNo}`,
  ```
- เพิ่ม `showSearch` + `filterOption` ใน Select เพื่อให้ค้นหาได้

#### Step 3.2 — ข้อ 8: Outer Actual / Target (ต้องทำ Step 2.3 ก่อน)
- ไฟล์: `frontend/src/ui/MeasurementEntry.tsx:1934-1956`
- เพิ่ม Card "Outer actual / Target" ข้างปุ่มแก้ไข
- **สูตร Outer Target:**
  ```
  outerTarget = ⌈ targetTubes / (innerBoxQuantity × quantityPerMeasurement) ⌉
  ```
- **สูตร Outer Actual (สำคัญ! ห้ามใช้ currentOuter-1):**
  ```tsx
  const innerByOuter = new Map<string, Set<string>>()
  for (const m of measurements) {
    if (m.isForStandardAdjustment) continue  // ข้าม barrier
    const o = m.outerBoxNumber
    if (!o) continue
    if (!innerByOuter.has(o)) innerByOuter.set(o, new Set())
    innerByOuter.get(o)!.add(m.innerBoxOrder)
  }
  const outerActual = Array.from(innerByOuter.values())
    .filter(s => s.size >= innerPerOuter).length
  ```
- ทางเลือก: สร้าง backend endpoint `GET /api/measurements/outer-progress?lotNo=X&scaleId=Y` ถ้า measurements ไม่อยู่ใน state
- แสดงรูปแบบ `003 / 010` (zero-padded 3 หลัก)
- Color: เขียวถ้ายังไม่ครบ, เหลืองถ้าครบเป้า, แดงถ้าเกิน

---

### Phase 4: QA Dashboard Improvements

#### Step 4.1 — ข้อ 2: Apply Std Disable Inputs
- ไฟล์: `frontend/src/ui/QADashboard.tsx:407-663`
- Set `disabled` ทุก number input:
  - บรรทัด 549 (Std ใหม่)
  - บรรทัด 557, 563 (Std 1, Std 2 — DOUBLE)
  - บรรทัด 589-592 (Min/Max/DMin/DMax loop)
- คงเฉพาะ `เหตุผล` ที่แก้ได้
- ลบปุ่ม "ใช้คำแนะนำทั้งหมด" (บรรทัด 441)
- ปุ่ม "Apply Std" (บรรทัด 663): disable เมื่อ `!inputVal.reason.trim()`

#### Step 4.2 — ข้อ 3: Tag YELLOW ×5 สีตาม classification
- ไฟล์: `frontend/src/ui/QADashboard.tsx:499` (SINGLE) และ `:519` (DOUBLE)
- เปลี่ยน `color="blue"` → ฟังก์ชันคำนวณตามค่า:
  - GREEN (`color="green"`): `DMin ≤ w ≤ DMax`
  - YELLOW (`color="gold"`): ระหว่าง Min/DMin หรือ DMax/Max
  - RED (`color="red"`): นอก Min/Max
- ใช้ค่า Std/wpp จาก `payload.proposedStd` + `wpp` คำนวณ Min/Max/DMin/DMax ตามสูตรในข้อ 3
- ถ้า `payload.weights5Status[]` มา → ใช้จาก payload โดยตรง

---

### Phase 5: Dashboard Enhancements (ต้องทำ Step 2.1, 2.3 ก่อน)

#### Step 5.1 — ข้อ 6: จำนวนหลอดที่ชั่ง
- **Backend:** เพิ่ม `measurementCount` (COUNT DISTINCT outer|inner ไม่นับ barrier) ใน MachineStatus DTO
- **Frontend:**
  - `LeaderDashboard.tsx:488-570` → เพิ่ม column "จำนวนหลอด" (`count × quantityPerMeasurement`)
  - บรรทัด 473-477 → เพิ่ม Card "ผลผลิตรวมวันนี้ (หลอด)"
  - `QADashboard.tsx` → เพิ่มข้อมูลเดียวกัน

#### Step 5.2 — ข้อ 9: กราฟ Efficiency %
- ใช้ antd `<Progress>` แนวนอน + ตัวเลขใต้
- ใส่ column ใหม่ "ประสิทธิภาพ" ถัดจาก Machine (LeaderDashboard.tsx, QADashboard.tsx)
- Color logic:
  - ≥100% เขียว, 75-99% น้ำเงิน, 50-74% เหลือง, <50% แดง
- เพิ่ม Card "ประสิทธิภาพรวม" ใน summary (สูตร `(totalActual/totalTarget)×100`)
- **Backend:** เพิ่ม `targetTubes`, `measurementCount`, `greenCount`, `yellowCount`, `redCount` ใน MachineStatus DTO

---

### Phase 6: Report & Polish

#### Step 6.1 — ข้อ 5: แยกสี Tag ใน บันทึกกิจกรรม
- ไฟล์: `frontend/src/ui/WOReportPage.tsx:1099-1132`
- ขยาย column width จาก 170 → 200
- แทนที่ render ปัจจุบันด้วย mapping เต็มตาม TODO.md ข้อ 5.1:
  - `ชั่งน้ำหนัก` + GREEN/YELLOW/RED status → `green`/`gold`/`red`
  - `RED_EVENT` → `red`
  - `STD_CHANGE` → `volcano`
  - `STD_CHANGE_REQUEST` → `gold`
  - `OUTER_INSPECTION` → `geekblue`
  - `QA_OUTER_REWEIGH` → `purple`
  - `MEASUREMENT_REWEIGH` → `blue`
  - `BOX_RELOCATE` → `orange`
  - `CLEANING_CHECK` → `cyan`
  - `APPROVAL_*` → `magenta`
- **แนะนำ:** สร้าง util `frontend/src/ui/activityTypeTag.tsx` ที่ export `renderActivityTag(type, measurement?)` แล้วใช้ใน WOReportPage + LeaderDashboard + QADashboard เพื่อให้สีตรงกันทั้งระบบ

---

## ✅ Completion Checklist (ทำเสร็จแล้วต้องเช็ค)

### โครงสร้าง DB ใหม่
- [ ] `products`: เพิ่ม `outer_approver_role`, `outer_approver_note`
- [ ] `work_orders`: เพิ่ม `target_tubes`
- [ ] `change_logs`: เพิ่ม `reason_code`, `reason_note`
- [ ] `sorting_reasons`: ตารางใหม่
- [ ] `outer_inspections`: ตารางใหม่

### Backend Files ใหม่
- [ ] `domain/OuterInspection.java`
- [ ] `domain/SortingReason.java`
- [ ] `repo/OuterInspectionRepo.java`
- [ ] `repo/SortingReasonRepo.java`
- [ ] `web/SortingReasonController.java`
- [ ] `Role.java` — เพิ่ม MANAGEMENT enum

### Backend Files ที่แก้
- [ ] `domain/Product.java` — 2 fields ใหม่
- [ ] `domain/WorkOrder.java` — targetTubes
- [ ] `web/ApprovalController.java` — RED Event role check + Outer Inspection branch logic
- [ ] `web/WorkOrderController.java` — รับ targetTubes
- [ ] `web/MeasurementController.java` — รับ reasonCode/reasonNote
- [ ] `config/WebSecurityConfig.java` — MANAGEMENT GET permissions
- [ ] `service/AdminImportService.java` — CSV mapping Outer Approve

### Frontend Files ใหม่
- [ ] `ui/admin/SortingReasonsAdmin.tsx`
- [ ] `ui/activityTypeTag.tsx` (util)

### Frontend Files ที่แก้
- [ ] `ui/App.tsx` — MANAGEMENT menu + render guard
- [ ] `ui/MeasurementEntry.tsx` — Dropdown label (1627), Outer actual/Target (1934-1956), Outer Inspection response handling (1202-1224)
- [ ] `ui/SortingPage.tsx` — Reason dropdown (412-413, 665-668)
- [ ] `ui/LeaderDashboard.tsx` — RED Event tag (423-437), readOnly mode, OUTER_INSPECTION action, จำนวนหลอด, Efficiency column
- [ ] `ui/QADashboard.tsx` — Apply Std disable (407-663), YELLOW ×5 colors (499, 519), readOnly mode, จำนวนหลอด, Efficiency column, approverNote callout
- [ ] `ui/WorkOrderManagement.tsx` — targetTubes form + column + type
- [ ] `ui/WOReportPage.tsx` — แยกสี Tag (1099-1132)
- [ ] `ui/admin/ProductsAdmin.tsx` — Outer Approver fields
- [ ] `ui/admin/UsersAdmin.tsx` — MANAGEMENT role option
- [ ] `ui/admin/CsvImport.tsx` — Outer Approve column
- [ ] `ui/AdminData.tsx` — เพิ่ม tab Sorting Reasons

### Documentation
- [ ] `WORKFLOW.md:140, 296` — RED Event approver = QA
- [ ] `WORKFLOW.md §10` — Outer Inspection branch
- [ ] `MANUAL.md §2` — เพิ่ม MANAGEMENT role
- [ ] `MANUAL.md §4.6` — Outer Inspection dynamic approver
- [ ] `MANUAL.md §5.2` — Leader Dashboard ไม่มี RED action
- [ ] `MANUAL.md §6.1` — QA Dashboard RED exclusive
- [ ] `MANUAL.md §15` — Approval Types matrix อัปเดต

---

## ⚠️ ข้อควรระวัง (พบใน TODO บ่อย — อ่านให้ตี้)

### 🚫 ห้ามใช้สูตร `currentOuter - 1` (ข้อ 6, 8)
เลข Outer อาจกระโดดข้าม (เช่น 001 → 002 → 005 → 008) → ต้องใช้การนับ distinct `(outer, inner)` จาก measurement records จริง โดย **ข้าม barrier records** (`isForStandardAdjustment = true`)

### 🔒 Security ของ RED Event (ข้อ 4)
ต้องตรวจที่ **backend** ด้วย — ไม่ใช่แค่ซ่อนปุ่มที่ frontend (กัน bypass UI ยิง API ตรง)

### 🎨 ห้ามใช้สีซ้ำ (ข้อ 5)
ห้ามใช้ `red`/`gold`/`green` กับประเภทอื่นนอกจาก measurement status (ป้องกันสับสนกับ traffic light)

### 📦 OPERATOR self-check ของ Outer Inspection (ข้อ 12)
ไม่สร้าง Approval row — สร้าง `OuterInspection` row ตรง ๆ ด้วย `status='AUTO_APPROVED'` แล้ว return `{ selfChecked: true }` ให้ frontend แสดงข้อความ "✓ ตรวจเองสำเร็จ"

### 🗃️ Backward compatibility (ข้อ 11)
ฟิลด์ `reason` (text เดิม) ใน `change_logs` ยังคงไว้ และเขียนค่า `label_th + note` ลงด้วย — เผื่อรายงานเก่าใช้

### 👁 MANAGEMENT = Read-only เท่านั้น (ข้อ 10)
- ❌ ห้าม POST/PUT/DELETE ใด ๆ
- ❌ ห้ามเห็นเมนู Operator, Admin, Work Order management
- ✅ เห็นได้แค่ Leader Dashboard, QA Dashboard, รายงาน WO

---

## 🧪 Testing Plan (ต้องทดสอบหลัง implement)

### Phase 1 (Security):
1. Login Leader → เปิด Leader Dashboard → ดู RED Event row → **ต้องไม่มีปุ่มอนุมัติ** เห็น "⏳ รอ QA ปลดล็อค"
2. Login Leader → ยิง API `POST /api/approvals/{id}/approve` กับ RED_EVENT → **ต้องได้ 403**
3. Login QA → ทำเหมือน 1+2 → **ต้องอนุมัติได้ปกติ**
4. Login MANAGEMENT user → ดู menu → **ต้องเห็น Leader/QA Dashboard + Report เท่านั้น** ปุ่ม action ทั้งหมดต้องไม่แสดง

### Phase 2 (Master Data):
5. Set Product.outerApproverRole = OPERATOR → Operator ชั่งครบ Outer → **ไม่มี approval สร้าง** แต่มี OuterInspection row + แสดง "✓ ตรวจเองสำเร็จ"
6. Set Product.outerApproverRole = LEADER → ครบ Outer → **Approval สร้างให้ Leader Dashboard** + Leader กดอนุมัติได้
7. Set Product.outerApproverNote = "ชั่งชิ้นทั้งหมด..." + role=QA → ครบ Outer → **QA เห็น callout warning** ในหน้า approve
8. Import CSV ที่มี "Outer Approve" = "ชั่งน้ำหนักชิ้นทั้งหมด..." → **ต้องเก็บใน note, role=QA**
9. Operator Sorting → กดแก้ไข → **dropdown เหตุผล** ต้องโชว์ (ไม่ใช่ text input)
10. เลือกเหตุผลที่ `requires_note=true` → **field note ต้องโผล่** + บังคับกรอก
11. Leader สร้าง WO → กรอก targetTubes → **บันทึกได้** + table แสดง column ใหม่

### Phase 3 (Operator):
12. Operator dropdown WO → ต้องเห็นรูปแบบ `Machine: X | Product: Y | Lot: Z`
13. ชั่งจนกระโดด Outer (002 → 005) → Outer Actual / Target ต้อง**นับถูก** (ไม่ใช่ 5 แต่เป็น 2)

### Phase 4 (QA):
14. QA Dashboard → Apply Std card → ทุก input เลขต้อง **disabled** มีแต่ field เหตุผลเขียนได้
15. ค่า YELLOW ×5 — แต่ละ Tag ต้องสีตาม classification (GREEN/YELLOW/RED ของค่านั้น)

### Phase 5 (Dashboard):
16. Machine Status table — column "จำนวนหลอด" + "ประสิทธิภาพ %" ต้องโชว์ค่าถูก
17. Card "ผลผลิตรวม" + "ประสิทธิภาพรวม" ใน summary ต้องโชว์รวมจากทุก Machine

### Phase 6 (Report):
18. รายงาน WO → tab บันทึกกิจกรรม → row ทุกประเภทต้องมีสี Tag ต่างกัน
19. ชั่งน้ำหนัก GREEN/YELLOW/RED → 3 สี ต้องต่างกัน (ไม่ใช่สีเดียวเหมือนเดิม)

---

## 📝 Convention การ Commit

ใช้ Conventional Commits format:
- `feat(item-12): add outer approver routing per product`
- `fix(item-4): restrict RED event approval to QA role only`
- `refactor(item-5): extract activity tag mapping to util`
- `docs(workflow): update RED event flow for QA-only approval`

แต่ละ Phase commit แยกหรือต่อเนื่องตาม dependency

---

## 🚀 Start Here

ทำตามลำดับนี้:

1. อ่าน `TODO.md` ครบทุกข้อก่อนเริ่ม
2. ใช้ git branch แยก: `git checkout -b feature/phase-1-security`
3. Implement Phase 1 ทั้งหมด → test → commit → push
4. Repeat สำหรับ Phase 2-6 (branch ใหม่หรือต่อเนื่อง ตามที่ทีมเห็นเหมาะ)
5. หลังจบ Phase 6 → run full regression test ตาม Testing Plan
6. PR หลัก: รวม 6 Phase หรือเปิดทีละ Phase ตามที่ทีมตัดสินใจ

ถ้าเจอจุดที่ TODO.md ไม่ชัดเจน → **อ่านโค้ดที่ระบุ file:line ตามที่ TODO ชี้** → ห้ามเดา

ทุกการเปลี่ยน DB schema ต้องมี migration file ใน `db-migration/` + อัปเดต Spring Boot entity ให้ตรงกัน

===== PROMPT END =====

---

## 📦 วิธีใช้ใน VSCode

### วิธีที่ 1: ใช้ prompt ทั้งก้อน
1. Copy ข้อความระหว่าง `===== PROMPT START =====` ถึง `===== PROMPT END =====`
2. Paste ใน Claude Code / Copilot chat ของ VSCode
3. AI จะอ่าน TODO.md อัตโนมัติเป็น spec แล้วเริ่มทำตาม Phase 1

### วิธีที่ 2: ทำทีละข้อ
ใช้ prompt สั้นแทน:
```
อ่าน TODO.md ข้อ <X> + IMPLEMENTATION_PROMPT.md Step <Y.Z>
แล้ว implement ตามนั้นทั้งหมด — backend + frontend + migration + test + docs
อย่าทำข้ามไปข้ออื่น
```

### วิธีที่ 3: ทำทีละ Phase
```
ทำ Phase <N> ใน IMPLEMENTATION_PROMPT.md ทั้งหมดให้เสร็จ
ก่อนเริ่ม commit checklist ที่ใส่ไว้ว่าครบทุก step แล้ว
```

---

## 🔗 ไฟล์อ้างอิงในโปรเจกต์

| ไฟล์ | บทบาท |
|------|--------|
| `TODO.md` | **Spec ฉบับเต็ม** — รายละเอียดทุกข้อทุก field/line |
| `IMPLEMENTATION_PROMPT.md` | **ไฟล์นี้** — ลำดับการทำ + checklist |
| `MANUAL.md` | User manual (อัปเดตหลัง implement) |
| `WORKFLOW.md` | Flow diagrams (อัปเดตหลัง implement) |
| `README.md` | Setup guide |
| `EikenDetail.txt` | Original spec (Toyo Seikan) |
