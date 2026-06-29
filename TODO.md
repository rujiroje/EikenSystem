# Eikensystem — TODO / รายการแก้ไข

> รายการที่ต้องแก้ไขใน Application แยกตาม Role
> ใช้สำหรับสร้าง prompt ต่อใน VSCode

---

## Role: Operator

### 1. Dropdown เลือก Work Order — แสดง Machine, Product, Lot No.

**ไฟล์:** `frontend/src/ui/MeasurementEntry.tsx:1627`

**ปัจจุบัน:**
```tsx
label: `WO#${wo.workOrderId} — ${wo.product?.productCode} | Lot: ${wo.lotNo}${wo.line ? ' | ' + wo.line : ''}`,
```
แสดง: `WO#11 — 105074 | Lot: 20260411-01`

**ต้องการ:**
แสดงข้อมูลเป็น **Machine, Product, Lot No.** ตามลำดับ

```tsx
label: `Machine: ${wo.machine?.machineName ?? wo.scale?.scaleName ?? wo.scaleId ?? '-'} | Product: ${wo.product?.productCode ?? '-'} | Lot: ${wo.lotNo}`,
```

ตัวอย่าง output: `Machine: Scale-A1 | Product: 105074 | Lot: 20260411-01`

---

## Role: QA

### 2. Apply Std ใหม่ — Disable input ค่าตัวเลข ให้กรอกแค่ "เหตุผล"

**ไฟล์:** `frontend/src/ui/QADashboard.tsx`
**Section:** Card "รอ Apply Std ใหม่" (เริ่มบรรทัด 407)

**ปัจจุบัน:**
- ทุก field เป็น text input ที่แก้ตัวเลขได้:
  - `Std ใหม่` — บรรทัด 549
  - `Std 1` / `Std 2` (DOUBLE mode) — บรรทัด 557, 563
  - `Min`, `Max`, `DMin`, `DMax` — render ผ่าน loop บรรทัด 589-592
  - `เหตุผล` — text input (แก้ได้)
- QA สามารถพิมพ์ตัวเลขใหม่ทับค่า Proposed Std ที่ระบบคำนวณได้

**ต้องการ:**
- **Disable** input ทั้งหมดที่เป็นตัวเลข (อ่านอย่างเดียว):
  - `Std ใหม่`
  - `Std 1`, `Std 2` (DOUBLE)
  - `Min`, `Max`, `DMin`, `DMax`
- **เปิดแก้ได้เฉพาะ** field `เหตุผล`
- ค่าที่ใช้ตอน submit ให้ใช้ **Proposed Std** ที่ระบบคำนวณมาเท่านั้น (จาก `payload.proposedStd`, `payload.proposedStd1`, `payload.proposedStd2` และค่า Min/Max/DMin/DMax ที่คำนวณจากสูตร)
- ปุ่ม "ใช้คำแนะนำทั้งหมด" (บรรทัด 441) ไม่จำเป็นแล้ว — ลบทิ้งได้ เพราะค่ามาเองอัตโนมัติ
- ถ้า QA ไม่กรอก `เหตุผล` → disable ปุ่ม Apply Std

**หมายเหตุ:** ค่า initial มาจาก:
- `newStd` = `payload.proposedStd` (บรรทัด 417)
- `newStd1`/`newStd2` = `payload.proposedStd1`/`proposedStd2` (บรรทัด 418-419)
- `newMin/newMax/newDMin/newDMax` = สูตร `sugMin/sugMax/sugDMin/sugDMax` (บรรทัด 432-435)

---

### 3. แสดงสี Tag ค่าน้ำหนัก ใน "YELLOW ×5" ตามสถานะการชั่งจริง

**ไฟล์:** `frontend/src/ui/QADashboard.tsx`
**Section:** Card "รอ Apply Std ใหม่" → list "YELLOW ×5 — ค่าที่ใช้คำนวณ Std ใหม่"

**ปัจจุบัน:**
- ค่าน้ำหนัก 5 ค่า แสดงเป็น Tag สี **น้ำเงิน (blue) คงที่** — ไม่สอดคล้องกับชื่อหัวข้อ "YELLOW ×5"
- บรรทัด 499 (SINGLE mode):
  ```tsx
  <Tag key={i} color="blue" style={{ fontFamily:'monospace', fontSize:12 }}>
    {typeof w === 'number' ? w.toFixed(3) : String(w)}
  </Tag>
  ```
- บรรทัด 519 (DOUBLE mode): เหมือนกัน

**ต้องการ:**
แสดงสี Tag ของแต่ละค่าน้ำหนัก **ตามสถานะการชั่งจริง** (GREEN / YELLOW / RED) เหมือนที่ Operator เห็นตอนชั่ง

**Logic การกำหนดสี:**
- ใช้ค่า Std/Min/Max/DMin/DMax ที่ใช้ตอนชั่ง (ดูจาก payload หรือคำนวณจาก `payload.proposedStd` + `wpp`):
  - Min  = Std − wpp/2 + 1
  - Max  = Std + wpp/2 + 1
  - DMin = Std − wpp/4
  - DMax = Std + wpp/4
- เทียบค่าแต่ละ `w`:
  - 🟢 **GREEN** (`color="success"` หรือ `color="green"`): `DMin ≤ w ≤ DMax`
  - 🟡 **YELLOW** (`color="warning"` หรือ `color="gold"`): `(Min ≤ w < DMin)` หรือ `(DMax < w ≤ Max)`
  - 🔴 **RED** (`color="error"` หรือ `color="red"`): `w < Min` หรือ `w > Max`

**ตัวอย่าง (จาก screenshot):**
Std = 374.98, wpp = 7.5 → Min=372.23, Max=379.73, DMin=373.105, DMax=376.855
- 372.700 → YELLOW (อยู่ระหว่าง Min 372.23 และ DMin 373.105)
- 378.400 → YELLOW (อยู่ระหว่าง DMax 376.855 และ Max 379.73)

**แก้ทั้ง 2 จุด:** SINGLE mode (บรรทัด 499) และ DOUBLE mode (บรรทัด 519)

**หมายเหตุ:** ถ้า payload มี field บอก classification ของแต่ละค่ามาแล้ว (เช่น `payload.weights5Status: ['YELLOW', 'YELLOW', ...]`) ใช้จาก payload โดยตรงจะแม่นกว่า ถ้าไม่มี → คำนวณจากสูตรข้างบน

---

## Role: Leader + QA (Cross-role)

### 4. RED Event — Leader ห้ามปลดล็อค ให้ QA เป็นคนปลดล็อคเท่านั้น

**หัวใจของข้อนี้:**

> 🔒 **เฉพาะ QA เท่านั้นที่มีสิทธิ์ปลดล็อคสถานะ RED**
> 🚫 **Leader ห้ามปลดล็อค** — เปลี่ยนจาก "Leader ปลดได้" → "Leader เห็นเพื่อรับทราบเท่านั้น"
> 📢 **แจ้งเตือนยังคงไปทั้ง 2 Role** (Leader + QA เห็นรายการเหมือนเดิม)

#### 4.1 Matrix สิทธิ์ที่ต้องการ

| การกระทำ | Leader (เดิม) | Leader (ใหม่) | QA (เดิม) | QA (ใหม่) |
|----------|:-------------:|:-------------:|:---------:|:---------:|
| รับการแจ้งเตือน RED Event | ✅ | ✅ | ✅ | ✅ |
| เห็นรายการ RED Event ใน Dashboard | ✅ | ✅ | ✅ | ✅ |
| **กดอนุมัติ / ปลดล็อค RED** | ✅ | ❌ **ห้าม** | ✅ | ✅ |
| เห็นข้อความว่า "รอ QA อนุมัติ" | — | ✅ | — | — |

#### 4.2 สถานะปัจจุบัน

- ระบบสร้าง `RED_EVENT` approval อัตโนมัติเมื่อ Operator ชั่งได้ RED
- ทั้ง Leader และ QA เห็นและ**กดอนุมัติได้ทั้งคู่** (ซึ่งคือสิ่งที่ต้องแก้):
  - **Leader Dashboard** — ดึงจาก `/api/approvals/leader-pending` → ปุ่ม "อนุมัติ" ที่ `frontend/src/ui/LeaderDashboard.tsx:436` (เงื่อนไขแสดงปุ่ม: บรรทัด 424)
  - **QA Dashboard** — ดึงจาก `/api/approvals/qa-red-pending` → ปุ่ม "อนุมัติ RED" ที่ `frontend/src/ui/QADashboard.tsx:878-942`

#### 4.3 สิ่งที่ต้องแก้

**4.3.1 Frontend — Leader Dashboard (ปิดปุ่มอนุมัติของ Leader)**

ไฟล์: `frontend/src/ui/LeaderDashboard.tsx:423-437` (column "ดำเนินการ")

ปัจจุบัน:
```tsx
{ title: 'ดำเนินการ', width: 130, render: (_: any, row: Approval) => {
  if (row.status !== 'PENDING' || row.approverRole !== 'LEADER') return null
  if (row.type === 'CLEANING_CHECK') { ... }
  return <Button type="primary" size="small" onClick={() => openApprove(row)}>อนุมัติ</Button>
}}
```

แก้เป็น: ถ้า `row.type === 'RED_EVENT'` → **ห้ามแสดงปุ่ม Leader** แทนด้วย Tag "⏳ รอ QA อนุมัติ"
```tsx
{ title: 'ดำเนินการ', width: 130, render: (_: any, row: Approval) => {
  if (row.status !== 'PENDING') return null

  // ── RED Event: Leader ดูเฉย ๆ — ห้ามกด — รอ QA ปลดล็อค ──
  if (row.type === 'RED_EVENT') {
    return <Tag color="orange">⏳ รอ QA ปลดล็อค</Tag>
  }

  if (row.approverRole !== 'LEADER') return null
  if (row.type === 'CLEANING_CHECK') { ... }
  return <Button type="primary" size="small" onClick={() => openApprove(row)}>อนุมัติ</Button>
}}
```

**4.3.2 Frontend — QA Dashboard (คงเดิม ไม่ต้องแก้)**

ปุ่ม "อนุมัติ RED" ของ QA ที่ `QADashboard.tsx:878-942` ยังใช้งานได้ปกติ — เป็น **สิทธิ์เดียวที่ปลดล็อคได้แล้ว**

**4.3.3 Backend — ตรวจ Role ที่ Endpoint ปลดล็อค (สำคัญ! กัน bypass UI)**

ไฟล์: `backend-spring/src/main/java/com/example/eikensystem/web/ApprovalController.java`

ที่ endpoint approve ของ approval ใด ๆ ต้องเพิ่มเงื่อนไข:
```java
@PostMapping("/{id}/approve")
public ResponseEntity<?> approve(@PathVariable Long id, @AuthenticationPrincipal UserDetails user) {
    Approval approval = approvalRepo.findById(id).orElseThrow(...);

    // ── RED Event: เฉพาะ QA เท่านั้นที่ปลดล็อคได้ ──
    if (approval.getType() == ApprovalType.RED_EVENT) {
        boolean isQa = user.getAuthorities().stream()
            .anyMatch(a -> a.getAuthority().equals("ROLE_QA"));
        if (!isQa) {
            return ResponseEntity.status(403).body(Map.of(
                "error", "Only QA can unlock RED events"
            ));
        }
    }
    // ... ดำเนินการ approve ต่อ
}
```

> ⚠️ **ต้องมีการตรวจฝั่ง backend** เพื่อกันคนที่อาจ bypass UI แล้วยิง API ตรง — frontend hide button อย่างเดียวไม่พอ

**4.3.4 Backend — Endpoint leader-pending (คงเดิม ไม่ต้องแก้)**

- ยังคง return RED_EVENT records ให้ Leader Dashboard เห็น (เพื่อแจ้งเตือน)
- ทางที่ง่ายสุด: คง `approverRole = LEADER` ของ RED_EVENT ตามเดิม
- frontend (ตามข้อ 4.3.1) จะ filter ปุ่มออกเอง

#### 4.4 ผลกระทบ Documentation

- **WORKFLOW.md บรรทัด 140** — เปลี่ยน:
  ```
  จาก: สร้าง RED_EVENT approval (type=RED_EVENT, approverRole=LEADER)
  เป็น: สร้าง RED_EVENT approval (type=RED_EVENT, visibility=LEADER+QA, action_by=QA only)
  ```

- **WORKFLOW.md บรรทัด 296** — ตาราง Approval Types Summary แถว RED_EVENT:
  ```
  จาก: | RED_EVENT | OPERATOR | LEADER | Measurement = RED |
  เป็น: | RED_EVENT | OPERATOR | QA (Leader ดูได้แต่ปลดไม่ได้) | Measurement = RED |
  ```

- **MANUAL.md §15** "Approval Types Summary" — แก้ Approver ของ RED_EVENT จาก LEADER → **QA เท่านั้น** พร้อมหมายเหตุว่า Leader ยังเห็นแจ้งเตือน
- **MANUAL.md §5.2** (Leader Dashboard "งานรอดำเนินการ") — ลบ "RED Event" ออกจากรายการสิ่งที่ Leader อนุมัติได้ ย้ายไปเป็นข้อมูลเฉย ๆ
- **MANUAL.md §6.1** (QA Dashboard) — ยืนยันว่า RED Event approval = **สิทธิ์เฉพาะ QA**

---

### 5. รายงาน "บันทึกกิจกรรม" — แยกสีตามประเภท / สถานะให้ชัดเจน

**ไฟล์:** `frontend/src/ui/WOReportPage.tsx:1099-1132` (Tab "บันทึกกิจกรรม")
**Column ที่แก้:** "ประเภท" (บรรทัด 1110-1121)

**ปัจจุบัน:**
```tsx
{
  title: 'ประเภท', dataIndex: 'type', width: 170,
  render: (t: string) => {
    if (t === 'ชั่งน้ำหนัก') return <Tag icon={<CheckCircleOutlined />}>ชั่งน้ำหนัก</Tag>  // ไม่มีสี
    if (t === 'STD_CHANGE') return <Tag icon={<ThunderboltOutlined />} color="volcano">เปลี่ยน Std</Tag>
    if (t === 'BOX_RELOCATE') return <Tag icon={<SwapOutlined />} color="orange">Sorting/Relocate</Tag>
    if (t === 'QA_OUTER_REWEIGH') return <Tag icon={<EditOutlined />} color="purple">QA Outer Inspect</Tag>
    if (t === 'MEASUREMENT_REWEIGH') return <Tag icon={<EditOutlined />} color="blue">Re-weigh</Tag>
    if (t.startsWith('APPROVAL')) return <Tag icon={<WarningOutlined />} color="purple">{t.replace('APPROVAL_', '')}</Tag>
    return <Tag>{t}</Tag>  // RED_EVENT, OUTER_INSPECTION, STD_CHANGE_REQUEST fallback มาที่นี่ → ไม่มีสี
  },
}
```

**ปัญหา:**
- `RED_EVENT` → fallback Tag ไม่มีสี (ควรเป็นสีแดง)
- `STD_CHANGE_REQUEST` → จับโดย `startsWith('APPROVAL')` ไม่ตรง → fallback
- `OUTER_INSPECTION` → fallback ไม่มีสี
- `ชั่งน้ำหนัก` → สีเดียวกันหมด ไม่บอก GREEN/YELLOW/RED ที่ระดับ Tag (สถานะอยู่ใน column รายละเอียดบรรทัด 1122-1128 แทน)

**ต้องการ:**
แต่ละประเภท / สถานะมีสี **ไม่ซ้ำกัน** เพื่อสแกนด้วยตาง่าย

#### 5.1 Color mapping (ข้อเสนอ)

| Type | สี Tag (antd) | Icon | คำอธิบาย |
|------|---------------|------|----------|
| `ชั่งน้ำหนัก` + status GREEN  | `green`  | ✓ | ผลชั่งปกติ |
| `ชั่งน้ำหนัก` + status YELLOW | `gold`   | ⚠ | ผลชั่งเฉียดเกณฑ์ |
| `ชั่งน้ำหนัก` + status RED    | `red`    | ✕ | ผลชั่งนอกเกณฑ์ |
| `RED_EVENT`                  | `red`    | 🔴 | RED approval |
| `STD_CHANGE` (applied)       | `volcano`| ⚡ | apply Std ใหม่ |
| `STD_CHANGE_REQUEST`         | `gold`   | 📝 | ขอเปลี่ยน Std (รออนุมัติ) |
| `OUTER_INSPECTION`           | `geekblue` | 📦 | ตรวจ Outer |
| `QA_OUTER_REWEIGH`           | `purple` | ✎ | QA ชั่งซ้ำ inner |
| `MEASUREMENT_REWEIGH`        | `blue`   | ✎ | Operator ชั่งซ้ำหลัง RED |
| `BOX_RELOCATE`               | `orange` | ⇄ | Sorting / Relocate |
| `CLEANING_CHECK`             | `cyan`   | 🧹 | ขอ Cleaning |
| `APPROVAL_*` อื่น ๆ          | `magenta`| ⚠ | catch-all approval |
| Fallback                     | `default`|    | ประเภทไม่รู้จัก |

> หมายเหตุ: ห้ามใช้สีซ้ำใน mapping เดียวกัน
> ห้ามใช้ `red`/`gold`/`green` กับประเภทอื่นที่ไม่ใช่ status ของการชั่ง (กันสับสนกับ traffic-light)

#### 5.2 การ implement

ดึง status ของการชั่งสำหรับ row ที่เป็น `ชั่งน้ำหนัก` (วิธีปัจจุบันที่บรรทัด 1124: `const m = realMeasurements.find(x => 'M' + x.measurementId === r.key)`) เพื่อใช้กำหนดสี Tag

ตัวอย่างโค้ดใหม่ (concept):
```tsx
{
  title: 'ประเภท', dataIndex: 'type', width: 200,
  render: (t: string, r: typeof activityRows[0]) => {
    if (t === 'ชั่งน้ำหนัก') {
      const m = realMeasurements.find(x => 'M' + x.measurementId === r.key)
      const s = m?.status
      if (s === 'GREEN')  return <Tag icon={<CheckCircleOutlined />} color="green">ชั่งน้ำหนัก · GREEN</Tag>
      if (s === 'YELLOW') return <Tag icon={<WarningOutlined />}     color="gold">ชั่งน้ำหนัก · YELLOW</Tag>
      if (s === 'RED')    return <Tag icon={<CloseCircleOutlined />} color="red">ชั่งน้ำหนัก · RED</Tag>
      return <Tag icon={<CheckCircleOutlined />}>ชั่งน้ำหนัก</Tag>
    }
    if (t === 'RED_EVENT')           return <Tag color="red" icon={<WarningOutlined />}>🔴 RED_EVENT</Tag>
    if (t === 'STD_CHANGE')          return <Tag icon={<ThunderboltOutlined />} color="volcano">เปลี่ยน Std</Tag>
    if (t === 'STD_CHANGE_REQUEST')  return <Tag icon={<EditOutlined />} color="gold">📝 ขอเปลี่ยน Std</Tag>
    if (t === 'OUTER_INSPECTION')    return <Tag icon={<InboxOutlined />} color="geekblue">📦 Outer Inspection</Tag>
    if (t === 'QA_OUTER_REWEIGH')    return <Tag icon={<EditOutlined />} color="purple">QA Outer Inspect</Tag>
    if (t === 'MEASUREMENT_REWEIGH') return <Tag icon={<EditOutlined />} color="blue">Re-weigh</Tag>
    if (t === 'BOX_RELOCATE')        return <Tag icon={<SwapOutlined />} color="orange">Sorting/Relocate</Tag>
    if (t === 'CLEANING_CHECK')      return <Tag icon={<ClearOutlined />} color="cyan">🧹 Cleaning</Tag>
    if (t.startsWith('APPROVAL'))    return <Tag icon={<WarningOutlined />} color="magenta">{t.replace('APPROVAL_', '')}</Tag>
    return <Tag>{t}</Tag>
  },
}
```

#### 5.3 ขยายผลไปที่อื่น (ถ้าทำได้)
- **MANUAL.md / WORKFLOW.md** — เพิ่ม legend สีไว้อ้างอิง
- **LeaderDashboard.tsx** column "ประเภท" (บรรทัด ~390) — ใช้ mapping เดียวกัน เพื่อให้สีตรงกันทั้งระบบ
- **QADashboard.tsx** — เช่นเดียวกัน
- พิจารณาแยก mapping เป็น util ไฟล์เดียว เช่น `frontend/src/ui/activityTypeTag.tsx` แล้ว import ใช้ทุกหน้า — ปรับครั้งเดียวเปลี่ยนทุกที่

#### 5.4 หมายเหตุการอ่านง่าย
- ใส่ icon emoji/SVG หน้าข้อความช่วยให้สแกนตาเร็วขึ้น
- ขนาดความกว้าง column "ประเภท" เพิ่มจาก 170 → 200 เพื่อรองรับข้อความที่ยาวขึ้น

---

### 6. Leader / QA Dashboard — แสดงจำนวน "หลอด" ที่ชั่งได้

**ไฟล์ที่เกี่ยวข้อง:**
- `frontend/src/ui/LeaderDashboard.tsx` — Card "สถานะเครื่องจักร (Machine Status)" (เริ่มบรรทัด 479)
- `frontend/src/ui/QADashboard.tsx` — section ภาพรวมเครื่องชั่ง (ทำให้แสดงข้อมูลเดียวกัน)

**สถานะปัจจุบัน:**
- Leader Dashboard แสดงตาราง Machine Status (LeaderDashboard.tsx:488-570) มี column:
  - Machine, Scale, Product / Lot, ตำแหน่งปัจจุบัน (Outer x / Inner y), สถานะล่าสุด, รายการรออนุมัติ, YELLOW ต่อเนื่อง, ต้องการดำเนินการ
- **ไม่มี** column / card บอกว่าผลิตได้ทั้งหมดกี่หลอด

**ต้องการ:**
เพิ่มการแสดงผล **จำนวนหลอดที่ชั่งได้** ในมุมมอง Leader และ QA Dashboard

#### 6.1 สูตรการคำนวณ (เวอร์ชันถูกต้อง — ไม่อิงเลข Outer)

> ⚠️ **ห้ามใช้** สูตรแบบ `(currentOuter - 1) × innerPerOuter + currentInner` เพราะเลข Outer อาจกระโดดข้าม (เช่น 001 → 002 → 005 → 008)

**ใช้การนับจริงจาก measurement records แทน:**
```
จำนวนหลอด = (จำนวน distinct (outerBox, innerOrder) ใน measurement records ของ Lot นี้)
           × Product.quantityPerMeasurement (Qty)
```

หรือเทียบเท่า:
```
จำนวนหลอด = (จำนวน measurement records ที่ valid)
           × Product.quantityPerMeasurement
```

#### 6.2 ตัวอย่างการคำนวณ
- ใน Lot มี measurement records: 14 records (outer/inner ไม่ซ้ำ ไม่นับ barrier/reweigh ซ้ำ)
- `quantityPerMeasurement = 50`
- จำนวนหลอด = 14 × 50 = **700 หลอด**

#### 6.3 จุดที่ต้องเพิ่ม

**6.3.1 Column ใหม่ใน Machine Status table** (LeaderDashboard.tsx ~บรรทัด 545 หรือ 558)
- ชื่อ column: **"จำนวนหลอด"** หรือ **"ผลผลิต (หลอด)"**
- แสดงเฉพาะแถวที่ `r.active === true` (ที่มี WO เดินอยู่)
- ใช้ `r.measurementCount` (เพิ่มใหม่ใน DTO ฝั่ง backend) × `r.product?.quantityPerMeasurement`
- ตัวอย่าง render:
  ```tsx
  {
    title: 'จำนวนหลอด', key: 'totalTubes', width: 110,
    render: (_: any, r: MachineStatus) => {
      if (!r.active) return <span style={{ color: '#bbb' }}>—</span>
      const count = r.measurementCount ?? 0
      const tubesPerInner = r.product?.quantityPerMeasurement ?? 0
      if (!tubesPerInner) return '-'
      return <b>{(count * tubesPerInner).toLocaleString()}</b>
    }
  }
  ```

**6.3.2 Summary card ที่ด้านบน Leader Dashboard** (รวมทุก machine)
- เพิ่ม Card ข้าง ๆ "Pending / Approved (Today) / Total Items" (LeaderDashboard.tsx ~บรรทัด 473-477)
- ใหม่: **"ผลผลิตรวมวันนี้ (หลอด)"** = ผลรวมจากทุก Machine ที่ active

**6.3.3 QA Dashboard**
- เพิ่มข้อมูลเดียวกันใน section ภาพรวมเครื่องชั่งของ QA (`QADashboard.tsx`)

#### 6.4 ข้อพิจารณา / Edge case (สำคัญ!)
- **Reweigh:** Inner เดียวถูกชั่งซ้ำ → นับครั้งเดียว → ใช้ `COUNT DISTINCT (outerBox, innerOrder)` ที่ฝั่ง backend
- **DOUBLE mode:** การชั่ง 2 ครั้งใน 1 inner ยังนับเป็น 1 inner record
- **Barrier Measurement:** record ที่ `isForStandardAdjustment = true` (outer=000, inner=RST1) → **ไม่นับ**
- **Outer กระโดดข้าม:** ไม่กระทบ เพราะนับจาก records จริง ไม่ใช่จากเลข Outer
- **Sorting / Relocate:** ไม่กระทบจำนวนหลอด ใช้ records ใน DB เป็นหลัก

#### 6.5 Backend (ต้องเพิ่ม)
- เพิ่ม field ใหม่ใน `MachineStatus` DTO:
  - `measurementCount: long` — จำนวน distinct (outer, inner) ของ Lot ปัจจุบัน (ไม่นับ barrier)
- Query ฝั่ง backend:
  ```sql
  SELECT COUNT(DISTINCT CONCAT(outer_box_number, '|', inner_box_order))
  FROM measurements
  WHERE lot_no = :lot
    AND scale_id = :scale
    AND product_code = :product
    AND COALESCE(is_for_standard_adjustment, FALSE) = FALSE
  ```
- หรือเพิ่ม field `innerBoxQuantity`, `quantityPerMeasurement` ใน DTO เพื่อให้ frontend คำนวณเอง

#### 6.6 หมายเหตุ
- ตรวจคำที่ใช้แสดงผลให้ตรงกับคำในโรงงาน — ถ้า "หลอด" ไม่ใช่คำมาตรฐาน เปลี่ยนเป็น "ชิ้น" / "Pcs" / "Units" ได้
- รูปแบบตัวเลข: `toLocaleString('th-TH')` เพื่อใส่ comma หลักพัน

---

### 7. Leader สร้าง WO — เพิ่มฟิลด์ "จำนวนหลอดที่ต้องการ" (Target Tubes)

**ไฟล์:** `frontend/src/ui/WorkOrderManagement.tsx`
**Section:** ฟอร์มสร้าง / แก้ไข WO (เริ่มบรรทัด 394, ช่อง Lot No. บรรทัด 438)

**ปัจจุบัน:**
WO Form ปัจจุบันมีฟิลด์:
- Product, Scale, Machine, Lot No., วันเริ่ม-สิ้นสุด, customStd / customStd1 / customStd2
- **ไม่มี** ฟิลด์ target tubes / quantity เป้าหมาย

**ต้องการ:**
เพิ่มฟิลด์ใหม่ **"จำนวนหลอดที่ต้องการ" (Target Tubes)** ในฟอร์มสร้าง WO เพื่อใช้คำนวณ Outer Target สำหรับ Operator (ดูข้อ 8)

#### 7.1 Frontend

**7.1.1 เพิ่ม Form.Item ใหม่ ใต้ Lot No.** (~ บรรทัด 440)
```tsx
<Form.Item
  name="targetTubes"
  label="จำนวนหลอดที่ต้องการ"
  rules={[{ required: true, message: 'กรุณากรอกจำนวนหลอดเป้าหมาย' }, { type: 'number', min: 1 }]}
>
  <InputNumber
    style={{ width: '100%' }}
    placeholder="เช่น 10000"
    addonAfter="หลอด"
    min={1}
    step={100}
  />
</Form.Item>
```

**7.1.2 แสดงตัวอย่าง Outer Target ใต้ฟิลด์** (helper text)
- คำนวณ live จาก: `Math.ceil(targetTubes / (innerBoxQuantity × quantityPerMeasurement))`
- แสดงเป็น `<Typography.Text type="secondary">` ใต้ input:
  ```
  เป้าหมาย: 10,000 หลอด ≈ 10 Outer (Inner ต่อ Outer = 20, หลอดต่อ Inner = 50)
  ```
- หมายเหตุ: นี่เป็น **estimate** เท่านั้น — Outer Target จริงนับจาก records (ดูข้อ 8)

**7.1.3 เพิ่มในรายการคอลัมน์ table** (~ บรรทัด 231)
- ใส่คอลัมน์ใหม่ "Target (หลอด)" หลัง Lot No.

**7.1.4 เพิ่ม field ใน WorkOrder type** (บรรทัด 43-48)
```tsx
type WorkOrder = {
  ...
  lotNo: string
  targetTubes?: number   // เพิ่ม
  customStd?: number
  ...
}
```

**7.1.5 ส่งใน submit payload** (บรรทัด 145-150)
```tsx
lotNo: wo.lotNo,
targetTubes: wo.targetTubes,   // เพิ่ม
customStd: wo.customStd,
```

#### 7.2 Backend (Spring Boot)

**7.2.1 เพิ่ม field ใน Entity** `backend-spring/src/main/java/com/example/eikensystem/domain/WorkOrder.java`
```java
@Column(name = "target_tubes")
private Integer targetTubes;
```

**7.2.2 DB migration**
- ไฟล์: `db-migration/V00x__add_target_tubes_to_work_order.sql`
```sql
ALTER TABLE work_orders ADD target_tubes INT NULL;
```

**7.2.3 อัพเดต DTO / Controller** `WorkOrderController.java`
- รับ field `targetTubes` ใน request body
- รวมใน response

#### 7.3 Operator ดึงข้อมูลใช้ (เชื่อมกับข้อ 8)
- เวลา Operator เลือก WO → field `targetTubes` มาด้วยใน WO payload
- เก็บใน state ของ MeasurementEntry เพื่อใช้คำนวณ Outer Target

---

### 8. Operator หน้าชั่งน้ำหนัก — แสดง Outer ที่ชั่งเสร็จ / Outer Target

**ไฟล์:** `frontend/src/ui/MeasurementEntry.tsx`
**Location:** กลุ่ม Outer/Inner display + ปุ่ม "แก้ไข" (บรรทัด 1934-1956)

**ปัจจุบัน:**
```tsx
{/* กลาง: Outer/Inner + ปุ่มแก้ไข (ใต้ตัวเลข) */}
<div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
    {/* กล่อง Outer */}
    {/* กล่อง Inner */}
  </div>
  <div style={{ marginTop:6, display:'flex', gap:8 }}>
    <Button type="primary" onClick={onEditBox} disabled={status==='RED'}>แก้ไข</Button>
  </div>
</div>
```

แสดงเฉพาะ Outer + Inner ปัจจุบัน + ปุ่ม **"แก้ไข"** ข้างใต้
**ไม่มี** ข้อมูลบอก progress

**ต้องการ:**
เพิ่มการแสดงผล **"Outer ที่ชั่งเสร็จ / Outer Target"** ข้าง ๆ ปุ่ม "แก้ไข" (หรือใต้กล่อง Outer)

#### 8.1 สูตรการคำนวณ (เวอร์ชันถูกต้อง)

> ⚠️ **ห้ามใช้** สูตร `outerActual = currentOuterNum - 1` เพราะเลข Outer อาจกระโดดข้าม (เช่น 001 → 002 → 005 → 008 — ผู้ใช้อาจข้าม Outer)

**Outer Target:**
```
Outer Target = ⌈ targetTubes / (innerBoxQuantity × quantityPerMeasurement) ⌉
            = ⌈ targetTubes / tubesPerOuter ⌉
```

**Outer Actual (ที่ชั่งเสร็จไปแล้ว) — ใช้การนับจริงจาก measurement records:**
```
สำหรับแต่ละ outerBox ใน Lot ปัจจุบัน:
  ถ้า COUNT(DISTINCT innerOrder) ≥ innerBoxQuantity → ถือว่า Outer นั้น "เสร็จแล้ว"

Outer Actual = จำนวน Outer ที่ "เสร็จแล้ว"
            (ไม่นับ Outer ปัจจุบันที่ยังชั่งไม่ครบ Inner)
```

#### 8.2 ตัวอย่าง (เลข Outer กระโดดข้าม)

สมมติ Lot ปัจจุบันมี measurement records (ไม่นับ barrier):
- Outer 001: Inner 0001–0020 (ครบ 20)
- Outer 002: Inner 0001–0020 (ครบ 20)
- Outer 005: Inner 0001–0020 (ครบ 20) ← กระโดดจาก 002
- Outer 008: Inner 0001–0014 (ยังไม่ครบ — Operator กำลังชั่ง)

ให้ `innerBoxQuantity = 20`:
- Outer ที่เสร็จแล้ว = **3** (Outer 001, 002, 005)
- Outer 008 ยังไม่นับ (ชั่ง 14 จาก 20)

ถ้า `targetTubes = 10000`, `quantityPerMeasurement = 50`:
- `tubesPerOuter = 20 × 50 = 1000`
- `Outer Target = ⌈ 10000 / 1000 ⌉ = 10`

**แสดง:** `003 / 010`

#### 8.3 UI Design

เพิ่ม Card สไตล์เดียวกับ mockup Excel — ใต้ปุ่ม "แก้ไข" หรือข้าง ๆ:

```tsx
<div style={{ marginTop:6, display:'flex', gap:8, alignItems:'center' }}>
  <Button type="primary" onClick={onEditBox} disabled={status==='RED'}>แก้ไข</Button>

  {/* ใหม่: Outer actual / Outer target */}
  {targetTubes != null && outerTarget > 0 && (
    <div style={{
      display:'flex', flexDirection:'column', alignItems:'center',
      padding:'4px 12px', borderRadius:8, background:'#f6ffed',
      border:'1px solid #b7eb8f', minWidth:130
    }}>
      <div style={{ fontSize:11, color:'#389e0d', fontWeight:600 }}>Outer actual / Target</div>
      <div style={{ fontSize:18, fontWeight:700, color:'#389e0d', fontVariantNumeric:'tabular-nums' }}>
        {String(outerActual).padStart(3,'0')} / {String(outerTarget).padStart(3,'0')}
      </div>
    </div>
  )}
</div>
```

#### 8.4 Logic ใน component (คำนวณจาก measurement data จริง)

```tsx
// ─── คำนวณ Outer Target จาก targetTubes ──────────────────────
const tubesPerOuter = (innerPerOuter ?? 0) * (tubesPerInner ?? 0)
const outerTarget = (targetTubes && tubesPerOuter)
  ? Math.ceil(targetTubes / tubesPerOuter)
  : 0

// ─── คำนวณ Outer Actual จาก measurement records (ไม่อิงเลข Outer) ──
// `measurements` คือ list ของ measurement records ของ Lot ปัจจุบัน (ที่ดึงมาจาก API)
const innerByOuter = new Map<string, Set<string>>()
for (const m of measurements) {
  // ข้าม barrier records
  if (m.isForStandardAdjustment) continue
  const o = m.outerBoxNumber
  if (!o) continue
  if (!innerByOuter.has(o)) innerByOuter.set(o, new Set())
  innerByOuter.get(o)!.add(m.innerBoxOrder)
}

const outerActual = Array.from(innerByOuter.values())
  .filter(innerSet => innerSet.size >= (innerPerOuter ?? Infinity))
  .length
```

#### 8.5 ตัวเลือก: ดึงจาก Backend (ลด computation ใน frontend)

ถ้า `measurements` ไม่อยู่ในหน้า Operator (เพื่อ performance) ให้เพิ่ม API:
- `GET /api/measurements/outer-progress?lotNo=X&scaleId=Y&productCode=Z`
- Response:
  ```json
  {
    "completedOuters": 3,
    "currentOuterInnerCount": 14,
    "innerBoxQuantity": 20
  }
  ```
- Frontend แค่ใช้ `completedOuters` เป็น `outerActual`

#### 8.6 Color logic (เสนอ)
- 🟢 เขียว: `outerActual < outerTarget` → ยังผลิตได้
- 🟠 เหลือง: `outerActual === outerTarget` → ครบเป้าแล้ว (ใกล้ปิด)
- 🔴 แดง: `outerActual > outerTarget` → เกินเป้า (เตือน Operator)

#### 8.7 Edge case
- WO ไม่มี `targetTubes` (สำหรับ WO เก่าที่สร้างก่อนเพิ่มฟิลด์) → ซ่อน card หรือแสดง "—"
- `targetTubes = 0` หรือ undefined → ซ่อน
- `tubesPerOuter = 0` (product config ขาด) → ซ่อน + log warning
- `innerBoxQuantity` ขาด → ไม่สามารถระบุได้ว่า "ครบ" หรือยัง → ซ่อน หรือใช้ข้อมูลล่าสุดที่มี

#### 8.8 หมายเหตุ
- ต้องทำข้อ 7 ก่อน (มี `targetTubes` ใน WO แล้ว)
- ค่า `innerPerOuter` (innerBoxQuantity) และ `tubesPerInner` (quantityPerMeasurement) อยู่ใน Product — ดึงตอนเลือก WO
- หลังบันทึก measurement ใหม่ → ต้อง re-compute `outerActual` (เพราะ Inner เพิ่งครบ → Outer อาจเสร็จเพิ่ม 1)

---

### 9. Leader / QA Dashboard — กราฟ Actual/Target % (Efficiency) ถัดจาก Machine

**ไฟล์:** `frontend/src/ui/LeaderDashboard.tsx` + `frontend/src/ui/QADashboard.tsx`
**Location:** Machine Status table (LeaderDashboard.tsx:488-570) — เพิ่ม column ใหม่ถัดจาก "Machine"

**ต้องการ:**
แสดง **% ประสิทธิภาพ (Actual/Target)** เป็นกราฟใน Machine Status table เพื่อให้ Leader/QA เห็นภาพรวมได้ทันที

#### 9.1 สูตรการคำนวณ

**ระดับ 1 — Production Progress (เรียบง่าย ทำได้ทันที):**
```
Actual = ผลผลิตจริง = measurementCount × quantityPerMeasurement (จากข้อ 6)
Target = เป้าหมาย   = targetTubes (จากข้อ 7)
Progress % = (Actual / Target) × 100
```

**ระดับ 2 — Quality Rate:**
```
Quality % = (GREEN count) / (Total measurements) × 100
```

**ระดับ 3 — OEE (เต็มรูปแบบ, ทำในเฟสถัดไป):**
```
OEE = Availability × Performance × Quality
- Availability = (เวลาเดินเครื่องจริง) / (เวลาที่วางแผน)
- Performance  = (ผลผลิตจริง × cycle time มาตรฐาน) / (เวลาเดินเครื่องจริง)
- Quality      = (GREEN) / (Total)
```
> 💡 เริ่มจากระดับ 1 (Progress %) ก่อน — ระดับ 2 และ 3 ต้องเก็บ data เพิ่ม (เวลาเริ่ม-หยุด, cycle time มาตรฐาน)

#### 9.2 UI Design — Column ใหม่ "ประสิทธิภาพ (Efficiency)"

วางถัดจาก column "Machine" (ระหว่าง Machine กับ Scale)

**ตัวเลือก A: antd Progress Bar (เรียบง่าย ใช้ง่ายที่สุด)**
```tsx
import { Progress } from 'antd'

{
  title: 'ประสิทธิภาพ', key: 'efficiency', width: 180,
  render: (_: any, r: MachineStatus) => {
    if (!r.active) return <span style={{ color: '#bbb' }}>—</span>
    const tubesPerInner = r.product?.quantityPerMeasurement ?? 0
    const actual = (r.measurementCount ?? 0) * tubesPerInner
    const target = r.targetTubes ?? 0
    if (!target) return <span style={{ color: '#bbb', fontSize: 11 }}>ไม่มี Target</span>
    const pct = Math.min(100, Math.round((actual / target) * 100))
    const color = pct >= 100 ? '#52c41a' : pct >= 75 ? '#1677ff' : pct >= 50 ? '#faad14' : '#ff4d4f'
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
        <Progress percent={pct} size="small" strokeColor={color} format={p => `${p}%`} />
        <span style={{ fontSize:11, color:'#888', fontFamily:'monospace' }}>
          {actual.toLocaleString()} / {target.toLocaleString()}
        </span>
      </div>
    )
  }
}
```

**ตัวเลือก B: Circular Progress (ใช้พื้นที่น้อย เห็นเด่นชัด)**
```tsx
<Progress
  type="circle"
  percent={pct}
  size={40}
  strokeColor={color}
  format={p => `${p}%`}
/>
```

**ตัวเลือก C: Mini Bar Chart (ใช้ recharts ที่มีอยู่ใน package.json แล้ว)**
- แสดง trend การผลิตในช่วง 8 ชั่วโมงล่าสุด
- เหมาะถ้ามีข้อมูล time-series ใน DTO
- ต้องเพิ่ม backend endpoint

> **ข้อเสนอแนะ:** เริ่มจากตัวเลือก A (Progress bar แนวนอน + ตัวเลขใต้) — เรียบง่าย ใช้ห้องน้อย เข้าใจได้ทันที

#### 9.3 Color logic (Traffic Light)
- 🟢 **เขียว** (≥ 100%): บรรลุเป้าหมาย
- 🔵 **น้ำเงิน** (75–99%): ใกล้บรรลุเป้า
- 🟡 **เหลือง** (50–74%): กลางทาง
- 🔴 **แดง** (< 50%): ตามเป้าไม่ทัน

> หลีกเลี่ยงสีซ้ำกับ status GREEN/YELLOW/RED ของการชั่ง (ผู้ใช้อาจสับสน) — พิจารณาใช้ shade ต่างกัน เช่น `geekblue` แทน blue

#### 9.4 Summary card ที่ด้านบน Dashboard (ภาพรวมทุก Machine)

เพิ่ม Card "ประสิทธิภาพรวมวันนี้" ข้าง ๆ Pending / Approved / Total Items (LeaderDashboard.tsx:473-477):

```tsx
<Card size="small">
  <Statistic
    title="ประสิทธิภาพรวม"
    value={totalActual / totalTarget * 100}
    precision={1}
    suffix="%"
    valueStyle={{ color: overallPct >= 90 ? '#52c41a' : '#faad14' }}
  />
  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
    {totalActual.toLocaleString()} / {totalTarget.toLocaleString()} หลอด
  </Typography.Text>
</Card>
```

#### 9.5 Backend (ต้องเพิ่ม)

**9.5.1 ใน `MachineStatus` DTO เพิ่ม field:**
- `targetTubes: int` — มาจาก WO ปัจจุบัน (จากข้อ 7)
- `measurementCount: long` — distinct (outer, inner) ที่ valid (จากข้อ 6)
- `greenCount`, `yellowCount`, `redCount` (สำหรับ Quality %)

**9.5.2 Query เพิ่ม:**
```sql
SELECT
  m.machine_id,
  wo.target_tubes,
  COUNT(DISTINCT CONCAT(meas.outer_box_number, '|', meas.inner_box_order)) AS measurement_count,
  SUM(CASE WHEN meas.status = 'GREEN'  THEN 1 ELSE 0 END) AS green_count,
  SUM(CASE WHEN meas.status = 'YELLOW' THEN 1 ELSE 0 END) AS yellow_count,
  SUM(CASE WHEN meas.status = 'RED'    THEN 1 ELSE 0 END) AS red_count
FROM machines m
LEFT JOIN work_orders wo
  ON wo.machine_id = m.machine_id AND wo.status = 'ACTIVE'
LEFT JOIN measurements meas
  ON meas.lot_no = wo.lot_no
  AND COALESCE(meas.is_for_standard_adjustment, FALSE) = FALSE
GROUP BY m.machine_id, wo.target_tubes
```

#### 9.6 Tab "รายงานประสิทธิภาพ" (ระดับลึกขึ้น — ทำในเฟสถัดไป)

เพิ่ม Tab ใหม่ใน Dashboard:
- Line chart % efficiency รายชั่วโมง / รายกะ / รายวัน
- Bar chart เปรียบเทียบประสิทธิภาพระหว่าง Machine
- Heatmap แสดงประสิทธิภาพรายวันของแต่ละ Machine ในเดือน
- ใช้ `recharts` ที่มีอยู่ใน `frontend/package.json` แล้ว

> ไฟล์ที่ใช้อ้างอิงรูปแบบเดิม: `frontend/src/ui/WOReportPage.tsx` (มี chart อยู่แล้ว)

#### 9.7 Edge case
- WO ไม่มี `targetTubes` → แสดง "ไม่มี Target" + progress bar เป็นสีเทา
- ยังไม่เริ่มชั่ง (measurement = 0) → 0%, แสดงปกติ
- เกิน 100% (ผลิตมากกว่าเป้า) → cap `Progress percent` ที่ 100 แต่แสดงตัวเลขจริงใต้ (เช่น `12,500 / 10,000 (125%)`)
- WO หลายตัวบน Machine เดียว (ในวัน) → รวมหรือแสดงเฉพาะ WO ปัจจุบัน — เลือกตามข้อตกลง

#### 9.8 หมายเหตุ
- ต้องทำข้อ 6 และ 7 ก่อน (มี measurementCount และ targetTubes พร้อมใช้)
- "ประสิทธิภาพ" คำว่า "Efficiency" หรือ "Performance" ก็ได้ — เลือกตามที่โรงงานคุ้นเคย
- ถ้าจะใช้คำว่า **OEE** จริงต้องเก็บ Availability + Performance ด้วย (ไม่ใช่แค่ Progress %)
- ความถี่ refresh: ตาม Dashboard polling ปัจจุบัน (ทุก 10-20 วินาที)

---

## Role: Management (เพิ่มใหม่)

### 10. เพิ่ม Role `MANAGEMENT` — ดู Dashboard และ รายงาน WO ได้ (Read-only)

**บริบท:**
ระบบปัจจุบันมี roles: `OPERATOR`, `LEADER`, `QA`, `DATA_ADMIN`, `ADMIN`
ต้องการเพิ่ม role ใหม่ **`MANAGEMENT`** สำหรับผู้บริหาร / หัวหน้าฝ่าย ที่ต้องการ **ดู** ข้อมูลภาพรวมแต่ไม่ต้องมีสิทธิ์ปฏิบัติงาน

**สิทธิ์ที่ต้องการ:**
- ✅ **เห็นและเข้า** Leader Dashboard (เหมือน LEADER)
- ✅ **เห็นและเข้า** QA Dashboard (เหมือน QA)
- ✅ **เห็นและเข้า** เมนู "รายงาน WO" (เหมือน LEADER + QA)
- ❌ **ห้าม** กดอนุมัติ / Apply Std / Reweigh / Reject / สร้าง-แก้ WO ใด ๆ
- ❌ **ห้าม** เห็นเมนู Operator (ชั่งน้ำหนัก, Sorting)
- ❌ **ห้าม** เห็นเมนู Admin (Master Data)

> สรุป: Read-only viewer ของ Leader Dashboard + QA Dashboard + Report

---

#### 10.1 Frontend — Menu

**ไฟล์:** `frontend/src/ui/App.tsx:253-268` (function `menuItems`)

**ปัจจุบัน:**
```tsx
const menuItems = useMemo(() => {
  const items: any[] = []
  if (user?.roles?.includes('OPERATOR')) items.push({ key: 'weigh', ... })
  if (user?.roles?.includes('OPERATOR')) items.push({ key: 'sorting', ... })
  if (user?.roles?.includes('QA')) items.push({ key: 'qa', ... })
  if (user?.roles?.includes('LEADER')) items.push({ key: 'leader', ... })
  if (user?.roles?.includes('LEADER')) items.push({ key: 'wo', ... })
  if (user?.roles?.includes('LEADER') || user?.roles?.includes('QA')) items.push({ key: 'report', ... })
  if (user?.roles?.includes('DATA_ADMIN') || user?.roles?.includes('ADMIN')) items.push({ key: 'admin', ... })
  return items
}, [user, leaderPending, qaTotal])
```

**แก้เป็น:** เพิ่ม `'MANAGEMENT'` ในเงื่อนไขของ QA Dashboard, Leader Dashboard, รายงาน WO (แต่ **ไม่ใช่** Work Order management หรือ Admin)

```tsx
const isMgmt = !!user?.roles?.includes('MANAGEMENT')

if (user?.roles?.includes('OPERATOR')) items.push({ key: 'weigh', ... })
if (user?.roles?.includes('OPERATOR')) items.push({ key: 'sorting', ... })
if (user?.roles?.includes('QA') || isMgmt) items.push({ key: 'qa', icon: <DashboardOutlined />, label: (
  <span>QA Dashboard{qaTotal>0 && <Badge ... />}</span>
) })
if (user?.roles?.includes('LEADER') || isMgmt) items.push({ key: 'leader', icon: <DashboardOutlined />, label: (
  <span>Leader{leaderPending>0 && <Badge ... />}</span>
) })
if (user?.roles?.includes('LEADER')) items.push({ key: 'wo', ... })   // Management ไม่เห็น Work Order management
if (user?.roles?.includes('LEADER') || user?.roles?.includes('QA') || isMgmt) items.push({ key: 'report', ... })
if (user?.roles?.includes('DATA_ADMIN') || user?.roles?.includes('ADMIN')) items.push({ key: 'admin', ... })
```

#### 10.2 Frontend — Render guard (App.tsx:346-380)

ในส่วน content render เพิ่ม MANAGEMENT ในเงื่อนไข:

```tsx
{(user.roles?.includes('QA') || user.roles?.includes('MANAGEMENT')) && active === 'qa' && (
  <ErrorBoundary pageName="QA Dashboard">
    <QADashboard token={user.token} username={user.username} readOnly={isMgmt} />
  </ErrorBoundary>
)}
{(user.roles?.includes('LEADER') || user.roles?.includes('MANAGEMENT')) && active === 'leader' && (
  <ErrorBoundary pageName="Leader Dashboard">
    <LeaderDashboard token={user.token} username={user.username} onHandled={...} readOnly={isMgmt} />
  </ErrorBoundary>
)}
{(user.roles?.includes('LEADER') || user.roles?.includes('QA') || user.roles?.includes('MANAGEMENT')) && active === 'report' && (
  <ErrorBoundary pageName="รายงาน WO">
    <WOReportPage token={user.token} />
  </ErrorBoundary>
)}
```

#### 10.3 Frontend — Read-only mode ใน Dashboard

ส่ง prop `readOnly?: boolean` ลงไปยัง `LeaderDashboard` และ `QADashboard` แล้วซ่อนปุ่ม action ทั้งหมด

#### 10.4 Backend — เพิ่ม Role enum

**ไฟล์:** `backend-spring/src/main/java/com/example/eikensystem/domain/Role.java`

เพิ่ม enum value `MANAGEMENT`

#### 10.5 Backend — Security / endpoint permissions

อนุญาต `MANAGEMENT` เข้า GET endpoints ของ Leader/QA ทั้งหมด
❌ ห้าม POST/PUT/DELETE

#### 10.6-10.9 (รายละเอียดเต็มในเวอร์ชันเก่า — ไม่เปลี่ยน)

---

## Role: Operator + Data Admin (Cross-role)

### 11. Sorting — เปลี่ยน "เหตุผล" จาก Text input → Dropdown master ที่ DataAdmin กำหนด

**บริบท:**
ปัจจุบัน Operator ในหน้า **Sorting** ต้องพิมพ์ "เหตุผล" เป็น free text → ทำให้ข้อมูลไม่สม่ำเสมอ
ต้องเปลี่ยนเป็น **Dropdown** ที่เลือกจากรายการมาตรฐานที่ **DataAdmin** กำหนดไว้

#### 11.1 ตำแหน่งใน `SortingPage.tsx`
- **Bulk mode** (บรรทัด 412-413) — `<Input value={bulkReason} ...>`
- **Single edit** (บรรทัด 665-668) — `<Input.TextArea value={reason} ...>`

#### 11.2 ตาราง Master ใหม่: `sorting_reasons`
```sql
CREATE TABLE sorting_reasons (
    id            BIGINT IDENTITY(1,1) PRIMARY KEY,
    code          VARCHAR(32)  NOT NULL UNIQUE,
    label_th      NVARCHAR(255) NOT NULL,
    label_en      VARCHAR(255)  NULL,
    description   NVARCHAR(500) NULL,
    scope         VARCHAR(20)   NOT NULL DEFAULT 'BOTH',  -- BULK | SINGLE | BOTH
    sort_order    INT           NOT NULL DEFAULT 100,
    is_active     BIT           NOT NULL DEFAULT 1,
    requires_note BIT           NOT NULL DEFAULT 0,
    created_at    DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    created_by    VARCHAR(64)   NULL,
    updated_at    DATETIME2     NULL,
    updated_by    VARCHAR(64)   NULL
);
CREATE INDEX idx_sorting_reasons_active_order ON sorting_reasons (is_active, sort_order);
```

#### 11.3 ขยาย `change_logs` เดิม
```sql
ALTER TABLE change_logs ADD reason_code VARCHAR(32) NULL;
ALTER TABLE change_logs ADD reason_note NVARCHAR(500) NULL;
```

#### 11.4-11.9 — Backend Entity/Repo/Controller + Admin UI + Operator UI + Backward compat (รายละเอียดเดิม)

---

## Role: Operator + Approver per Product (เพิ่มใหม่)

### 12. Outer Inspection — แจ้งเตือนผู้ตรวจตาม `Product.outerApprover` (ไม่ใช่ QA เสมอ)

**บริบท:**
ปัจจุบันเมื่อ **Outer เต็ม** ระบบสร้าง `OUTER_INSPECTION` approval → ส่งให้ **QA ตรวจเสมอ**
แต่จาก Excel `ProductDataUbonwanRev01.xlsx` คอลัมน์ **"Outer Approve"** มีค่า:
- **`QA`** — QA เป็นผู้ตรวจ (เช่นเดิม) → product code 105073-105098
- **`Operator`** — Operator เช็คเอง (self-check, ไม่ต้องรอใคร) → product G-PZ11-G-PZ32
- **`ชั่งน้ำหนักชิ้นทั้งหมด แล้วจึงชั่ง Specimen`** — workflow note พิเศษ (ไม่ใช่ role)

ต้องเปลี่ยนเป็น **routing แบบ dynamic ตาม Product** + รองรับ workflow note พิเศษ

---

#### 12.1 ออกแบบฟิลด์ใหม่ใน Product

แยกเป็น 2 ฟิลด์ เพื่อแยก **"ใคร"** ออกจาก **"คำสั่งพิเศษ"**:

| ฟิลด์ | Type | ค่าที่ใช้ได้ | คำอธิบาย |
|------|------|-----------|----------|
| `outer_approver_role` | VARCHAR(20) | `QA` / `OPERATOR` / `LEADER` | บทบาทผู้ตรวจ Outer |
| `outer_approver_note` | NVARCHAR(500) | free text | คำสั่งพิเศษ (เช่น "ชั่งชิ้นทั้งหมดก่อนชั่ง Specimen") |

> ทำไมแยก: ค่าที่ 3 ใน Excel ("ชั่งชิ้นทั้งหมด...") **ไม่ใช่ role** — เป็นคำสั่งการทำงาน ต้องแยกเก็บคนละช่องเพื่อให้ใช้ logic ตามได้

**Mapping จาก Excel:**
| Excel "Outer Approve" | outer_approver_role | outer_approver_note |
|----------------------|:-------------------:|---------------------|
| `QA` | `QA` | NULL |
| `Operator` | `OPERATOR` | NULL |
| `ชั่งน้ำหนักชิ้นทั้งหมด แล้วจึงชั่ง Specimen` | `QA` (default) | ข้อความเต็ม |

> ✅ ถ้า Note ไม่ว่าง → แสดง warning บนหน้า Operator ก่อนจะส่ง Outer Inspection

---

#### 12.2 DB Migration

ไฟล์: `db-migration/V00x__add_outer_approver_to_product.sql`
```sql
ALTER TABLE products ADD outer_approver_role VARCHAR(20) NOT NULL DEFAULT 'QA';
ALTER TABLE products ADD outer_approver_note NVARCHAR(500) NULL;

-- check constraint
ALTER TABLE products ADD CONSTRAINT CK_products_outer_approver_role
  CHECK (outer_approver_role IN ('QA', 'OPERATOR', 'LEADER'));
```

> Default = 'QA' — รักษา behavior เดิมของข้อมูลที่ import มาก่อน

---

#### 12.3 Backend — Product Entity

ไฟล์: `backend-spring/src/main/java/com/example/eikensystem/domain/Product.java`

เพิ่ม fields:
```java
@Column(name = "outer_approver_role", nullable = false, length = 20)
private String outerApproverRole = "QA";

@Column(name = "outer_approver_note", length = 500)
private String outerApproverNote;
```

---

#### 12.4 Backend — Logic การสร้าง OUTER_INSPECTION

**ไฟล์:** `backend-spring/src/main/java/com/example/eikensystem/web/ApprovalController.java`
**Endpoint:** `POST /api/approvals/outer-inspection`

ปัจจุบัน: สร้าง approval ที่ `approverRole = QA` ตลอด

แก้ไข:
```java
@PostMapping("/outer-inspection")
public ResponseEntity<?> createOuterInspection(@RequestBody OuterInspectionRequest req) {
    // ── ดึง approver role จาก Product master ──
    Product product = productRepo.findByProductCode(req.getProductCode())
        .orElseThrow(() -> new EntityNotFoundException("Product not found"));

    String approverRole = Objects.requireNonNullElse(product.getOuterApproverRole(), "QA");
    String approverNote = product.getOuterApproverNote();

    // ── กรณีพิเศษ: OPERATOR เช็คเอง → บันทึก inspection ทันที (auto-approved) ──
    if ("OPERATOR".equals(approverRole)) {
        OuterInspection insp = new OuterInspection();
        insp.setProductCode(req.getProductCode());
        insp.setScaleId(req.getScaleId());
        insp.setLotNo(req.getLotNo());
        insp.setOuterBox(req.getOuterBox());
        insp.setWorkOrderId(req.getWorkOrderId());
        insp.setInspectorRole("OPERATOR");
        insp.setInspectorUser(req.getRequestedBy());   // เอง
        insp.setInspectedAt(Instant.now());
        insp.setStatus("AUTO_APPROVED");
        insp.setApproverNote(approverNote);
        outerInspectionRepo.save(insp);
        return ResponseEntity.ok(Map.of(
            "selfChecked", true,
            "inspectionId", insp.getId(),
            "note", approverNote
        ));
    }

    // ── ปกติ: สร้าง approval รอ QA หรือ LEADER ตามที่กำหนด ──
    Approval approval = new Approval();
    approval.setType(ApprovalType.OUTER_INSPECTION);
    approval.setApproverRole(approverRole);   // ← dynamic
    approval.setStatus("PENDING");
    approval.setPayloadJson(toJson(Map.of(
        "productCode", req.getProductCode(),
        "scaleId", req.getScaleId(),
        "lotNo", req.getLotNo(),
        "outerBox", req.getOuterBox(),
        "workOrderId", req.getWorkOrderId(),
        "approverNote", approverNote          // คำสั่งพิเศษติดไปด้วย
    )));
    approvalRepo.save(approval);
    return ResponseEntity.ok(approval);
}
```

---

#### 12.5 ตารางใหม่: `outer_inspections` — บันทึกการตรวจ Outer

แยกออกจาก approvals เพื่อเก็บประวัติเฉพาะ Outer Inspection (รวมทั้ง self-check ที่ไม่มี approval)

```sql
CREATE TABLE outer_inspections (
    id                 BIGINT IDENTITY(1,1) PRIMARY KEY,
    product_code       VARCHAR(50) NOT NULL,
    scale_id           VARCHAR(50) NOT NULL,
    lot_no             VARCHAR(50) NOT NULL,
    outer_box          VARCHAR(10) NOT NULL,
    work_order_id      BIGINT NULL,
    approval_id        BIGINT NULL,                       -- FK ถ้าผ่าน approval (QA/Leader)
    inspector_role     VARCHAR(20) NOT NULL,              -- 'QA' | 'OPERATOR' | 'LEADER'
    inspector_user     VARCHAR(64) NOT NULL,              -- username ผู้ตรวจ
    inspected_at       DATETIME2 NOT NULL,
    status             VARCHAR(20) NOT NULL,              -- 'AUTO_APPROVED' | 'APPROVED' | 'REJECTED'
    approver_note      NVARCHAR(500) NULL,                -- คำสั่งพิเศษจาก Product
    notes              NVARCHAR(500) NULL,                -- หมายเหตุของผู้ตรวจ
    reweigh_count      INT NOT NULL DEFAULT 0,            -- จำนวน Inner ที่ QA ชั่งซ้ำ
    created_at         DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    INDEX idx_oi_lot_outer (lot_no, outer_box),
    INDEX idx_oi_inspected (inspected_at)
);
```

---

#### 12.6 Frontend — MeasurementEntry (Operator)

**ไฟล์:** `frontend/src/ui/MeasurementEntry.tsx:1202-1224`

ปัจจุบัน:
```tsx
if (isFull) {
  // Trigger QA Outer Inspection
  fetch(apiUrl('/api/approvals/outer-inspection'), {...})
  setInfoMessage(`...ส่งคำขอ QA ตรวจสอบ Outer ${completedOuter} แล้ว`)
}
```

แก้:
```tsx
if (isFull) {
  fetch(apiUrl('/api/approvals/outer-inspection'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({...})
  })
    .then(r => r.json())
    .then(res => {
      if (res.selfChecked) {
        // OPERATOR self-check → ไม่ต้องรอใคร
        let msg = `✓ บันทึก Outer ${completedOuter} (ตรวจเองสำเร็จ)`
        if (res.note) msg += ` — คำสั่งพิเศษ: ${res.note}`
        setInfoMessage(msg)
      } else {
        // ส่งให้ approver ตาม Product
        const role = res.approverRole === 'LEADER' ? 'Leader' : 'QA'
        setInfoMessage(`...ส่งคำขอ ${role} ตรวจสอบ Outer ${completedOuter} แล้ว`)
      }
    })
    .catch(() => { /* ignore */ })
}
```

---

#### 12.7 Frontend — Admin (DataAdmin จัดการ Approver per Product)

**ไฟล์:** `frontend/src/ui/admin/ProductsAdmin.tsx`

เพิ่มฟิลด์ใน form สร้าง/แก้ Product:
```tsx
<Form.Item name="outerApproverRole" label="ผู้ตรวจ Outer">
  <Select options={[
    { value: 'QA', label: 'QA' },
    { value: 'OPERATOR', label: 'Operator (ตรวจเอง)' },
    { value: 'LEADER', label: 'Leader' },
  ]} defaultValue="QA" />
</Form.Item>

<Form.Item name="outerApproverNote" label="คำสั่งพิเศษก่อนตรวจ (optional)">
  <Input.TextArea rows={2}
    placeholder="เช่น: ชั่งน้ำหนักชิ้นทั้งหมด แล้วจึงชั่ง Specimen" />
</Form.Item>
```

เพิ่ม column ใน table:
- "ผู้ตรวจ Outer" — แสดง `QA` / `Operator` / `Leader`
- icon ⚠️ ถ้ามี `outerApproverNote`

---

#### 12.8 Frontend — Leader Dashboard

ถ้า Product set ให้ Leader เป็นผู้ตรวจ → รายการ OUTER_INSPECTION (approverRole=LEADER) ขึ้นใน Leader Dashboard
- ใน `LeaderDashboard.tsx` ปุ่ม "ดำเนินการ" รองรับ type=OUTER_INSPECTION → เปิด Modal เดียวกับที่ QA ใช้ (หรือเขียน Modal ใหม่)
- แสดง `approverNote` ใน Modal เป็น callout warning เพื่อย้ำคำสั่งพิเศษ

---

#### 12.9 Frontend — QA Dashboard

ปุ่ม "Approve Outer" ที่มีอยู่ (`QADashboard.tsx`) — ปกติแล้ว
- แสดง `approverNote` ใน Modal เป็น callout warning เหมือนกัน

---

#### 12.10 CSV Import — รองรับ Outer Approver

**ไฟล์:** `frontend/src/ui/admin/CsvImport.tsx` + backend `AdminImportService.java`

เพิ่ม mapping สำหรับ column ใน CSV/Excel:
- `Outer Approve` (จาก Excel) →
  - ถ้าเป็น `QA` / `Operator` / `Leader` → `outer_approver_role`
  - ถ้าเป็นข้อความอื่น → `outer_approver_note` + set `outer_approver_role = 'QA'` (default)

---

#### 12.11 รายงาน — Track ผู้ตรวจ Outer

ใน `WOReportPage.tsx` — Tab "Outer Inspection" (สร้างใหม่หรือ extend):
- แสดง: Outer / Lot / ผู้ตรวจ (role+ชื่อ) / เวลา / สถานะ / Reweigh count / Notes
- Filter ตาม inspector_role: QA / OPERATOR / LEADER
- Export Excel

---

#### 12.12 Update Documentation

**WORKFLOW.md §10** (Outer Inspection Flow) — เพิ่ม branch ตาม `outer_approver_role`:
- QA → QA approves (เดิม)
- OPERATOR → self-check, log ทันที
- LEADER → Leader approves

**MANUAL.md §4.6** "Outer Inspection" — อธิบายว่าผู้ตรวจขึ้นกับ Product, ดูจาก master data

**MANUAL.md §15** ตาราง Approval Types — เพิ่ม note: "Approver dynamic ตาม Product.outerApproverRole"

---

#### 12.13 ผลกระทบ Schema Summary

| ตาราง | การเปลี่ยน |
|-------|-----------|
| `products` | เพิ่ม `outer_approver_role`, `outer_approver_note` |
| `approvals` | คงเดิม — แต่ `approverRole` ของ OUTER_INSPECTION อาจเป็น QA/LEADER ก็ได้ |
| `outer_inspections` (ใหม่) | เก็บประวัติทุกการตรวจ Outer รวม self-check |

---

#### 12.14 ลำดับการทำ

1. **DB migration** — เพิ่ม fields ใน `products`, สร้าง `outer_inspections`
2. **Backend Product entity + Repo** — รับ-ส่ง 2 fields ใหม่
3. **Backend ApprovalController** — branch logic ตาม role
4. **Backend OuterInspection entity** — เก็บประวัติ
5. **CSV Import** — รองรับ column ใหม่
6. **Frontend Admin (ProductsAdmin)** — UI กำหนด Approver
7. **Frontend MeasurementEntry** — handle response (selfChecked vs pending)
8. **Frontend Leader Dashboard** — รับ OUTER_INSPECTION
9. **Frontend WO Report** — รายงาน inspection
10. **Docs update** — WORKFLOW + MANUAL

---

## Prompt Template สำหรับ VSCode

```
อ้างอิงจาก TODO.md ข้อ <เลขข้อ>
อ่านรายละเอียดและแก้ตามที่ระบุ
ทดสอบให้แน่ใจว่าไม่กระทบฟีเจอร์อื่น
```
