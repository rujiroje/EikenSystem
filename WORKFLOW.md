# Eikensystem — System Workflow

## 1. ภาพรวมระบบ

```mermaid
graph TD
    A[ผู้ใช้งาน] -->|สแกนนิ้ว| KBA[KiosBioAgent<br/>localhost:5001]
    KBA -->|matchId| BE[Backend API<br/>Spring Boot]
    BE -->|JWT Token| FE[Frontend<br/>React / Vite]
    FE --- MENU

    subgraph MENU[เมนูตาม Role]
        M1[OPERATOR: ชั่งน้ำหนัก / Sorting]
        M2[LEADER: Dashboard / Work Order]
        M3[QA: Dashboard / รายงาน WO]
        M4[DATA_ADMIN: Admin Master Data]
    end
```

---

## 2. การ Login (ทุก User)

```mermaid
sequenceDiagram
    participant U as ผู้ใช้
    participant FE as Frontend
    participant KBA as KiosBioAgent
    participant BE as Backend

    FE->>BE: GET /api/auth/fingerprint-users
    BE-->>FE: [{ username, template }] (ทุก user ที่ลงทะเบียนไว้)

    U->>FE: กดปุ่ม "Login with Biometric"
    FE->>BE: GET /api/auth/biometric-challenge
    BE-->>FE: { nonce } (UUID, หมดอายุใน 60 วิ)

    FE->>KBA: POST /identify { challenge, candidates }
    U->>KBA: วางนิ้วบนเครื่องอ่าน
    KBA-->>FE: { ok: true, matchId: "username" }

    FE->>BE: POST /api/auth/login-biometric-verified { username, nonce }
    BE->>BE: ตรวจสอบ nonce (one-use, TTL 60 วิ)
    BE-->>FE: { token: JWT, user: { username, roles } }
    FE->>FE: บันทึก token ใน localStorage
```

> **Fallback:** Login ด้วย Username + Password ยังใช้ได้ผ่าน `POST /api/auth/login`

---

## 3. Work Order Lifecycle (LEADER)

```mermaid
stateDiagram-v2
    [*] --> ACTIVE : LD สร้าง WO\n(product, scale, line, lot, date)
    ACTIVE --> SORTING : LD เปลี่ยนสถานะ\nเมื่อจบการผลิต
    SORTING --> END : LD ปิด WO
    END --> [*]

    note right of ACTIVE
        Operator ชั่งน้ำหนักในสถานะนี้
        customStd (optional) override product std
    end note
    note right of SORTING
        Operator ทำ Sorting
        ตรวจสอบกล่องที่ค้างอยู่
    end note
```

**LEADER สร้าง WO ระบุ:**
- Product + Scale + Line + Lot No.
- วันเริ่ม–สิ้นสุด
- `customStd` (ถ้าต้องการ override ค่า Std จาก master)
- DOUBLE mode: `customStd1`, `customStd2` แยกกัน

---

## 4. กระบวนการชั่งน้ำหนัก (OPERATOR)

```mermaid
flowchart TD
    START([เริ่มงาน]) --> SEL[เลือก WO ACTIVE\nกรอก Operator Names]
    SEL --> SCAN[สแกนกล่อง Inner\n→ ได้ Outer/Inner อัตโนมัติ]
    SCAN --> WEIGH{โหมดชั่ง?}

    WEIGH -->|SINGLE| W1[ชั่ง 1 ครั้ง\n→ weight]
    WEIGH -->|DOUBLE| W2[ชั่งครั้งที่ 1 + ครั้งที่ 2\n→ weight1, weight2]

    W1 --> CLS[จำแนกผล\nGREEN / YELLOW / RED]
    W2 --> CLS

    CLS -->|GREEN ✅| NEXT[บันทึก → กล่องถัดไป]
    CLS -->|YELLOW ⚠️| YW[นับ Yellow Streak\n+1]
    CLS -->|RED ❌| RED_FLOW[Red Event Flow]

    YW --> YC{Streak ≥ 5?}
    YC -->|ไม่| NEXT
    YC -->|ใช่| LOCK[ระบบล็อก\nรอ QA อนุมัติ]

    NEXT --> OUTER_CHK{กล่อง Outer เต็ม?}
    OUTER_CHK -->|ไม่| SCAN
    OUTER_CHK -->|ใช่| OI_REQ[สร้าง Outer Inspection\nรอ QA ตรวจ]
    OI_REQ --> SCAN
```

---

## 5. การจำแนกน้ำหนัก (Classification Logic)

```
ค่า Std ที่ใช้ (ลำดับความสำคัญ):
  1. Barrier record (ค่า Std ที่ QA Apply แล้ว)  ← สูงสุด
  2. WO customStd ที่ LD กำหนด
  3. Product.standardWeight
  4. weightPerPiece × quantityPerMeasurement (fallback)
```

```
❌ RED    : weight < Std − (weightPerPiece / 2)
            หรือ weight > Std + (weightPerPiece / 2)
⚠️ YELLOW : weight อยู่ใน half-piece range แต่ out-of-tolerance
             (Std − tolerance) > weight หรือ weight > (Std + tolerance)
✅ GREEN  : weight อยู่ใน Std ± tolerance
```

**DOUBLE mode**: จำแนก weight1 และ weight2 แยก → ถ้าอย่างใดอย่างหนึ่งแดงก็ RED

---

## 6. Red Event Flow (OPERATOR → LEADER)

```mermaid
sequenceDiagram
    participant OP as Operator
    participant SYS as System
    participant LD as Leader

    OP->>SYS: ชั่งน้ำหนัก → ผล RED
    SYS->>SYS: สร้าง RED_EVENT approval\n(type=RED_EVENT, approverRole=LEADER)
    SYS-->>OP: แสดงแจ้งเตือน + รอ Leader

    LD->>SYS: เห็น badge notification
    LD->>SYS: ตรวจสอบ → อนุมัติ + ระบุเหตุผล\nPOST /approve-with-note
    SYS-->>OP: approval = APPROVED

    OP->>SYS: ชั่งซ้ำกล่องเดิม (reweigh)\nบันทึก weight ใหม่ + คำนวณ status ใหม่
    SYS->>SYS: บันทึก ChangeLog (audit trail)
    SYS->>SYS: ล้าง approvalId (พร้อมรับกล่องถัดไป)
```

---

## 7. Yellow Streak & Standard Change Flow (OPERATOR → QA)

```mermaid
flowchart LR
    Y3[Yellow #3\nแสดงคำเตือน] --> Y4[Yellow #4]
    Y4 --> Y5[Yellow #5\n⚠️ ระบบล็อก]

    Y5 --> REQ[OP สร้าง STD_CHANGE_REQUEST\nstage = REQUESTED]
    REQ --> QA1[QA เห็นใน Dashboard]

    QA1 --> ALLOW[QA กด Allow 4&5\nstage = ALLOW_4_5]
    ALLOW --> BOX45[OP ชั่งกล่องที่ 4 และ 5\nรวบรวม 5 ค่า]
    BOX45 --> PROP[OP update-proposal\nส่ง weights5 + proposedStd\nstage = READY_FOR_APPLY]

    PROP --> QA2[QA ตรวจสอบ 5 ค่า\nคำนวณ Std ใหม่]
    QA2 --> APPLY[QA apply-std\nบันทึก StandardWeightLog]
    APPLY --> BARRIER[สร้าง Barrier Measurement\nouterBox=000, inner=RST1\nisForStandardAdjustment=true]
    BARRIER --> RESET[Yellow Streak ถูก reset\nOP ชั่งต่อได้ตามปกติ]
```

**Barrier Measurement** คือ record พิเศษที่ฝังใน timeline เพื่อ "ตัด" streak ที่นับจาก latest ย้อนหลัง

---

## 8. Initial Standard (10 กล่องแรก)

```mermaid
flowchart TD
    B0[เริ่ม Lot ใหม่\nยังไม่มี Std ที่ Apply] --> B10{ชั่งครบ 10 กล่อง?}
    B10 -->|ยัง| CONT[ชั่งต่อ\nใช้ Product Std ชั่วคราว]
    B10 -->|ครบ| REQ2[requiresInitialStdApproval = true\nOP สร้าง STD_CHANGE_REQUEST]
    REQ2 --> QA_INIT[QA ตรวจสอบ avg 10 กล่อง\n→ Apply Initial Std]
    QA_INIT --> BARRIER2[สร้าง Barrier\nStd ถูก set ถาวรสำหรับ Lot นี้]
```

---

## 9. Cleaning Check Flow (OPERATOR → LEADER)

```mermaid
sequenceDiagram
    participant OP as Operator
    participant SYS as System
    participant LD as Leader

    Note over OP,SYS: ทุก 1 ชั่วโมง (dedup ต่อ scaleId:hourLabel)
    OP->>SYS: POST /api/approvals/cleaning-check\n{ scaleId, hourLabel }
    SYS->>SYS: ตรวจ dedup → สร้าง CLEANING_CHECK\n(type=CLEANING_CHECK, approverRole=LEADER)

    LD->>SYS: อนุมัติ (approve-with-note)
    SYS-->>OP: สถานะ = APPROVED (poll ทุก 30 วิ)
```

---

## 10. Outer Inspection Flow (OPERATOR → QA)

```mermaid
sequenceDiagram
    participant OP as Operator
    participant SYS as System
    participant QA as QA

    OP->>SYS: กล่อง Outer เต็ม capacity\nPOST /api/approvals/outer-inspection
    SYS-->>OP: approval PENDING

    QA->>SYS: ดู Outer Inspection list
    QA->>SYS: ดูน้ำหนักทุก inner ใน outer นั้น\nGET /api/measurements/by-outer
    opt ชั่งซ้ำ
        QA->>SYS: PUT /measurements/{id}/qa-reweigh\n(timestamp เดิมคงไว้ → streak ไม่เพี้ยน)
    end
    QA->>SYS: POST /approve-outer
    SYS-->>OP: outer approved ✅
```

---

## 11. Sorting Flow (OPERATOR)

```mermaid
flowchart TD
    WO_SORT[WO สถานะ = SORTING] --> SP[SortingPage]
    SP --> VIEW[ดูรายการกล่องทั้งหมดใน Lot]
    VIEW --> ACTION{ต้องการ?}
    ACTION -->|เปลี่ยน Outer/Inner| RELOC[PUT /measurements/id/relocate\nbันทึก ChangeLog]
    ACTION -->|ชั่งซ้ำ| REWEIGH2["PUT /measurements/id/reweigh\nต้องมี Leader approval"]
    RELOC --> VIEW
    REWEIGH2 --> VIEW
```

---

## 12. Reports (LEADER + QA)

| Tab | เนื้อหา |
|-----|---------|
| ภาพรวมทุก WO | Cross-WO performance: GREEN/YELLOW/RED count + pass rate ตาม date range |
| รายละเอียด WO | เลือก WO เดียว → tabs ด้านล่าง |
| — Lot Summary | สรุปจำนวน Measurement ต่อ Lot (GREEN/YELLOW/RED) |
| — Lot Details | รายการ measurement ทุก record ใน lot |
| — Lot Events | Timeline: STD changes + Approvals |
| — Operator Stats | สรุปจำนวนต่อ Operator |
| — รายงานประสิทธิภาพ | Pass rate ต่อคน + สรุปรายวัน-รายกะ |

---

## 13. Admin Functions (DATA_ADMIN / ADMIN)

| หมวด | ทำอะไรได้ |
|------|-----------|
| Users | สร้าง/แก้ Role/ลบ user, Reset password, ลงทะเบียนนิ้วแทน user |
| Products | เพิ่ม/แก้ Product: weightPerPiece, qty, tolerance, mode (SINGLE/DOUBLE), innerNumberingMode |
| Scales | เพิ่ม/แก้เครื่องชั่ง |
| Std Log | ดู history การ apply std |

---

## 14. การลงทะเบียนลายนิ้วมือ (ทุก User — Self-service)

```mermaid
sequenceDiagram
    participant U as ผู้ใช้
    participant FE as Frontend
    participant KBA as KiosBioAgent
    participant BE as Backend

    U->>FE: กด icon "จัดการบัญชี" → Tab ลายนิ้วมือ
    FE->>KBA: GET /health → ตรวจสถานะเครื่องอ่าน
    U->>FE: กด "วางนิ้วเพื่อลงทะเบียนใหม่"
    FE->>KBA: POST /authenticate { challenge }
    U->>KBA: วางนิ้ว
    KBA-->>FE: { ok: true, signedData: "BASE64_FMD" }
    FE->>BE: POST /api/auth/register-fingerprint { template: signedData }
    BE-->>FE: บันทึกสำเร็จ ✅
```

---

## 15. Approval Types Summary

| Type | Requester | Approver | Trigger |
|------|-----------|----------|---------|
| `RED_EVENT` | OPERATOR | LEADER | Measurement = RED |
| `STD_CHANGE_REQUEST` | OPERATOR | QA | Yellow streak ≥ 5 หรือ 10 กล่องแรก |
| `CLEANING_CHECK` | OPERATOR | LEADER | ทุก 1 ชั่วโมง ต่อเครื่องชั่ง |
| `OUTER_INSPECTION` | OPERATOR | QA | กล่อง Outer เต็ม |

---

## 16. Approval Stage (STD_CHANGE_REQUEST เท่านั้น)

```
REQUESTED → ALLOW_4_5 → READY_FOR_APPLY → APPLIED
    ↑ QA allow    ↑ OP update-proposal    ↑ QA apply-std
```

---

## 17. Operation Flow — ก่อนเริ่มกะ (Pre-shift)

```mermaid
flowchart TD
    LD_LOGIN([LEADER เข้าสู่ระบบ]) --> CHECK_WO{มี WO สำหรับวันนี้?}
    CHECK_WO -->|ยังไม่มี| CREATE_WO[สร้าง Work Order\nระบุ Product, Scale, Line,\nLot No., วันที่, customStd]
    CHECK_WO -->|มีแล้ว| VERIFY_WO[ตรวจสอบ WO ว่าสถานะ ACTIVE]
    CREATE_WO --> WO_READY[WO พร้อมใช้งาน\nสถานะ = ACTIVE]
    VERIFY_WO --> WO_READY

    OP_LOGIN([OPERATOR เข้าสู่ระบบ]) --> SEL_WO[เลือก WO ACTIVE\nจาก dropdown]
    WO_READY --> SEL_WO
    SEL_WO --> FILL_OP[กรอกชื่อ Operator\nผู้ร่วมงานในกะนี้]
    FILL_OP --> READY([พร้อมเริ่มชั่งน้ำหนัก])
```

---

## 18. Operation Flow — การชั่งน้ำหนักปกติ (Normal Weighing)

```mermaid
flowchart TD
    START([เริ่มชั่ง]) --> SCAN[สแกน Barcode กล่อง Inner\nระบบคำนวณ Outer/Inner อัตโนมัติ]
    SCAN --> PUT[วางกล่องบนเครื่องชั่ง\nอ่านน้ำหนัก]
    PUT --> RESULT{ผลการชั่ง}

    RESULT -->|GREEN ✅| SAVE[บันทึกผล\nแสดงสีเขียว]
    RESULT -->|YELLOW ⚠️| STREAK[บันทึก + แสดง\nจำนวน Yellow ที่สะสม]
    RESULT -->|RED ❌| RED[บันทึก + แจ้ง Leader\nรอการอนุมัติ]

    SAVE --> NEXT_CHK{กล่อง Outer เต็ม?}
    STREAK --> STREAK_CHK{Yellow ครบ 5?}
    STREAK_CHK -->|ไม่| NEXT_CHK
    STREAK_CHK -->|ครบ 5| LOCK[ระบบล็อก\nสร้าง STD_CHANGE_REQUEST\nรอ QA]

    NEXT_CHK -->|ยัง| SCAN
    NEXT_CHK -->|เต็ม| OI[ส่ง Outer Inspection\nรอ QA ตรวจกล่อง]
    OI --> SCAN

    RED --> WAIT_LD[รอ Leader อนุมัติ]
    WAIT_LD --> REWEIGH[ชั่งซ้ำกล่องเดิม]
    REWEIGH --> SCAN
```

---

## 19. Operation Flow — Cleaning Check (ทุก 1 ชั่วโมง)

```mermaid
flowchart LR
    HOUR([ครบ 1 ชั่วโมง]) --> OP_CLEAN[Operator กดขอ\nCleaning Check]
    OP_CLEAN --> CLEAN_WAIT[รอ Leader อนุมัติ\nแสดงสถานะ PENDING]
    CLEAN_WAIT --> LD_CLEAN[Leader กดอนุมัติ\nใน Leader Dashboard]
    LD_CLEAN --> CLEAN_DONE[สถานะ = APPROVED\nOperator ทำความสะอาดเครื่อง]
    CLEAN_DONE --> RESUME([ชั่งต่อได้])
```

---

## 20. Operation Flow — Red Event (กล่อง RED)

```mermaid
sequenceDiagram
    participant OP as Operator
    participant LD as Leader
    participant SYS as ระบบ

    OP->>SYS: ชั่งได้ผล RED
    SYS-->>OP: แจ้งเตือน RED + ล็อกกล่องนั้น
    SYS-->>LD: Badge notification บน Leader Dashboard

    LD->>SYS: เปิด Dashboard → ดูรายละเอียดกล่อง RED
    Note over LD: ตรวจสอบสาเหตุ\n(น้ำหนักเกิน/ขาด, ของตกหล่น ฯลฯ)
    LD->>SYS: อนุมัติ + ระบุเหตุผล

    SYS-->>OP: แจ้งว่าอนุมัติแล้ว
    OP->>SYS: ชั่งซ้ำกล่องเดิม → บันทึกผลใหม่
    OP->>SYS: ชั่งกล่องถัดไปต่อได้ปกติ
```

---

## 21. Operation Flow — Yellow Streak (5 กล่องเหลือง)

```mermaid
sequenceDiagram
    participant OP as Operator
    participant QA as QA
    participant SYS as ระบบ

    Note over OP,SYS: Yellow #1-3: ชั่งได้ปกติ แสดงคำเตือน
    Note over OP,SYS: Yellow #4: แสดงเตือนหนัก (เหลือ 1 ครั้ง)

    OP->>SYS: Yellow #5 → ระบบล็อก
    OP->>SYS: กดสร้างคำขอเปลี่ยน Std
    SYS-->>QA: แจ้ง QA Dashboard (badge)

    QA->>SYS: ตรวจสอบ 3 ค่าล่าสุด
    QA->>SYS: กด Allow กล่อง 4 และ 5

    SYS-->>OP: ระบบปลดล็อก (ชั่งกล่อง 4-5 ได้)
    OP->>SYS: ชั่งกล่อง 4 และ 5
    OP->>SYS: ส่ง 5 ค่า + Std ที่เสนอ

    QA->>SYS: ตรวจสอบ 5 ค่า + คำนวณ Std ใหม่
    QA->>SYS: กด Apply Std

    SYS->>SYS: บันทึก StandardWeightLog\nสร้าง Barrier → reset streak
    SYS-->>OP: ชั่งต่อด้วย Std ใหม่
```

---

## 22. Operation Flow — Outer Box Inspection (QA ตรวจกล่อง)

```mermaid
sequenceDiagram
    participant OP as Operator
    participant QA as QA
    participant SYS as ระบบ

    OP->>SYS: กล่อง Outer ครบจำนวน\nกดส่ง Outer Inspection
    SYS-->>QA: แจ้ง QA Dashboard (badge)
    OP->>SYS: ชั่งกล่อง Outer ถัดไปต่อได้เลย

    QA->>SYS: เปิดรายการ Outer Inspection
    QA->>SYS: ดูน้ำหนักทุก Inner ในกล่อง Outer นั้น
    opt พบค่าผิดปกติ
        QA->>SYS: ชั่งซ้ำ Inner ที่ต้องการ\n(timestamp เดิมไม่เปลี่ยน)
    end
    QA->>SYS: กด Approve Outer
    SYS-->>OP: กล่อง Outer ผ่านการตรวจแล้ว ✅
```

---

## 23. Operation Flow — จบการผลิต (End of Production)

```mermaid
flowchart TD
    PROD_END([จบการผลิต]) --> LD_SORT[Leader เปลี่ยนสถานะ WO\nACTIVE → SORTING]

    LD_SORT --> OP_SORT[Operator เปิดหน้า Sorting]
    OP_SORT --> REVIEW[ตรวจสอบรายการกล่องทั้งหมด\nใน Lot นั้น]
    REVIEW --> FIX{พบกล่องผิดที่?}
    FIX -->|ใช่| RELOC[ย้าย Outer/Inner\nบันทึก ChangeLog]
    FIX -->|ไม่| CLOSE_CHK{ตรวจครบแล้ว?}
    RELOC --> REVIEW
    CLOSE_CHK -->|ยัง| REVIEW
    CLOSE_CHK -->|ครบ| LD_END[Leader ปิด WO\nสถานะ = END]
    LD_END --> REPORT[ออกรายงาน WO\nจาก WOReportPage]
    REPORT --> DONE([เสร็จสิ้น])
```

---

## 24. Operation Flow — ภาพรวมทั้งกะ (Full Shift Overview)

```mermaid
flowchart TD
    subgraph PRE[ก่อนกะ]
        P1[LD สร้าง / ตรวจ WO]
        P2[OP Login + เลือก WO]
        P3[OP กรอกชื่อผู้ร่วมงาน]
    end

    subgraph WORK[ระหว่างกะ]
        W1[OP ชั่งน้ำหนักต่อเนื่อง]
        W2[ทุก 1 ชม: Cleaning Check\nOP ขอ → LD อนุมัติ]
        W3[กล่อง Outer เต็ม:\nOP ส่ง → QA ตรวจ]
        W4[RED: OP รอ → LD อนุมัติ → OP ชั่งซ้ำ]
        W5[Yellow 5: OP รอ → QA Allow → OP ชั่งต่อ → QA Apply Std]
    end

    subgraph POST[หลังกะ / จบผลิต]
        E1[LD เปลี่ยน WO เป็น SORTING]
        E2[OP ทำ Sorting ตรวจกล่อง]
        E3[LD ปิด WO เป็น END]
        E4[LD/QA ออกรายงาน]
    end

    PRE --> WORK --> POST
```
