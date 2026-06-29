# Eikensystem — แผนการทดสอบ (Test Plan)

> เอกสารนี้ประกอบด้วย 2 ส่วนหลัก:
> 1. **Programmer Testing** — Unit / Integration / API / Performance / Security
> 2. **User Acceptance Test (UAT)** — แยกตาม Role พร้อม sign-off criteria
>
> Base version: commit `777aada`
> ก่อนทดสอบ — อ่าน `DEPLOYMENT.md` เพื่อ setup test environment

---

## สารบัญ

### Part A — Programmer Testing
1. [Test Strategy & Environment](#1-test-strategy--environment)
2. [Unit Tests (Backend)](#2-unit-tests-backend)
3. [Unit Tests (Frontend)](#3-unit-tests-frontend)
4. [Integration Tests](#4-integration-tests)
5. [API Tests (Postman/curl)](#5-api-tests-postmancurl)
6. [Security Tests](#6-security-tests)
7. [Performance / Load Tests](#7-performance--load-tests)
8. [Regression Test Suite](#8-regression-test-suite)

### Part B — User Acceptance Test (UAT)
9. [UAT Strategy](#9-uat-strategy)
10. [Operator UAT Scenarios](#10-operator-uat-scenarios)
11. [Leader UAT Scenarios](#11-leader-uat-scenarios)
12. [QA UAT Scenarios](#12-qa-uat-scenarios)
13. [DataAdmin UAT Scenarios](#13-dataadmin-uat-scenarios)
14. [Management UAT Scenarios](#14-management-uat-scenarios)
15. [End-to-End Scenarios](#15-end-to-end-scenarios)
16. [Sign-off Criteria](#16-sign-off-criteria)

---

# PART A — PROGRAMMER TESTING

---

## 1. Test Strategy & Environment

### 1.1 Test Environments

| Env | Purpose | Database | Frontend URL | Backend |
|-----|---------|----------|--------------|---------|
| **dev** | Developer local | H2 in-memory / Local MSSQL | http://localhost:5173 | http://localhost:8090 |
| **staging** | QA + Internal test | MSSQL (clone of prod) | https://staging.eiken.local | https://staging.eiken.local/api |
| **uat** | User Acceptance | MSSQL (UAT data) | https://uat.eiken.local | https://uat.eiken.local/api |
| **prod** | Live | MSSQL (real) | https://eiken.yourcompany.com | (internal) |

### 1.2 Test Data
- ใช้ **CSV import** จาก `samples/products.sample.csv` และ Excel ที่ user เคยส่ง (`ProductDataUbonwanRev01.xlsx`)
- Seed user: operator/op123, leader/ld123, qa/qa123, dataadmin/da123, management/mg123 (dev profile เท่านั้น)
- Test WO + Lot ที่ไม่ใช่ของจริง — prefix `TEST-`

### 1.3 Coverage Goals
- **Unit:** ≥ 70% line coverage (backend service + util)
- **Integration:** ทุก API endpoint สำคัญ
- **E2E:** ทุก critical workflow

---

## 2. Unit Tests (Backend)

### 2.1 Existing Tests
ดู `backend-spring/src/test/java/com/example/eikensystem/CalculatorTests.java`

### 2.2 Required Tests ที่ต้องเพิ่ม

| Class | ที่ต้องทดสอบ |
|-------|-------------|
| `Calculator.java` | classify() ทุก case GREEN/YELLOW/RED + boundary, SINGLE/DOUBLE mode |
| `JwtService.java` | generate, validate, expire, malformed token, fail-fast ถ้าไม่มี secret |
| `ApprovalController.java` | RED Event → QA only (Leader 403), Outer Inspection branch ตาม Product.outerApproverRole |
| `WorkOrderController.java` | targetTubes validation (min=1, required), status transitions |
| `SortingReasonController.java` | scope filter, requires_note enforcement, soft delete |
| `MeasurementController.java` | reweigh กับ barrier, reasonCode validation |
| `AdminImportService.java` | CSV mapping "Outer Approve" → role + note |

### 2.3 Run

```bash
cd backend-spring
./mvnw test
./mvnw verify    # รวม integration tests
./mvnw test jacoco:report   # coverage report ถ้าใช้ JaCoCo
```

### 2.4 Test ตัวอย่างที่สำคัญ — RED Event Security

```java
@Test
void approveRedEvent_asLeader_returns403() {
    User leader = createUser("LEADER");
    Approval redApproval = createApproval(ApprovalType.RED_EVENT);

    mockMvc.perform(post("/api/approvals/" + redApproval.getId() + "/approve")
            .header("Authorization", "Bearer " + jwt(leader)))
        .andExpect(status().isForbidden());
}

@Test
void approveRedEvent_asQa_succeeds() {
    User qa = createUser("QA");
    Approval redApproval = createApproval(ApprovalType.RED_EVENT);

    mockMvc.perform(post("/api/approvals/" + redApproval.getId() + "/approve")
            .header("Authorization", "Bearer " + jwt(qa)))
        .andExpect(status().isOk());
}
```

### 2.5 Test ตัวอย่าง — Outer Inspection branch

```java
@Test
void createOuterInspection_productWithOperatorRole_autoApproves() {
    Product p = createProduct("105073");
    p.setOuterApproverRole("OPERATOR");
    productRepo.save(p);

    OuterInspectionRequest req = new OuterInspectionRequest();
    req.setProductCode("105073");
    // ...

    var response = controller.createOuterInspection(req);

    assertThat(response.getBody()).containsEntry("selfChecked", true);
    assertThat(outerInspectionRepo.count()).isEqualTo(1);
    assertThat(approvalRepo.count()).isEqualTo(0);  // ไม่สร้าง approval
}
```

---

## 3. Unit Tests (Frontend)

### 3.1 Setup (ถ้ายังไม่มี)
```bash
cd frontend
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

### 3.2 Test cases สำคัญ

| Component | ที่ต้องทดสอบ |
|-----------|-------------|
| `MeasurementEntry` | WO dropdown label format, Outer actual/Target calculation, status classification |
| `SortingPage` | reason dropdown render, requires_note conditional input, submit payload (reasonCode) |
| `LeaderDashboard` | RED Event tag (ไม่มีปุ่ม), readOnly mode hide actions, OUTER_INSPECTION action |
| `QADashboard` | Apply Std disable inputs, YELLOW ×5 color logic, reason validation |
| `WorkOrderManagement` | targetTubes required, preview Outer Target helper |
| `App.tsx` | menu items per role (รวม MANAGEMENT) |
| `activityTypeTag` util | mapping ทุก type → สีถูกต้อง |

### 3.3 ตัวอย่าง test — Outer Actual ไม่อิงเลข Outer

```typescript
test('outerActual counts completed outers, skips numbers', () => {
  const measurements = [
    ...range(20).map(i => ({ outerBoxNumber: '001', innerBoxOrder: pad(i+1) })),
    ...range(20).map(i => ({ outerBoxNumber: '002', innerBoxOrder: pad(i+1) })),
    ...range(20).map(i => ({ outerBoxNumber: '005', innerBoxOrder: pad(i+1) })), // กระโดด
    ...range(14).map(i => ({ outerBoxNumber: '008', innerBoxOrder: pad(i+1) })), // ไม่ครบ
  ];
  expect(calcOuterActual(measurements, 20)).toBe(3);  // ไม่ใช่ 7!
});
```

---

## 4. Integration Tests

### 4.1 Backend Integration (Spring Boot Test)

ใช้ `@SpringBootTest` + Testcontainers สำหรับ SQL Server จริง:

```java
@SpringBootTest
@Testcontainers
class WorkOrderIntegrationTest {
    @Container
    static MSSQLServerContainer<?> mssql = new MSSQLServerContainer<>();

    @Test
    void createWoWithTargetTubes_thenOperatorSees() {
        // 1. Leader สร้าง WO
        // 2. Operator query active WOs
        // 3. ตรวจ targetTubes มากับ response
    }
}
```

### 4.2 Critical Integration Scenarios

- [ ] Operator ชั่งครบ 20 inner ของ outer → trigger OUTER_INSPECTION → QA / Operator / Leader ตามที่ Product กำหนด
- [ ] Operator ชั่ง YELLOW 5 ครั้ง → ระบบล็อก → STD_CHANGE_REQUEST flow
- [ ] Operator ชั่ง RED → approval สร้าง (approverRole=LEADER), Leader เห็นแต่กดไม่ได้, QA กดได้
- [ ] Sorting: Operator แก้ Outer ของ Inner → ChangeLog เก็บ reasonCode + reasonNote
- [ ] DataAdmin: ปิด sorting_reason → Operator dropdown ไม่เห็นอันนั้น
- [ ] CSV Import: row ที่ Outer Approve เป็นข้อความพิเศษ → เก็บใน note, role=QA

---

## 5. API Tests (Postman / curl)

### 5.1 ใช้ Postman Collection
สร้าง collection ครอบคลุม:

| หมวด | Endpoints |
|------|-----------|
| Auth | login, login-biometric, register-fingerprint, refresh, me |
| Products | CRUD + outerApproverRole filter |
| Work Orders | CRUD + status transitions + targetTubes |
| Measurements | classify, save, reweigh, qa-reweigh, relocate, by-outer |
| Approvals | leader-pending, qa-pending, qa-red-pending, approve, reject, allow-45, apply-std, approve-outer |
| Outer Inspection | POST, query, count |
| Sorting Reasons | GET (public + admin), POST/PUT/DELETE (admin only) |
| Reports | overview, lot-summary, operator-stats |

### 5.2 ตัวอย่าง curl ที่ต้องทดสอบ

```bash
# RED Event security check
TOKEN_LEADER=$(curl -s -X POST .../api/auth/login -d '{"username":"leader","password":"ld123"}' | jq -r .token)
TOKEN_QA=$(curl -s -X POST .../api/auth/login -d '{"username":"qa","password":"qa123"}' | jq -r .token)

# Leader ยิง → ต้อง 403
curl -X POST .../api/approvals/123/approve \
  -H "Authorization: Bearer $TOKEN_LEADER" \
  -w "\nHTTP %{http_code}\n"

# QA ยิง → ต้อง 200
curl -X POST .../api/approvals/123/approve \
  -H "Authorization: Bearer $TOKEN_QA"

# Management ยิง → ต้อง 403
TOKEN_MGMT=$(curl -s -X POST .../api/auth/login -d '{"username":"management","password":"mg123"}' | jq -r .token)
curl -X POST .../api/approvals/123/approve \
  -H "Authorization: Bearer $TOKEN_MGMT"
```

### 5.3 Negative test ที่สำคัญ
- [ ] ยิง endpoint โดยไม่มี token → 401
- [ ] ยิง endpoint ด้วย expired token → 401
- [ ] ยิง endpoint ผิด role → 403
- [ ] POST/PUT/DELETE ด้วย role MANAGEMENT → 403 ทุก endpoint
- [ ] เปลี่ยน lotNo ของ measurement ที่ closed WO → 400
- [ ] Reweigh measurement ที่ไม่มี Leader approval → 400

---

## 6. Security Tests

### 6.1 Authentication
- [ ] BCrypt password hashing (cost ≥ 12)
- [ ] JWT secret ไม่ใช่ default (`dev-secret-change-me-please-...`)
- [ ] Token expire 1 ชั่วโมง — verify timestamp
- [ ] Refresh token ทำงาน
- [ ] Logout → token ใช้ไม่ได้ (ถ้ามี blacklist) หรือ frontend clear

### 6.2 Authorization Matrix Verification

| Endpoint | OPERATOR | LEADER | QA | MGMT | ADMIN |
|----------|:--:|:--:|:--:|:--:|:--:|
| GET /api/products | ✅ | ✅ | ✅ | ✅ | ✅ |
| POST /api/products | ❌ | ❌ | ❌ | ❌ | ✅ |
| POST /api/work-orders | ❌ | ✅ | ❌ | ❌ | ✅ |
| GET /api/approvals/leader-pending | ❌ | ✅ | ❌ | ✅ | ✅ |
| GET /api/approvals/qa-red-pending | ❌ | ❌ | ✅ | ✅ | ✅ |
| POST /api/approvals/{id}/approve (RED) | ❌ | ❌ | ✅ | ❌ | ❌ |
| POST /api/approvals/{id}/approve (CLEANING) | ❌ | ✅ | ❌ | ❌ | ❌ |
| POST /api/approvals/{id}/apply-std | ❌ | ❌ | ✅ | ❌ | ❌ |
| GET /api/sorting-reasons | ✅ | ✅ | ✅ | ✅ | ✅ |
| POST /api/admin/sorting-reasons | ❌ | ❌ | ❌ | ❌ | ✅* |
| GET /api/measurements | ✅ | ✅ | ✅ | ✅ | ✅ |

*ADMIN หรือ DATA_ADMIN

### 6.3 Input Validation / Injection
- [ ] SQL Injection: ลอง `' OR 1=1--` ใน Lot No., search field
- [ ] XSS: ลอง `<script>alert(1)</script>` ใน reason note, product description
- [ ] CSRF: POST จาก origin อื่น → ต้องถูก block
- [ ] Path traversal: API ไม่รับ path เป็น input

### 6.4 OWASP Top 10 Check
- [ ] A01 Broken Access Control — Authorization matrix (6.2)
- [ ] A02 Cryptographic Failures — password hash, HTTPS, JWT
- [ ] A03 Injection — parameterized queries
- [ ] A04 Insecure Design — review approval flow
- [ ] A05 Misconfiguration — CORS, default credentials, debug endpoints
- [ ] A07 Identification Failures — rate limit login, account lockout

### 6.5 ตรวจ secrets leak
```bash
# กัน secret ใน code
grep -r "password" --include="*.java" --include="*.tsx" backend-spring/ frontend/src/
grep -r "secret" --include="*.yml" backend-spring/src/main/resources/
```

---

## 7. Performance / Load Tests

### 7.1 ใช้ JMeter / k6

### 7.2 Test scenarios
- **Concurrent users:** 50 Operators ชั่งพร้อมกัน
- **Burst:** 100 measurement save / นาที
- **Long-running:** Operator ชั่ง 8 ชั่วโมง = ~4000 measurements
- **Dashboard polling:** 10 Leaders + 5 QAs poll ทุก 15-20 วินาที ตลอด 8 ชม.

### 7.3 Performance Targets
| Endpoint | p50 | p95 | p99 |
|----------|-----|-----|-----|
| Login | < 200ms | < 500ms | < 1s |
| Classify measurement | < 100ms | < 300ms | < 500ms |
| Save measurement | < 200ms | < 500ms | < 1s |
| Leader pending count | < 100ms | < 200ms | < 500ms |
| Dashboard load | < 500ms | < 1s | < 2s |
| Report (รายงาน WO) | < 1s | < 3s | < 5s |

### 7.4 ตัวอย่าง k6 script

```javascript
import http from 'k6/http';
export const options = { vus: 50, duration: '5m' };
export default function () {
  const token = login();
  http.post(`${BASE}/api/measurements/classify`, JSON.stringify({
    weight: 374.5, productCode: '105073'
  }), { headers: { Authorization: `Bearer ${token}` }});
}
```

---

## 8. Regression Test Suite

### 8.1 Critical Regression Tests (รันทุกครั้งก่อน deploy)

#### Phase 1 Security
1. RED Event: Leader ไม่มีปุ่มอนุมัติ + API 403
2. RED Event: QA อนุมัติได้
3. MANAGEMENT login → เห็นเฉพาะเมนู Leader/QA/Report
4. MANAGEMENT POST → 403 ทุก endpoint

#### Phase 2 Master Data
5. Product.outerApproverRole=OPERATOR → self-check ไม่สร้าง approval
6. Product.outerApproverRole=LEADER → Leader Dashboard เห็น OUTER_INSPECTION
7. Product.outerApproverNote ปรากฏใน Modal Approve
8. CSV Import: "Outer Approve" = "ชั่งน้ำหนัก..." → เก็บใน note
9. Sorting reason dropdown render + requires_note → conditional field
10. Sorting submit ส่ง reasonCode (ไม่ใช่ reason text)
11. Leader WO form มี targetTubes + validation

#### Phase 3 Operator
12. WO dropdown: `Machine: X | Product: Y | Lot: Z`
13. Outer Actual ถูกต้องแม้ Outer กระโดด (002 → 005 → 008)

#### Phase 4 QA
14. Apply Std: เลขทุกช่อง disabled, "เหตุผล" แก้ได้
15. YELLOW ×5 Tag: สีตามค่า classification

#### Phase 5 Dashboard
16. จำนวนหลอด: count × Qty ถูกต้อง
17. Efficiency %: Progress bar + ตัวเลขใต้ถูกต้อง

#### Phase 6 Report
18. Activity log: ทุกประเภทมีสี Tag ต่างกัน
19. ชั่งน้ำหนัก GREEN/YELLOW/RED → 3 สีต่าง

### 8.2 Run Automation

```bash
# Backend
cd backend-spring && ./mvnw verify

# Frontend
cd frontend && npm test

# E2E (ถ้ามี Playwright/Cypress)
cd e2e && npx playwright test
```

---

# PART B — USER ACCEPTANCE TEST (UAT)

---

## 9. UAT Strategy

### 9.1 ผู้เกี่ยวข้อง

| Role | จำนวน Tester | สิ่งที่ทดสอบ |
|------|:-----------:|--------------|
| Operator | 3 คน | ทุกหน้าที่ Operator ใช้ |
| Leader | 2 คน | Dashboard + WO management |
| QA | 2 คน | Dashboard + Approval flows |
| DataAdmin | 1 คน | Master Data management |
| Management | 1 คน | View-only flows |
| QA Lead | 1 คน | Sign-off |

### 9.2 ช่วงเวลา UAT
- **Round 1:** 3-5 วัน — ทดสอบ functionality
- **Round 2:** 2-3 วัน — แก้ bug ที่พบและ re-test
- **Sign-off:** 1 วัน — meeting + approval

### 9.3 เครื่องมือเก็บผล
- **Bug tracker:** Jira / GitHub Issues / Google Sheet
- **Format:** Test ID | Steps | Expected | Actual | Pass/Fail | Severity | Note

### 9.4 Severity Levels
- 🔴 **Critical** — Blocking workflow, ต้องแก้ก่อน deploy
- 🟠 **High** — กระทบใช้งานหลัก, ควรแก้ก่อน deploy
- 🟡 **Medium** — กระทบ UX แต่ workaround ได้
- 🟢 **Low** — cosmetic, แก้ทีหลังได้

---

## 10. Operator UAT Scenarios

### 10.1 Login
| # | Test Step | Expected |
|---|-----------|----------|
| OP-LOGIN-01 | Login ด้วย username/password | เข้าระบบ + เห็นเมนูชั่งน้ำหนัก/Sorting |
| OP-LOGIN-02 | Login ด้วยลายนิ้วมือ (PC + KiosBioAgent) | เข้าระบบสำเร็จ |
| OP-LOGIN-03 | Login ด้วยลายนิ้วมือ (Tablet WebAuthn) | เข้าระบบสำเร็จ |
| OP-LOGIN-04 | Login ด้วย password ผิด 3 ครั้ง | แสดง error เหมาะสม |
| OP-LOGIN-05 | Session หมดอายุ → notify 5 นาทีก่อน | แสดงปุ่ม "ต่อ Session" |

### 10.2 หน้าชั่งน้ำหนัก — เริ่มงาน
| # | Test Step | Expected |
|---|-----------|----------|
| OP-WO-01 | เปิด dropdown WO | เห็น `Machine: X | Product: Y | Lot: Z` |
| OP-WO-02 | พิมพ์ค้นหาใน dropdown | filter ทำงาน |
| OP-WO-03 | เลือก WO + กรอกชื่อ Operator | สำเร็จ |
| OP-WO-04 | ไม่มี WO ACTIVE | แสดงข้อความให้แจ้ง Leader |

### 10.3 ชั่งน้ำหนักปกติ
| # | Test Step | Expected |
|---|-----------|----------|
| OP-WEIGH-01 | สแกน barcode + ชั่ง → GREEN | บันทึก + กล่องถัดไป |
| OP-WEIGH-02 | ชั่ง → YELLOW (1-2 ครั้ง) | บันทึก + แสดง streak counter |
| OP-WEIGH-03 | ชั่ง → YELLOW ครบ 5 | ระบบล็อก + ปุ่ม STD_CHANGE_REQUEST |
| OP-WEIGH-04 | ชั่ง → RED | ระบบล็อก + รอ QA |
| OP-WEIGH-05 | RED + QA อนุมัติ + ชั่งซ้ำ | ChangeLog บันทึก reweigh |
| OP-WEIGH-06 | DOUBLE mode: ชั่ง 2 ครั้ง | จัดเก็บ weight1, weight2 |

### 10.4 Outer Actual / Target (ข้อ 8) — สำคัญมาก!
| # | Test Step | Expected |
|---|-----------|----------|
| OP-OT-01 | WO ที่มี targetTubes=10000 + Qty=50, IBQ=20 | แสดง Card "000 / 010" ข้างปุ่มแก้ไข |
| OP-OT-02 | ชั่ง 1 outer ครบ (20 inner) | แสดง "001 / 010" |
| OP-OT-03 | กระโดด Outer 002 → 005 (แก้เลข) | นับ Outer Actual ถูก (ไม่ใช่ 4) |
| OP-OT-04 | ชั่งครบเป้าหมาย (10/10) | สีเหลือง |
| OP-OT-05 | ชั่งเกินเป้าหมาย (11/10) | สีแดง |
| OP-OT-06 | WO ไม่มี targetTubes | ซ่อน card |

### 10.5 Outer Inspection (ข้อ 12) — ตามผู้ตรวจที่กำหนด
| # | Test Step | Expected |
|---|-----------|----------|
| OP-OI-01 | Product=QA approver + ชั่งครบ Outer | สร้าง approval ส่งไป QA, แสดง "ส่ง QA ตรวจสอบ Outer ... แล้ว" |
| OP-OI-02 | Product=Operator approver + ชั่งครบ Outer | บันทึกทันที, แสดง "✓ บันทึก Outer ... (ตรวจเองสำเร็จ)" |
| OP-OI-03 | Product=Leader approver | ส่งไป Leader Dashboard |
| OP-OI-04 | Product มี outerApproverNote | message ของ Operator แสดง note ด้วย |

### 10.6 Sorting (ข้อ 11)
| # | Test Step | Expected |
|---|-----------|----------|
| OP-SORT-01 | เปิดหน้า Sorting | แสดงรายการกล่อง |
| OP-SORT-02 | กดแก้ไข Inner | Modal เปิด, dropdown "เหตุผล" (ไม่ใช่ text input) |
| OP-SORT-03 | dropdown แสดงเฉพาะ active reasons | true |
| OP-SORT-04 | เลือก reason ที่ requires_note=true | field "หมายเหตุ" ปรากฏ |
| OP-SORT-05 | submit โดยไม่กรอก note (เมื่อ required) | แสดง error |
| OP-SORT-06 | Bulk relocate Outer | เหมือนกัน — dropdown |
| OP-SORT-07 | บันทึกสำเร็จ → ChangeLog | เก็บ reasonCode + reasonNote |

### 10.7 Cleaning Check
| # | Test Step | Expected |
|---|-----------|----------|
| OP-CLEAN-01 | กดขอ Cleaning Check | สถานะ PENDING |
| OP-CLEAN-02 | ขอซ้ำในชั่วโมงเดียวกัน | error: dedup |
| OP-CLEAN-03 | Leader อนุมัติ | สถานะ APPROVED |

### 10.8 Account Management
| # | Test Step | Expected |
|---|-----------|----------|
| OP-ACC-01 | เปลี่ยน password (≥6 ตัว) | สำเร็จ |
| OP-ACC-02 | ลงทะเบียนลายนิ้วมือ PC | สำเร็จ |
| OP-ACC-03 | ลงทะเบียน WebAuthn Tablet | สำเร็จ |

---

## 11. Leader UAT Scenarios

### 11.1 สร้าง / จัดการ Work Order
| # | Test Step | Expected |
|---|-----------|----------|
| LD-WO-01 | สร้าง WO ใหม่ครบฟิลด์ + targetTubes | สำเร็จ |
| LD-WO-02 | สร้าง WO โดยไม่กรอก targetTubes | error: required |
| LD-WO-03 | แสดง preview Outer Target ใต้ targetTubes | สูตรถูกต้อง |
| LD-WO-04 | DOUBLE mode product → form แสดง customStd1/2 | true |
| LD-WO-05 | เปลี่ยนสถานะ ACTIVE → SORTING | สำเร็จ + Operator เห็นเมนู Sorting |
| LD-WO-06 | เปลี่ยน SORTING → END | สำเร็จ + ออกรายงานได้ |
| LD-WO-07 | ลบ WO ที่ยังไม่เริ่ม | สำเร็จ |
| LD-WO-08 | ลบ WO ที่มี measurement | error |

### 11.2 Leader Dashboard
| # | Test Step | Expected |
|---|-----------|----------|
| LD-DASH-01 | เห็นตาราง Machine Status ครบทุก machine | true |
| LD-DASH-02 | Badge "Pending" update ทุก 20 วินาที | true |
| LD-DASH-03 | RED Event row → แสดง "⏳ รอ QA ปลดล็อค" (ไม่มีปุ่ม) | ตามข้อ 4! |
| LD-DASH-04 | OUTER_INSPECTION (Product set Leader) → ปุ่ม approve | ตามข้อ 12 |
| LD-DASH-05 | OUTER_INSPECTION มี approverNote → callout warning | true |
| LD-DASH-06 | CLEANING_CHECK → ปุ่ม "อนุมัติ Clean" | สำเร็จ |
| LD-DASH-07 | จำนวนหลอด column → ถูกต้อง | ตามข้อ 6 |
| LD-DASH-08 | Efficiency % column → ถูกต้อง | ตามข้อ 9 |
| LD-DASH-09 | Summary card "ผลผลิตรวม" + "ประสิทธิภาพรวม" | ถูกต้อง |

### 11.3 รายงาน WO
| # | Test Step | Expected |
|---|-----------|----------|
| LD-RPT-01 | เปิดรายงานทุก tab | render ไม่ crash |
| LD-RPT-02 | บันทึกกิจกรรม → สี Tag แยกตามประเภท | ตามข้อ 5 |
| LD-RPT-03 | ชั่งน้ำหนัก row → สีตาม GREEN/YELLOW/RED | ตามข้อ 5 |
| LD-RPT-04 | Export Excel | ดาวน์โหลดสำเร็จ |
| LD-RPT-05 | Filter ตามวันที่ | กรองถูก |
| LD-RPT-06 | Operator Stats → pass rate ถูกต้อง | true |

---

## 12. QA UAT Scenarios

### 12.1 QA Dashboard — ภาพรวม
| # | Test Step | Expected |
|---|-----------|----------|
| QA-DASH-01 | เห็น 3 ตัวเลข: STD Change / Outer / RED | true |
| QA-DASH-02 | Badge update ทุก 15 วินาที | true |
| QA-DASH-03 | จำนวนหลอด + Efficiency column | ตามข้อ 6, 9 |

### 12.2 STD Change Request (ข้อ 2 + 3)
| # | Test Step | Expected |
|---|-----------|----------|
| QA-STD-01 | REQUESTED state → ปุ่ม Allow 4&5 | สำเร็จ |
| QA-STD-02 | YELLOW ×5 Tags → สีตาม classification | ตามข้อ 3 |
| QA-STD-03 | READY_FOR_APPLY → ทุก input number = disabled | ตามข้อ 2 |
| QA-STD-04 | เฉพาะ "เหตุผล" แก้ได้ | true |
| QA-STD-05 | "เหตุผล" ว่าง → ปุ่ม Apply Std disabled | true |
| QA-STD-06 | กด Apply Std → บันทึก StandardWeightLog + Barrier | true |
| QA-STD-07 | หลัง apply → Operator streak reset | true |

### 12.3 RED Event (ข้อ 4) — สำคัญมาก!
| # | Test Step | Expected |
|---|-----------|----------|
| QA-RED-01 | เห็นรายการ RED Event ของทุก machine | true |
| QA-RED-02 | ปุ่ม "อนุมัติ RED" (เฉพาะ QA) | true |
| QA-RED-03 | ระบุเหตุผล → กดอนุมัติ | สำเร็จ + Operator เห็น approved |
| QA-RED-04 | Leader ดู Dashboard → เห็นแต่กดไม่ได้ | ตามข้อ 4! |

### 12.4 Outer Inspection
| # | Test Step | Expected |
|---|-----------|----------|
| QA-OI-01 | รายการ OUTER_INSPECTION (Product=QA) | แสดง |
| QA-OI-02 | OUTER_INSPECTION (Product=OPERATOR) | ไม่แสดง — ตามข้อ 12! |
| QA-OI-03 | เปิด detail → ดูทุก Inner ในกล่อง | true |
| QA-OI-04 | ชั่งซ้ำ Inner (qa-reweigh) | timestamp คงเดิม → ตามข้อ 12 |
| QA-OI-05 | กด Approve Outer | สำเร็จ + Operator เห็น approved |
| QA-OI-06 | Product มี approverNote → callout ใน Modal | ตามข้อ 12 |

### 12.5 รายงาน WO (เหมือน Leader)
ดู section 11.3

---

## 13. DataAdmin UAT Scenarios

### 13.1 Users
| # | Test Step | Expected |
|---|-----------|----------|
| DA-USR-01 | สร้าง user ใหม่ ทุก role (รวม MANAGEMENT) | สำเร็จ |
| DA-USR-02 | Reset password | สำเร็จ + user login ได้ |
| DA-USR-03 | Disable user | user login ไม่ได้ |
| DA-USR-04 | ลงทะเบียนนิ้วแทน user | สำเร็จ |
| DA-USR-05 | Import CSV (samples/users.sample.csv) | สำเร็จ |

### 13.2 Products
| # | Test Step | Expected |
|---|-----------|----------|
| DA-PRD-01 | สร้าง Product ใหม่ครบฟิลด์ | สำเร็จ |
| DA-PRD-02 | Set outerApproverRole = QA / Operator / Leader | save ได้ทั้ง 3 |
| DA-PRD-03 | กรอก outerApproverNote (ไม่บังคับ) | save ได้ |
| DA-PRD-04 | DOUBLE mode + standardWeight1/2 | save + validate |
| DA-PRD-05 | Import CSV (ProductDataUbonwanRev01.xlsx) | "Outer Approve" map ถูกต้อง |
| DA-PRD-06 | Import row ที่ "Outer Approve" = ข้อความพิเศษ | role=QA, note=ข้อความ |

### 13.3 Scales / Machines
| # | Test Step | Expected |
|---|-----------|----------|
| DA-SCL-01 | สร้าง Scale + Machine | สำเร็จ |
| DA-SCL-02 | Toggle is_active | reflect ใน dropdown ของ Leader |

### 13.4 Sorting Reasons (ข้อ 11) — ใหม่!
| # | Test Step | Expected |
|---|-----------|----------|
| DA-SR-01 | เห็นเมนู "เหตุผล Sorting" | true |
| DA-SR-02 | สร้าง reason ใหม่ครบฟิลด์ | สำเร็จ |
| DA-SR-03 | scope=BULK → เห็นเฉพาะใน Bulk mode | true |
| DA-SR-04 | scope=SINGLE → เห็นเฉพาะใน Single edit | true |
| DA-SR-05 | requires_note=true → Operator ต้องกรอกเพิ่ม | true |
| DA-SR-06 | sort_order → เรียงใน dropdown ถูก | true |
| DA-SR-07 | Disable reason → Operator dropdown ไม่เห็น | true |
| DA-SR-08 | แก้ label → Operator เห็นทันที (refresh) | true |
| DA-SR-09 | record เก่าใน ChangeLog ยังอ่านได้ | true (backward compat) |

### 13.5 Standard Weight Log
| # | Test Step | Expected |
|---|-----------|----------|
| DA-SWL-01 | เห็นประวัติการเปลี่ยน Std | true |
| DA-SWL-02 | Filter ตาม product + date | กรองถูก |

---

## 14. Management UAT Scenarios

### 14.1 Menu visibility
| # | Test Step | Expected |
|---|-----------|----------|
| MG-MENU-01 | Login → เมนูที่เห็น | Leader Dashboard, QA Dashboard, รายงาน WO (3 อันเท่านั้น) |
| MG-MENU-02 | ไม่เห็น Operator (ชั่ง, Sorting) | true |
| MG-MENU-03 | ไม่เห็น Work Order Management | true |
| MG-MENU-04 | ไม่เห็น Admin Master Data | true |

### 14.2 Leader Dashboard (Read-only)
| # | Test Step | Expected |
|---|-----------|----------|
| MG-LD-01 | เห็นทุกข้อมูลใน Leader Dashboard | true |
| MG-LD-02 | ปุ่ม "อนุมัติ" ทุกชนิด → **ไม่แสดง** (หรือ disabled) | ตามข้อ 10! |
| MG-LD-03 | ส่วน "Leader แก้ไข Inner / น้ำหนัก" → ซ่อน | true |
| MG-LD-04 | ปุ่ม Report ใช้ได้ | true |

### 14.3 QA Dashboard (Read-only)
| # | Test Step | Expected |
|---|-----------|----------|
| MG-QA-01 | เห็นทุกข้อมูลใน QA Dashboard | true |
| MG-QA-02 | ปุ่ม Apply Std / Allow / Approve → ไม่แสดง | true |
| MG-QA-03 | ปุ่ม Approve RED → ไม่แสดง | true |

### 14.4 รายงาน WO
| # | Test Step | Expected |
|---|-----------|----------|
| MG-RPT-01 | เปิดได้ทุก tab | true |
| MG-RPT-02 | Export Excel | true |

### 14.5 Security (Backend)
| # | Test Step | Expected |
|---|-----------|----------|
| MG-SEC-01 | ยิง POST/PUT/DELETE ใด ๆ ด้วย token MGMT | 403 ทุกครั้ง |

---

## 15. End-to-End Scenarios

### 15.1 Scenario: ทำงานครบ 1 กะ
1. Leader Login → สร้าง WO (Product=105073, target=5000, Std=375)
2. Leader Login → เปลี่ยน WO เป็น ACTIVE
3. Operator Login → เลือก WO → กรอกชื่อ
4. Operator ชั่ง 20 กล่อง = 1 Outer ครบ
5. ระบบส่ง OUTER_INSPECTION ให้ QA (Product=QA approver)
6. Operator ชั่งต่อ Outer ที่ 2 — 3 กล่อง YELLOW (warning)
7. QA Login → ตรวจ Outer 001 → ชั่งซ้ำ inner 0015 → Approve
8. Operator ชั่ง YELLOW ครบ 5 → ระบบล็อก
9. Operator กดสร้าง STD_CHANGE_REQUEST
10. QA → Allow 4&5
11. Operator ชั่งกล่อง 4-5 → ส่ง proposal
12. QA → Apply Std → Barrier ถูกสร้าง
13. Operator ทุกชั่วโมง → ขอ Cleaning Check → Leader อนุมัติ
14. ผลิตจนถึง 10 Outer = ครบเป้า → Card สีเหลือง
15. Leader เปลี่ยน WO → SORTING
16. Operator เปิด Sorting → ย้าย box ที่ผิด (dropdown reason)
17. Leader เปลี่ยน WO → END
18. Leader/QA ออกรายงาน

**Pass criteria:** ทุกขั้นทำงานต่อเนื่อง ไม่ crash ไม่ค้าง

### 15.2 Scenario: RED Event Flow
1. Operator ชั่ง → RED
2. ระบบสร้าง RED_EVENT approval
3. Leader Dashboard เห็น row + Tag "⏳ รอ QA"
4. Leader **กดไม่ได้** ✓
5. QA Dashboard เห็น row + ปุ่ม "อนุมัติ RED"
6. QA ระบุเหตุผล + กด → approved
7. Operator เห็นปลดล็อค + กดชั่งซ้ำ
8. ChangeLog เก็บ history

**Pass criteria:** ขั้นที่ 4 **ต้อง** กดไม่ได้

### 15.3 Scenario: Outer Inspection (Mixed Products)
1. WO-1 Product=105073 (approver=QA) → Operator ชั่งครบ Outer → ส่ง QA ✓
2. WO-2 Product=G-PZ11 (approver=Operator) → ชั่งครบ Outer → self-check ✓
3. WO-3 Product=X (approver=Leader) → ชั่งครบ → Leader Dashboard เห็น ✓

**Pass criteria:** 3 case routing ถูกต้องตาม Product master

### 15.4 Scenario: Management View
1. Management Login → เห็นแค่ Leader/QA/Report
2. เปิด Leader Dashboard → ทุกข้อมูล + ไม่มีปุ่ม action
3. เปิด QA Dashboard → ทุกข้อมูล + ไม่มีปุ่ม action
4. ยิง API POST → 403

**Pass criteria:** Read-only ทุกจุด

---

## 16. Sign-off Criteria

### 16.1 Pass Criteria
- **Critical bugs:** 0
- **High bugs:** ≤ 3 (ต้องมี workaround)
- **Medium bugs:** ≤ 10
- **Test cases pass rate:** ≥ 95%
- **Performance targets:** met (section 7.3)
- **Security audit:** ผ่าน (section 6)

### 16.2 Sign-off Document Template

```
Test Plan ID: TP-EIKEN-2026-001
Version: 1.0
Date: ____________

ผู้ทดสอบ:
[ ] Operator Team — _____________ (3 คน) — Pass / Fail
[ ] Leader Team — _____________ (2 คน) — Pass / Fail
[ ] QA Team — _____________ (2 คน) — Pass / Fail
[ ] DataAdmin — _____________ — Pass / Fail
[ ] Management — _____________ — Pass / Fail

Summary:
Total Test Cases: ____
Passed: ____ (___%)
Failed: ____ (___%)
Blocked: ____

Critical Bugs: ____
High Bugs: ____
Medium Bugs: ____
Low Bugs: ____

Performance Test: Pass / Fail
Security Test: Pass / Fail

Recommendation: GO / NO-GO / GO with conditions

ผู้ Sign-off:
________________________  Project Manager
________________________  QA Lead
________________________  IT Manager
________________________  Operations Manager
```

### 16.3 Conditional GO
ถ้ามี High bug ที่ workaround ได้:
- ทำเอกสาร known issues
- แจ้ง user ก่อนเปิดใช้งาน
- มี timeline แก้ใน 1-2 สัปดาห์

### 16.4 NO-GO Actions
- เลื่อน deploy
- กลับไป development
- แก้ + re-test → UAT รอบใหม่

---

## ภาคผนวก A: Test Data Templates

### A.1 Test Products
```csv
productCode,productName,WghPcs,Qty,tolerance,IBQ,mode,outerApproverRole,outerApproverNote,cleanerTime
TEST-001,Test S-OC,7.5,50,1.875,20,SINGLE,QA,,4
TEST-002,Test Self-check,14,100,3.5,10,SINGLE,OPERATOR,,2
TEST-003,Test Leader-check,22,50,5.5,10,SINGLE,LEADER,,2
TEST-004,Special workflow,7.5,50,1.875,20,SINGLE,QA,"ชั่งทั้งหมดก่อนชั่ง Specimen",4
```

### A.2 Test Sorting Reasons
```csv
code,label_th,scope,sort_order,requires_note,is_active
WRONG_OUTER,กล่องผิดที่ - ต้องย้าย Outer,BOTH,10,false,true
DAMAGED,กล่องชำรุด/แตกหัก,SINGLE,20,true,true
TEST_INACTIVE,Inactive (ไม่ควรขึ้น),BOTH,99,false,false
```

### A.3 Test Users
| Username | Password | Role | Note |
|----------|----------|------|------|
| test-op1 | test1234 | OPERATOR | |
| test-op2 | test1234 | OPERATOR | |
| test-ld | test1234 | LEADER | |
| test-qa | test1234 | QA | |
| test-da | test1234 | DATA_ADMIN | |
| test-mg | test1234 | MANAGEMENT | สำหรับ test Read-only |
| test-multi | test1234 | LEADER,QA | สำหรับ test multi-role |

---

## ภาคผนวก B: Bug Report Template

```
Bug ID: BUG-____
Title: ____________________
Severity: 🔴 Critical / 🟠 High / 🟡 Medium / 🟢 Low
Priority: P1 / P2 / P3
Reporter: ________ Role: ________
Environment: dev / staging / uat / prod
Build/Commit: ________
Browser/Device: ________

Steps to Reproduce:
1. ___
2. ___
3. ___

Expected Result:
___

Actual Result:
___

Screenshot/Video:
___

Affected Test Case ID(s):
___

Workaround (if any):
___

Status: Open / In Progress / Fixed / Verified / Closed
Assigned to: ________
```

---

## 🎯 Quick Reference: Test Priorities

ถ้าเวลาน้อย ทดสอบเฉพาะ critical paths นี้ก่อน:

1. **🔴 Phase 1 Security (ข้อ 4, 10)** — บล็อก deploy ถ้าไม่ผ่าน
2. **🔴 Outer Actual ไม่อิงเลข (ข้อ 6, 8)** — สูตรผิด = ตัวเลขผิดทั้งระบบ
3. **🟠 Outer Inspection routing (ข้อ 12)** — flow ใหม่ ต้องเช็คครบ 3 case
4. **🟠 Sorting reason dropdown (ข้อ 11)** — user flow เปลี่ยน
5. **🟠 Apply Std disable + reason validation (ข้อ 2)** — กัน user แก้ตัวเลขผิด
6. **🟡 ส่วนที่เหลือ** — UX improvements
