# Eikensystem — Architecture Decision Records (ADR)

> เอกสารบันทึก **การตัดสินใจเชิงสถาปัตยกรรม** ที่สำคัญ — ทำไมถึงเลือก / ทางเลือกอื่นที่เคยพิจารณา / ผลกระทบ
> เพื่อให้คนที่มาทำงานต่อเข้าใจ "ทำไมระบบเป็นแบบนี้"

---

## รูปแบบของ ADR

แต่ละ ADR มีโครงสร้าง:
- **Status** — Proposed / Accepted / Deprecated / Superseded
- **Context** — สถานการณ์ที่ต้องตัดสินใจ
- **Decision** — เลือกอะไร
- **Consequences** — ผลที่ตามมา (ดี + ไม่ดี)
- **Alternatives** — ทางเลือกอื่นที่พิจารณา

---

## สารบัญ

| # | ADR | Status |
|---|-----|--------|
| 001 | เลือก Stack: Spring Boot + React + MSSQL | ✅ Accepted |
| 002 | มี Backend 2 ตัว (Spring Boot + Express mock) | ⚠️ Deprecated |
| 003 | JWT แทน Session | ✅ Accepted |
| 004 | KiosBioAgent แยกเป็น .NET app | ✅ Accepted |
| 005 | WebAuthn สำหรับ Tablet | ✅ Accepted |
| 006 | Barrier Measurement (record พิเศษ) | ✅ Accepted |
| 007 | Approval table เก็บทุก type | ✅ Accepted |
| 008 | Polling แทน WebSocket | ✅ Accepted |
| 009 | Outer Inspection แยก table | ✅ Accepted |
| 010 | Sorting Reason เป็น Master Data | ✅ Accepted |
| 011 | Role MANAGEMENT (Read-only) | ✅ Accepted |
| 012 | RED Event QA-only approval | ✅ Accepted |
| 013 | Frontend แสดงสีตามสถานะ (ไม่ใช่ tag color คงที่) | ✅ Accepted |
| 014 | targetTubes ใน WO (แทน targetOuter) | ✅ Accepted |

---

## ADR-001: เลือก Stack — Spring Boot + React + MSSQL

**Status:** ✅ Accepted (2025)

**Context:**
ระบบ Weight Inspection ต้องการ:
- รองรับ user หลายร้อยคน + concurrent
- เชื่อม MS SQL Server (มาตรฐานของโรงงานที่ใช้อยู่)
- มี UI สวย เรียกใช้ง่ายในโรงงาน
- ทีมพัฒนามีประสบการณ์ Java + JavaScript

**Decision:**
- **Backend:** Spring Boot 3.5 + Java 21
- **Frontend:** React 18 + Vite + TypeScript + Ant Design 5
- **Database:** MS SQL Server 2022
- **Build:** Maven (backend), npm + Vite (frontend)

**Consequences:**
- ✅ Mature ecosystem, support ระยะยาว
- ✅ Spring Security + JPA = standard authentication + ORM
- ✅ MS SQL Server เข้ากับ infrastructure เดิม
- ✅ TypeScript = type safety + IDE help
- ✅ Ant Design = component library ครบ + ดี
- ❌ Heavier than alternatives (Express + Postgres)
- ❌ JVM startup ช้า (10-20 วินาที)

**Alternatives ที่พิจารณา:**
- **Node.js + Express + PostgreSQL** — เบากว่า แต่ไม่เข้ากับ MS SQL ของโรงงาน
- **.NET + Blazor** — เข้ากับ MS SQL ดี แต่ทีมไม่ค่อยถนัด .NET
- **Django + Vue** — ดีแต่ทีมไม่เคยใช้ Django ใน production

---

## ADR-002: มี Backend 2 ตัว (Spring Boot + Express mock)

**Status:** ⚠️ Deprecated (เป็น artifact ที่ควรลบใน future)

**Context:**
ตอนเริ่มโปรเจกต์ (2025) ทีมยังไม่พร้อม build Spring Boot environment ในเครื่อง dev จึงสร้าง Express + TypeScript เป็น **mock API ชั่วคราว** ใน folder `backend/` เพื่อให้ frontend dev ได้

**Decision:**
- เก็บ `backend/` (Express mock) ไว้ใน repo
- พัฒนา `backend-spring/` เป็น production backend
- `backend/` ใช้สำหรับ frontend testing แบบ standalone เท่านั้น

**Consequences:**
- ✅ Frontend dev ไม่ต้องรอ backend
- ❌ มีโค้ดซ้ำซ้อน — 2 backend ที่ต้อง sync API contract
- ❌ Confusion สำหรับคนใหม่ที่ไม่รู้ว่าตัวไหนใช้จริง

**Future:**
- ลบ `backend/` ออก หลัง production stable
- ใช้ MSW (Mock Service Worker) หรือ Vite proxy แทน ถ้าต้องการ mock

---

## ADR-003: JWT แทน Session

**Status:** ✅ Accepted

**Context:**
ต้องการ authentication ที่:
- Scale ได้ถ้ามี backend หลาย instance ในอนาคต
- Frontend store ได้ใน browser
- รองรับ KiosBioAgent (.NET) ที่อยู่คนละ origin

**Decision:**
- ใช้ JWT (JJWT 0.12)
- Algorithm: HS256
- Expire: 1 ชั่วโมง
- Refresh: `/api/auth/refresh` endpoint
- Store: `localStorage` ใน browser (มี risk แต่ trade-off ที่ยอมรับได้สำหรับ environment โรงงาน)

**Consequences:**
- ✅ Stateless — scale ได้
- ✅ Frontend ใช้สะดวก
- ✅ ส่งผ่าน HTTP header → KiosBioAgent ใช้ร่วมได้
- ❌ ยกเลิก token ก่อนเวลายาก (ต้องมี blacklist)
- ❌ XSS เสี่ยงเพราะ localStorage (mitigate: HTTPS + CSP + ระวัง XSS เสมอ)

**Alternatives:**
- **Spring Session + Redis** — Stateful, revoke ง่าย แต่ต้อง Redis เพิ่ม
- **httpOnly Cookie + CSRF token** — XSS resist ดีกว่า แต่ KiosBioAgent ใช้ยาก (cross-origin)

**Future improvement:**
- พิจารณา httpOnly Cookie สำหรับ Tablet (WebAuthn) — เพราะไม่ต้องการให้ Tablet มี token ใน localStorage
- เพิ่ม token blacklist ใน Redis เมื่อระบบใหญ่ขึ้น

---

## ADR-004: KiosBioAgent แยกเป็น .NET app

**Status:** ✅ Accepted

**Context:**
DigitalPersona Fingerprint Reader มี SDK เฉพาะ .NET Framework — เรียกจาก browser โดยตรงไม่ได้

**Decision:**
- สร้าง **KiosBioAgent** เป็น .NET 6 minimal API
- รันบน Operator PC ที่ port 5001 (HTTPS self-signed)
- Browser → fetch `https://localhost:5001/identify` → ส่ง challenge
- Agent สแกนนิ้ว → return signed data
- Browser ส่ง signed data ต่อให้ backend verify

**Consequences:**
- ✅ ใช้ DigitalPersona SDK ได้เต็มที่
- ✅ Browser ไม่ต้องมี driver
- ✅ Scale ได้ (1 agent ต่อ 1 PC)
- ❌ ต้อง install + setup ทุกเครื่อง
- ❌ Self-signed cert → browser ต้อง trust
- ❌ Restart PC = ต้องเปิด agent ใหม่ (mitigate: auto-start at boot)

**Alternatives:**
- **WebUSB API** — ไม่ support DigitalPersona
- **Native messaging extension** — ลึกซับซ้อนกว่า
- **กดจาก backend** — backend ติดต่อ reader โดยตรง (ต้องใช้ remote driver, ไม่ practical)

---

## ADR-005: WebAuthn สำหรับ Tablet

**Status:** ✅ Accepted (เพิ่มภายหลัง)

**Context:**
หลาย Operator ใช้ Tablet (มี Touch ID / fingerprint sensor ในตัว) — ไม่มีพอร์ตต่อ DigitalPersona Reader

**Decision:**
- ใช้ **WebAuthn API** (มาตรฐาน W3C)
- Library: Yubico java-webauthn-server (backend), Native browser API (frontend)
- Credential bound to device — ลงทะเบียนแยกแต่ละ tablet

**Consequences:**
- ✅ ใช้ native sensor (Touch ID / Windows Hello)
- ✅ Standard — รองรับทุก modern browser
- ✅ Phishing-resistant
- ❌ Credential ผูกกับ device — เปลี่ยน tablet ต้องลงทะเบียนใหม่
- ❌ ต้องเก็บ challenge state (ปัจจุบันใช้ in-memory ConcurrentHashMap — มีปัญหาถ้า restart, ดู TODO.md)

**Future:**
- ย้าย challenge store ไป Redis เพื่อ multi-instance + restart resilience

---

## ADR-006: Barrier Measurement (record พิเศษ)

**Status:** ✅ Accepted

**Context:**
เมื่อ QA Apply Std ใหม่ (จาก Yellow Streak 5) — ต้องการ "ตัด" streak ที่นับจาก measurement ล่าสุดย้อนหลัง
ถ้าใช้ flag ใน Measurement entity → query streak ยุ่งยาก (ต้องเช็ค flag ทุก row)

**Decision:**
- สร้าง record พิเศษใน `measurements` table:
  - `outer_box_number = '000'`
  - `inner_box_order = 'RST1'`, `'RST2'`, ...
  - `is_for_standard_adjustment = true`
- Logic streak: query latest N records, ถ้าเจอ barrier ก่อนนับครบ → streak reset

**Consequences:**
- ✅ Query streak ง่าย (LIMIT N + ORDER BY DESC)
- ✅ History เห็นชัดใน timeline (UI render barrier เป็น icon พิเศษ)
- ✅ Audit trail ครบ — ใครเป็น apply, เมื่อไหร่
- ❌ Measurement table มี row "ไม่ใช่ measurement จริง" — query ต้อง filter `WHERE NOT is_for_standard_adjustment` ทุกครั้ง
- ❌ Edge case: ถ้าลืม filter → count/sum ผิด

**Pattern เตือน:**
> ทุก aggregation query ต้องมี `WHERE COALESCE(is_for_standard_adjustment, FALSE) = FALSE`
> Frontend เช่นกัน — filter ก่อนใช้

**Alternatives:**
- **Field `streak_reset_at` ใน Measurement** — ต้องอัพเดต row หลายแถวเมื่อ reset
- **Separate `streak_resets` table** — query ซับซ้อนกว่า ต้อง LEFT JOIN
- **In-memory streak ที่ backend** — ไม่ persistent

---

## ADR-007: Approval table เก็บทุก type

**Status:** ✅ Accepted

**Context:**
มี approval หลายประเภท:
- RED_EVENT
- STD_CHANGE_REQUEST (มี stage 4 ขั้น)
- CLEANING_CHECK
- OUTER_INSPECTION

แต่ละประเภทมี fields เหมือนกันบางส่วน (status, requester, approver, timestamps)

**Decision:**
- ใช้ table `approvals` เดียว
- Field `type` แยกประเภท
- Field `payloadJson` (TEXT) เก็บข้อมูล type-specific เป็น JSON
- Field `stage` เฉพาะ STD_CHANGE_REQUEST

**Consequences:**
- ✅ Schema เรียบง่าย — 1 table, 1 controller, 1 dashboard
- ✅ เพิ่ม type ใหม่ไม่ต้อง migrate schema (แค่เพิ่ม enum)
- ✅ Generic listing endpoint ทำง่าย
- ❌ JSON ใน text → query field ภายในไม่ได้ตรง ๆ
- ❌ Type safety น้อยกว่า table แยก

**Pattern:**
- Backend: `Map<String, Object>` หรือ `JsonNode` สำหรับอ่าน
- Frontend: `JSON.parse(payloadJson)` ทุกครั้งที่ต้องการข้อมูล

**Alternatives:**
- **Table แยกตาม type** (red_events, std_changes, cleanings, outers) — type-safe กว่า แต่ controller + dashboard ต้องเขียน 4 ชุด
- **Single Table Inheritance ของ JPA** — แก้ schema ยาก, performance ไม่ดี

**Future:**
- ถ้า payload ใหญ่ขึ้น พิจารณาย้ายไป NoSQL field (PostgreSQL JSONB) — แต่ตอนนี้ MS SQL TEXT พอ

---

## ADR-008: Polling แทน WebSocket

**Status:** ✅ Accepted

**Context:**
Dashboard ของ Leader/QA ต้องการ update real-time:
- จำนวน approval pending
- Status ของ machine
- Activity log

**Decision:**
- ใช้ **HTTP polling** ทุก 15-30 วินาที (configurable)
- ไม่ใช้ WebSocket / Server-Sent Events

**Consequences:**
- ✅ ง่าย — ใช้ `setInterval` + `fetch`
- ✅ Stateless — fit กับ JWT
- ✅ ไม่ต้องเปลี่ยน nginx config (WebSocket ต้อง upgrade)
- ❌ Network overhead สูง (polling ตลอด)
- ❌ Latency 15-30 วินาทีก่อนเห็น update
- ❌ Server load ตามจำนวน connection × 1/intvl

**Trade-off ที่ยอมรับ:**
ในบริบทโรงงาน 1 กะมี Leader ≤ 5 คน + QA ≤ 3 คน → load ต่ำ
ความล่าช้า 15-30 วินาทีไม่กระทบ business (RED Event ไม่ urgent ระดับวินาที)

**Future:**
- ถ้าต้องการ realtime จริง ๆ → ใช้ Server-Sent Events (SSE) ง่ายกว่า WebSocket
- ใช้ ETag / If-Modified-Since เพื่อลด payload เมื่อไม่มีเปลี่ยน

---

## ADR-009: Outer Inspection แยก table (ไม่อยู่ใน approvals อย่างเดียว)

**Status:** ✅ Accepted (เพิ่มภายหลังตาม TODO ข้อ 12)

**Context:**
หลังเพิ่ม Outer Approver routing per Product (TODO 12):
- ถ้า Product.outerApproverRole = OPERATOR → self-check → ไม่มี approval row
- แต่ยังต้องเก็บประวัติว่าตรวจเมื่อไหร่ ใครตรวจ

**Decision:**
- สร้าง table `outer_inspections` แยก
- เก็บทุก inspection — รวม self-check ของ Operator + approve ของ QA/Leader
- มี `approval_id` (nullable) link กลับไป approvals ถ้าผ่าน flow approval

**Consequences:**
- ✅ Self-check ของ Operator มี history
- ✅ Report query inspection ทั้งหมดได้ง่าย
- ✅ Schema flexible — track reweigh count, notes, inspector identity แยกได้
- ❌ มี table เพิ่ม — ต้อง maintain
- ❌ Logic create OUTER_INSPECTION ต้องตรวจ Product master ก่อน

**Pattern:**
- ที่ ApprovalController:
  ```java
  if ("OPERATOR".equals(role)) {
      // create OuterInspection ทันที, ไม่ create Approval
  } else {
      // create ทั้ง Approval + OuterInspection
  }
  ```

---

## ADR-010: Sorting Reason เป็น Master Data

**Status:** ✅ Accepted (ตาม TODO ข้อ 11)

**Context:**
เดิม Operator ในหน้า Sorting พิมพ์ "เหตุผล" เป็น free text → ข้อมูลไม่สม่ำเสมอ + รายงาน group/count ยาก

**Decision:**
- สร้าง table `sorting_reasons` เป็น master data
- DataAdmin จัดการได้ผ่าน UI (`SortingReasonsAdmin.tsx`)
- มี field: `code`, `label_th`, `scope (BULK/SINGLE/BOTH)`, `requires_note`, `sort_order`, `is_active`
- เก็บใน `change_logs`: `reason_code` + `reason_note` (เพิ่ม), `reason` (text เดิม) คงไว้

**Consequences:**
- ✅ Standardize เหตุผล → report group ได้
- ✅ Master data flexible — เพิ่ม/แก้/ปิดใช้ ได้ตลอด
- ✅ scope + requires_note ทำให้ UI flexible
- ✅ Backward compatibility — record เก่ายังอ่านได้
- ❌ ต้อง maintain master + train DataAdmin

**Pattern:**
```
ChangeLog ─── reason (text, legacy) — composite label_th + note
            ├── reason_code (FK ไป sorting_reasons.code)
            └── reason_note (additional note ถ้า requires_note)
```

---

## ADR-011: Role MANAGEMENT (Read-only)

**Status:** ✅ Accepted (ตาม TODO ข้อ 10)

**Context:**
ผู้บริหารและหัวหน้าฝ่ายต้องการดู Dashboard + Report เพื่อติดตามผล แต่ไม่ต้องมีสิทธิ์อนุมัติ/แก้ไข

**Decision:**
- เพิ่ม Role enum `MANAGEMENT`
- Backend: อนุญาตเข้า GET endpoints ที่ Leader/QA ใช้
- Backend: **ห้าม** POST/PUT/DELETE ทุก endpoint
- Frontend: เห็นเมนู Leader/QA Dashboard + Report (3 อันเท่านั้น)
- Frontend: ส่ง prop `readOnly` ลง Dashboard → ซ่อนปุ่ม action

**Consequences:**
- ✅ Audit + monitoring โดยไม่กระทบ workflow
- ✅ Multi-role support — Management + Leader = สวมหมวก 2 ใบ
- ❌ Component Dashboard ต้องรับ prop `readOnly` + conditional render
- ❌ Backend security check ต้องครอบทุก write endpoint (กัน bypass)

---

## ADR-012: RED Event QA-only approval

**Status:** ✅ Accepted (เปลี่ยนใน TODO ข้อ 4)

**Context:**
เดิม: RED_EVENT approval ส่งให้ทั้ง Leader และ QA → ทั้งคู่กดอนุมัติได้
ปัญหา: Leader อาจอนุมัติโดยไม่ตรวจสอบเชิงคุณภาพ — risk ของผลผลิตด้อยคุณภาพ

**Decision:**
- Leader ยังเห็นการแจ้งเตือน RED Event (visibility)
- **แต่กดอนุมัติไม่ได้** — แสดง "⏳ รอ QA ปลดล็อค"
- QA = ผู้มีสิทธิ์ปลดล็อคแต่เพียงผู้เดียว
- Backend ตรวจ role ที่ endpoint approve (กัน bypass UI)

**Consequences:**
- ✅ Quality gate ชัดเจน — QA accountability
- ✅ Leader ยังรับทราบ (กรณีฉุกเฉินก็คุย QA ได้)
- ❌ ถ้า QA ไม่อยู่ → flow ติด → ต้องมี backup QA หรือเรียก QA on-call

**Implementation:**
- เก็บ `approverRole = LEADER` ของ RED_EVENT ตามเดิม (Leader Dashboard ใช้ filter)
- Frontend Leader: `if (row.type === 'RED_EVENT') return <Tag>⏳ รอ QA ปลดล็อค</Tag>`
- Backend ApprovalController: ถ้า `type == RED_EVENT && !hasRole('QA')` → 403

---

## ADR-013: Frontend แสดงสีตามสถานะจริง

**Status:** ✅ Accepted (ตาม TODO ข้อ 3, 5)

**Context:**
เดิมหลายจุดในระบบใช้สี Tag แบบคงที่ (เช่น blue) ที่ไม่สื่อสถานะจริง:
- YELLOW ×5 ในหน้า QA แสดงเป็นสีน้ำเงิน
- "บันทึกกิจกรรม" — ชั่งน้ำหนัก row ทุกแถวสีเดียวกัน ไม่บอก GREEN/YELLOW/RED

**Decision:**
- ตอน render Tag ของผลชั่ง → คำนวณ classification จริงแล้วเลือกสี
- ใน QA YELLOW ×5: ทุก weight tag แสดงสีตาม classification (green/gold/red)
- ใน Activity log: ทุก type มีสีไม่ซ้ำกัน (จาก palette antd)

**Color mapping** (ดู TODO ข้อ 5.1):
- traffic light (green/gold/red) — สงวนสำหรับสถานะการชั่ง
- ประเภทอื่นใช้ shade ต่าง (volcano, orange, geekblue, purple, cyan, magenta, blue)

**Consequences:**
- ✅ Scan ตาเร็วขึ้น
- ✅ Catch ปัญหาด้วยสายตา
- ❌ ต้อง maintain mapping (ถ้าเพิ่ม type ใหม่ต้องเพิ่มสี)

**Pattern:**
- Extract เป็น util `activityTypeTag.tsx` → reuse ได้ทั้ง 3 หน้า (Report, Leader, QA)

---

## ADR-014: targetTubes ใน WO (แทน targetOuter)

**Status:** ✅ Accepted (ตาม TODO ข้อ 7)

**Context:**
ต้องการให้ Leader กำหนดเป้าผลผลิตต่อ WO เพื่อ track progress

ทางเลือก:
- เก็บ **targetTubes** (จำนวนหลอด)
- เก็บ **targetOuter** (จำนวน Outer)

**Decision:**
- เก็บ `target_tubes: int` ใน work_orders
- คำนวณ `targetOuter = ⌈targetTubes / (innerBoxQuantity × quantityPerMeasurement)⌉` runtime

**Consequences:**
- ✅ Leader คิดในหน่วยที่คุ้น (จำนวนหลอด = ตามใบสั่งซื้อ)
- ✅ ถ้า innerBoxQuantity เปลี่ยน (เปลี่ยน Product) → ไม่ต้องแก้ targetOuter
- ✅ Granular กว่า (ระบุได้ละเอียดถึง 1 หลอด)
- ❌ Operator UI ต้องคำนวณ Outer Target แสดง

**Future:**
- ถ้าต้องการเปลี่ยน mid-WO → เพิ่มฟิลด์ `original_target_tubes` กับ `actual_target_tubes` แยกกัน

---

## รูปแบบการเพิ่ม ADR ใหม่

เมื่อต้องตัดสินใจ design ที่ส่งผลกระทบใหญ่ ให้:

1. **เปิด PR** สำหรับ ADR ใหม่ก่อนเขียนโค้ด
2. **คัดลอก template** ด้านล่าง
3. **ระบุ alternatives** ที่พิจารณาด้วย — ห้ามตัดสินใจโดยไม่เทียบ
4. **Review โดย team** อย่างน้อย 1 คน
5. **Merge → ทำตามที่ ADR ระบุ**

### Template

```markdown
## ADR-XXX: <ชื่อ decision>

**Status:** Proposed / Accepted / Deprecated / Superseded by ADR-YYY

**Context:**
สถานการณ์ที่ต้องตัดสินใจ ทำไมถึงต้องเลือก

**Decision:**
สิ่งที่เลือก (เป็นข้อ ๆ)

**Consequences:**
- ✅ ผลดี
- ❌ ผลเสีย / trade-off

**Alternatives:**
- ทางเลือก A — ทำไมไม่เลือก
- ทางเลือก B — ทำไมไม่เลือก
```

---

## 🎯 หลักการเขียน ADR

1. **Concise** — 1 ADR = 1 หน้า A4 ไม่เกิน
2. **Honest about trade-offs** — ไม่มี decision ที่ดีหมด ต้องบอกข้อเสียด้วย
3. **Reversible? Mark it.** — ถ้าเป็น decision ที่แก้ภายหลังได้ → บอก
4. **Link to code** — link ไป file/PR ที่ implement
5. **Update when superseded** — ADR เก่าไม่ลบ แค่ mark Status เปลี่ยน
