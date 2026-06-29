# Eikensystem — Developer Guide

> คู่มือสำหรับนักพัฒนาที่จะมาทำงานต่อในโปรเจกต์
> Base: commit `777aada` (2026-06-24)

---

## สารบัญ

1. [เริ่มต้น (Quick Start)](#1-เริ่มต้น-quick-start)
2. [โครงสร้างโปรเจกต์](#2-โครงสร้างโปรเจกต์)
3. [Conventions ที่ต้องรู้](#3-conventions-ที่ต้องรู้)
4. [วิธีเพิ่ม Feature ใหม่](#4-วิธีเพิ่ม-feature-ใหม่)
5. [Common Patterns ในโค้ด](#5-common-patterns-ในโค้ด)
6. [Debugging Tips](#6-debugging-tips)
7. [Pitfalls ที่พบบ่อย](#7-pitfalls-ที่พบบ่อย)
8. [Code Review Checklist](#8-code-review-checklist)
9. [Git Workflow](#9-git-workflow)
10. [Resources](#10-resources)

---

## 1. เริ่มต้น (Quick Start)

### 1.1 Setup เครื่อง dev (Windows/Mac/Linux)

```bash
# Prerequisites
# - Java 21 (Eclipse Temurin แนะนำ)
# - Node.js 20+
# - Docker Desktop (สำหรับ MSSQL)
# - Git
# - VSCode + extensions: Spring Boot Tools, ESLint, Prettier

# 1. Clone
git clone https://github.com/rujiroje/EikenSystem.git
cd EikenSystem

# 2. Start MSSQL ผ่าน Docker
cp .env.example .env
# แก้ DB_PASS ใน .env เป็นรหัสที่ปลอดภัย
docker compose up -d mssql

# 3. Backend
cd backend-spring
./mvnw spring-boot:run
# หรือใช้ IDE Run Spring Boot ปุ่ม

# 4. Frontend (terminal ใหม่)
cd frontend
npm install
echo "VITE_API_BASE=http://localhost:8090" > .env.development
npm run dev

# 5. เปิด http://localhost:5173
# Login: operator/op123, leader/ld123, qa/qa123, dataadmin/da123
```

### 1.2 KiosBioAgent (เฉพาะกรณีพัฒนา fingerprint feature)
```cmd
cd KiosAgent\KiosBioAgent
dotnet run
# จะรันที่ https://localhost:5001
```

### 1.3 ครั้งแรกควรอ่านอะไรบ้าง

ตามลำดับ (ใช้เวลา ~3 ชั่วโมง):
1. `README.md` — Setup overview
2. `MANUAL.md` — เข้าใจ user flow ของแต่ละ Role
3. `WORKFLOW.md` — Sequence/state diagrams
4. `SYSTEM_DOCUMENTATION.md` — Roles + DB + API
5. `EikenDetail.txt` — สเปคต้นฉบับ (business logic ที่มาที่ไป)
6. **เอกสารนี้** (DEVELOPER_GUIDE.md) — code patterns + conventions

จากนั้นลอง:
- ชั่งจน YELLOW ×5 ดู STD Change flow
- ชั่ง RED ดู approval flow
- ทดลอง Sorting + เปลี่ยน reason

---

## 2. โครงสร้างโปรเจกต์

### 2.1 Repo Layout

```
EikenSystem/
├── backend-spring/              # ★ Main backend (Spring Boot)
│   └── src/main/java/com/example/eikensystem/
│       ├── EikensystemApplication.java     # Entry point
│       ├── config/                         # Beans config
│       │   ├── WebSecurityConfig.java     # ★ Auth/CORS/permissions
│       │   ├── DataInitializer.java       # Seed users/products (dev only)
│       │   └── DataSeeder.java
│       ├── domain/                         # ★ JPA Entities
│       │   ├── AppUser.java                ★ User
│       │   ├── Product.java                ★ Product master
│       │   ├── Scale.java
│       │   ├── Machine.java
│       │   ├── WorkOrder.java              ★ WO
│       │   ├── Measurement.java            ★ ผลชั่ง
│       │   ├── Approval.java               ★ All approval types
│       │   ├── OuterInspection.java        ★ NEW (Outer inspection record)
│       │   ├── SortingReason.java          ★ NEW (Sorting reason master)
│       │   ├── ChangeLog.java
│       │   ├── CleaningLog.java
│       │   ├── StandardWeightLog.java
│       │   ├── WebAuthnCredential.java
│       │   └── Role.java                   ★ Role enum
│       ├── repo/                           # JpaRepository interfaces
│       ├── service/
│       │   ├── AdminImportService.java     # CSV import
│       │   ├── CustomUserDetailsService.java  # Spring Security
│       │   └── WoAutoCloseService.java     # Auto-close stale WO
│       ├── security/
│       │   ├── JwtService.java             # ★ JWT gen/validate
│       │   └── JwtAuthFilter.java          # Filter ทุก request
│       ├── web/                            # ★ Controllers
│       │   ├── AuthController.java
│       │   ├── MeasurementController.java
│       │   ├── ApprovalController.java     ★ Critical (RED/Outer/STD)
│       │   ├── WorkOrderController.java
│       │   ├── ProductController.java
│       │   ├── ReportController.java
│       │   ├── SortingReasonController.java  ★ NEW
│       │   ├── Calculator.java              ★ Business logic
│       │   └── ...
│       └── llm/                            # Claude API integration (optional)
│   ├── src/test/java/...                   # JUnit tests
│   └── src/main/resources/
│       ├── application.yml                 # Common config
│       ├── application-h2.yml              # H2 in-memory (dev quick)
│       └── application-prod.yml            # Production overrides
│
├── frontend/                    # ★ Main frontend (React + Vite)
│   └── src/
│       ├── main.tsx                        # Entry
│       ├── api.ts                          ★ apiUrl helper
│       ├── ui/
│       │   ├── App.tsx                     ★ Menu + routing
│       │   ├── ErrorBoundary.tsx
│       │   ├── LoginWithKiosk.tsx          ★ Login (password/biometric)
│       │   ├── MeasurementEntry.tsx        ★ Operator (2382 lines!)
│       │   ├── SortingPage.tsx
│       │   ├── LeaderDashboard.tsx
│       │   ├── QADashboard.tsx
│       │   ├── WorkOrderManagement.tsx
│       │   ├── WOReportPage.tsx
│       │   ├── AdminData.tsx
│       │   └── admin/
│       │       ├── ProductsAdmin.tsx
│       │       ├── ScalesAdmin.tsx
│       │       ├── MachinesAdmin.tsx
│       │       ├── UsersAdmin.tsx
│       │       ├── SortingReasonsAdmin.tsx ★ NEW
│       │       └── CsvImport.tsx
│       └── report.tsx                      # Standalone report page
│
├── KiosAgent/KiosBioAgent/      # .NET (Windows) — DigitalPersona reader
│   └── Program.cs
│
├── backend/                     # Old Express mock (ไม่ใช้แล้ว แต่เก็บไว้)
├── db-migration/                # SQL migration files
├── docker-compose.yml           # MSSQL + nginx
├── nginx/                       # Production nginx config
├── samples/                     # CSV templates
├── README.md
├── MANUAL.md                    # User manual
├── WORKFLOW.md                  # Flow diagrams
├── SYSTEM_DOCUMENTATION.md      # API + DB
├── DEPLOYMENT.md                # Deploy ขึ้น server
├── TEST_PLAN.md                 # Testing
├── TODO.md                      # Backlog
└── DEVELOPER_GUIDE.md           # ★ ไฟล์นี้
```

### 2.2 Component Dependency Graph

```
Frontend (React)
   ↓ HTTPS + JWT Bearer
nginx (reverse proxy)
   ↓ HTTP
Spring Boot Backend (port 8090)
   ├─→ JPA → MS SQL Server (port 1433)
   ├─→ Claude API (optional)
   └─→ KiosBioAgent (Operator PC localhost:5001)
                ↓
            DigitalPersona Reader
```

---

## 3. Conventions ที่ต้องรู้

### 3.1 Naming

**Backend (Java):**
- Class: `PascalCase` — `WorkOrderController`
- Method/Variable: `camelCase` — `findActiveWorkOrders`
- Constant: `UPPER_SNAKE_CASE` — `MAX_YELLOW_STREAK`
- Package: `lowercase` — `com.example.eikensystem.domain`
- Entity field: `camelCase` ใน Java, `snake_case` ใน DB (`@Column(name = "outer_box_number")`)

**Frontend (TypeScript):**
- Component: `PascalCase` — `MeasurementEntry`
- File: ตาม component — `MeasurementEntry.tsx`
- Hook: `useXxx` — `useMeasurement`
- Variable/function: `camelCase`
- Constant: `UPPER_SNAKE_CASE` หรือ `camelCase` ขึ้นกับ scope
- Type: `PascalCase` — `type WorkOrder = {...}`

**Database:**
- Table: `snake_case` plural — `work_orders`, `measurements`
- Column: `snake_case` — `outer_box_number`, `created_at`
- Index: `idx_<table>_<columns>` — `idx_measurements_lot_outer`
- Foreign key: `fk_<from>_<to>` — `fk_measurement_product`

### 3.2 ภาษาในโค้ดและ UI

- **โค้ด:** ใช้ **อังกฤษ** เท่านั้น (variable, function, comment)
- **UI text / Toast / Error message ที่ user เห็น:** ใช้ **ภาษาไทย** (กลุ่มเป้าหมายคือ user ไทย)
- **Log message:** ใช้ **อังกฤษ** (เพื่อ debug ง่าย, grep ง่าย)
- **Commit message:** ใช้ **อังกฤษ** (Conventional Commits)

### 3.3 Folder ใน frontend/src/ui

- `ui/` (root) — page ระดับบน + components ใช้ร่วม
- `ui/admin/` — pages เฉพาะของ DATA_ADMIN
- ห้ามมี deeply nested folder — โปรเจกต์เล็กพอที่ flat structure จะดีกว่า

### 3.4 ภาษาที่ commit

ใช้ Conventional Commits + ภาษาอังกฤษ:
- `feat(role-12): add outer approver routing per product`
- `fix(red-event): restrict approval to QA role`
- `refactor(measurement): extract classification to util`
- `docs(workflow): update RED event flow`
- `test(approval): add 403 test for non-QA RED approval`
- `chore(deps): bump react to 18.3.1`

(commit message ภาษาไทยใน history เก่ามีอยู่ — ใหม่ให้ใช้ภาษาอังกฤษ)

### 3.5 Error Handling

**Backend:**
- ❌ อย่า `throw new Exception(...)` กว้าง ๆ
- ✅ ใช้ specific exception: `EntityNotFoundException`, `AccessDeniedException`, `IllegalArgumentException`
- ✅ ใช้ `@RestControllerAdvice` (ถ้าเพิ่มเข้ามา) เพื่อ centralize error response

**Frontend:**
- ทุก `fetch()` ต้องห่อ try/catch
- แสดง error ให้ user ด้วย `message.error()` หรือ `<Alert>` ของ antd
- ห้าม `console.error` แล้ว swallow — user ต้องรู้

### 3.6 ห้ามทำ

- ❌ `localStorage.setItem('password', ...)` — เด็ดขาด
- ❌ Hard-code secret / DB password / API key
- ❌ `dangerouslySetInnerHTML` (XSS risk)
- ❌ `eval()` / `Function(...)`
- ❌ Commit `.env`, `*.key`, `*.pem` (ดูใน `.gitignore`)
- ❌ `git push --force` บน `main`
- ❌ ลบ measurement record (ทุก correction = ChangeLog + new record)
- ❌ Bypass JWT check ในที่ที่ต้องการ auth
- ❌ Disable CORS เปิด `*` ใน production

---

## 4. วิธีเพิ่ม Feature ใหม่

### 4.1 Workflow ทั่วไป (Backend → Frontend)

ลำดับที่แนะนำ:

```
1. ออกแบบ entity/schema → migration file
2. Backend Entity + Repository
3. Backend Service / Controller (พร้อม JUnit test)
4. ทดสอบ API ด้วย Postman/curl
5. Frontend type definition
6. Frontend component (UI)
7. Integration test
8. Documentation update (MANUAL.md, WORKFLOW.md, SYSTEM_DOCUMENTATION.md)
```

### 4.2 ตัวอย่าง: เพิ่ม "Notification" feature

#### Step 1: DB Migration
ไฟล์: `db-migration/V010__create_notifications.sql`
```sql
CREATE TABLE notifications (
  id BIGINT IDENTITY(1,1) PRIMARY KEY,
  user_id BIGINT NOT NULL,
  type VARCHAR(50) NOT NULL,
  title NVARCHAR(255) NOT NULL,
  message NVARCHAR(1000),
  status VARCHAR(20) NOT NULL DEFAULT 'UNREAD',
  created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
  read_at DATETIME2 NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX idx_notifications_user_status ON notifications (user_id, status);
```

#### Step 2: Entity
`backend-spring/.../domain/Notification.java`
```java
@Entity
@Table(name = "notifications")
@Getter @Setter
public class Notification {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private AppUser user;

    @Column(nullable = false, length = 50)
    private String type;

    @Column(nullable = false, length = 255)
    private String title;

    @Column(length = 1000)
    private String message;

    @Column(nullable = false, length = 20)
    private String status = "UNREAD";

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "read_at")
    private Instant readAt;
}
```

#### Step 3: Repository
`repo/NotificationRepo.java`
```java
public interface NotificationRepo extends JpaRepository<Notification, Long> {
    List<Notification> findByUserAndStatusOrderByCreatedAtDesc(AppUser user, String status);
    long countByUserAndStatus(AppUser user, String status);
}
```

#### Step 4: Controller
`web/NotificationController.java`
```java
@RestController
@RequestMapping("/api/notifications")
public class NotificationController {
    private final NotificationRepo repo;
    private final AppUserRepo userRepo;

    @GetMapping
    public List<Notification> myNotifications(@AuthenticationPrincipal UserDetails u) {
        AppUser user = userRepo.findByUsername(u.getUsername()).orElseThrow();
        return repo.findByUserAndStatusOrderByCreatedAtDesc(user, "UNREAD");
    }

    @PostMapping("/{id}/read")
    public ResponseEntity<?> markRead(@PathVariable Long id, @AuthenticationPrincipal UserDetails u) {
        Notification n = repo.findById(id).orElseThrow();
        // verify owner
        if (!n.getUser().getUsername().equals(u.getUsername())) {
            return ResponseEntity.status(403).build();
        }
        n.setStatus("READ");
        n.setReadAt(Instant.now());
        repo.save(n);
        return ResponseEntity.ok().build();
    }
}
```

#### Step 5: Update Security
`config/WebSecurityConfig.java`
```java
.requestMatchers("/api/notifications/**").authenticated()
```

#### Step 6: JUnit Test
`src/test/java/.../NotificationControllerTest.java`
```java
@SpringBootTest
@AutoConfigureMockMvc
class NotificationControllerTest {
    @Autowired MockMvc mvc;
    @Test void myNotifications_returnsUnreadOnly() throws Exception {
        // setup test data
        mvc.perform(get("/api/notifications").header("Authorization", "Bearer " + jwt))
           .andExpect(status().isOk())
           .andExpect(jsonPath("$[*].status", everyItem(is("UNREAD"))));
    }
}
```

#### Step 7: Frontend Type
`frontend/src/types/notification.ts`
```typescript
export type Notification = {
  id: number;
  type: string;
  title: string;
  message?: string;
  status: 'UNREAD' | 'READ';
  createdAt: string;
  readAt?: string;
};
```

#### Step 8: Frontend Hook
```typescript
function useNotifications() {
  const [items, setItems] = useState<Notification[]>([])
  useEffect(() => {
    fetch(apiUrl('/api/notifications'), { headers: getAuthHeaders() })
      .then(r => r.json()).then(setItems)
    const t = setInterval(() => { /* refetch */ }, 30000)
    return () => clearInterval(t)
  }, [])
  return items
}
```

#### Step 9: UI Component
```tsx
function NotificationBell() {
  const items = useNotifications()
  return (
    <Badge count={items.length}>
      <BellOutlined />
    </Badge>
  )
}
```

#### Step 10: Docs
- เพิ่มหัวข้อ Notifications ใน `MANUAL.md`
- เพิ่ม endpoint ใน `SYSTEM_DOCUMENTATION.md §3`

---

## 5. Common Patterns ในโค้ด

### 5.1 Backend Patterns

#### Pattern 1: Authentication ใน Controller
```java
@GetMapping("/me")
public AppUser me(@AuthenticationPrincipal UserDetails u) {
    return userRepo.findByUsername(u.getUsername()).orElseThrow();
}
```

#### Pattern 2: Role check แบบ method-level
```java
@PreAuthorize("hasAnyRole('LEADER', 'QA', 'MANAGEMENT')")
@GetMapping("/reports/wo-overview")
public Object overview() { ... }
```

#### Pattern 3: Role check แบบ programmatic (สำหรับ logic ที่ซับซ้อน)
```java
boolean isQa = user.getAuthorities().stream()
    .anyMatch(a -> a.getAuthority().equals("ROLE_QA"));
if (!isQa) {
    throw new AccessDeniedException("QA only");
}
```

#### Pattern 4: JSON in payloadJson field
```java
// เขียน
String payload = objectMapper.writeValueAsString(Map.of(
    "productCode", "105073",
    "outer", "002"
));
approval.setPayloadJson(payload);

// อ่าน
Map<String, Object> data = objectMapper.readValue(approval.getPayloadJson(), Map.class);
```

#### Pattern 5: Transaction boundary
```java
@Transactional
public void applyStandardChange(Long approvalId, BigDecimal newStd) {
    // 1. Save StandardWeightLog
    // 2. Create Barrier Measurement
    // 3. Update Approval status
    // ทั้งหมดต้องสำเร็จด้วยกัน หรือ rollback
}
```

### 5.2 Frontend Patterns

#### Pattern 1: API call พื้นฐาน
```tsx
const res = await fetch(apiUrl('/api/measurements'), {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
  body: JSON.stringify(payload)
})
if (!res.ok) {
  const err = await res.json().catch(() => ({}))
  message.error(err.error ?? 'เกิดข้อผิดพลาด')
  return
}
const data = await res.json()
```

#### Pattern 2: Polling (Leader/QA Dashboard)
```tsx
useEffect(() => {
  if (!user) return
  const fetch = async () => { /* ... */ }
  fetch()
  const t = setInterval(fetch, 20000)
  return () => clearInterval(t)
}, [user])
```

#### Pattern 3: Form validation
```tsx
const [form] = Form.useForm()
const onFinish = async (values: any) => {
  try {
    await form.validateFields()
    // submit
  } catch (err) {
    // antd auto-display field errors
  }
}
```

#### Pattern 4: Modal pattern
```tsx
const [open, setOpen] = useState(false)
const [selected, setSelected] = useState<Item | null>(null)

const openModal = (item: Item) => { setSelected(item); setOpen(true) }
const closeModal = () => { setOpen(false); setSelected(null) }

<Modal open={open} onCancel={closeModal} onOk={handleSubmit}>
  {selected && <ItemForm item={selected} />}
</Modal>
```

#### Pattern 5: Conditional render ตาม role
```tsx
{user.roles?.includes('LEADER') && <Button onClick={...}>อนุมัติ</Button>}
{user.roles?.includes('MANAGEMENT') && <Tag>👁 View only</Tag>}
```

### 5.3 Style Patterns

ใช้ antd theme + minimal custom CSS:
```tsx
<div style={{
  display: 'flex',
  gap: 8,
  padding: 12,
  background: '#f6ffed',
  border: '1px solid #b7eb8f',
  borderRadius: 8
}}>
```

ห้าม:
- ❌ Tailwind / styled-components (ไม่ได้ใช้ในโปรเจกต์นี้)
- ❌ CSS file แยกหลายไฟล์ (ใช้ inline + `global.css` เท่านั้น)

---

## 6. Debugging Tips

### 6.1 Backend

```bash
# Log level
# ใน application.yml:
logging:
  level:
    com.example.eikensystem: DEBUG
    org.springframework.security: DEBUG    # ดู auth flow
    org.hibernate.SQL: DEBUG               # ดู SQL ที่ run
    org.hibernate.type.descriptor.sql.BasicBinder: TRACE  # ดู parameters

# H2 console (dev)
# เพิ่ม:
spring:
  h2:
    console:
      enabled: true
      path: /h2-console
# เข้า http://localhost:8090/h2-console
```

### 6.2 Frontend

```tsx
// Network tab in DevTools → see all API calls
// React DevTools → inspect state
// localStorage → ดู token (delete ถ้าค้าง)

// Quick debug
console.log('🟡 selected:', selected)
console.log('🔴 status:', status)
// แล้ว grep ใน console
```

### 6.3 DB

```bash
# Connect SQL Server
docker exec -it eiken-mssql /opt/mssql-tools18/bin/sqlcmd -S localhost -U sa -P "$DB_PASS" -C -d eikensystem

# Common queries
SELECT TOP 10 * FROM measurements ORDER BY measurement_id DESC;
SELECT * FROM approvals WHERE status='PENDING';
SELECT type, COUNT(*) FROM approvals GROUP BY type;
```

### 6.4 KiosBioAgent
```cmd
# ดู log บน console
# ถ้าไม่ตอบ
curl https://localhost:5001/health -k
```

---

## 7. Pitfalls ที่พบบ่อย

### 7.1 Outer counting อิงเลข Outer (ผิด!)

❌ **ผิด:**
```typescript
const outerActual = currentOuterNum - 1  // กระโดดข้าม → นับผิด
```

✅ **ถูก:**
```typescript
const innerByOuter = new Map<string, Set<string>>()
for (const m of measurements) {
  if (m.isForStandardAdjustment) continue
  if (!innerByOuter.has(m.outerBoxNumber)) innerByOuter.set(m.outerBoxNumber, new Set())
  innerByOuter.get(m.outerBoxNumber)!.add(m.innerBoxOrder)
}
const outerActual = [...innerByOuter.values()]
  .filter(s => s.size >= innerBoxQuantity).length
```

### 7.2 Barrier records กระทบ count

ทุก query ที่นับ measurement ต้อง:
```sql
WHERE COALESCE(is_for_standard_adjustment, FALSE) = FALSE
```

ที่ frontend:
```typescript
measurements.filter(m => !m.isForStandardAdjustment)
```

### 7.3 Frontend ซ่อนปุ่ม → Backend ต้องตรวจด้วย

❌ **ไม่พอ:** ซ่อน button ของ Leader สำหรับ RED Event
✅ **ต้อง:** backend ตรวจ role ใน endpoint approve ด้วย

### 7.4 useEffect dependency array

```tsx
// ❌ จะใช้ token เก่าตลอด เพราะ deps ไม่มี token
useEffect(() => { loadData(token) }, [])

// ✅ ใส่ token ใน deps
useEffect(() => { loadData(token) }, [token])

// ❌ object ใน deps → re-run บ่อย
useEffect(() => { /* ... */ }, [selected])

// ✅ ใช้ primitive field
useEffect(() => { /* ... */ }, [selected?.id, selected?.scaleId])
```

### 7.5 antd v5 deprecated APIs

- `destroyOnClose` → ใช้ `destroyOnHidden`
- `bodyStyle` → ใช้ `styles={{ body: { ... } }}`

### 7.6 LocalStorage token

ปัจจุบันมี 2 key ใช้: `token` และ `authToken` — ต้องรวมเป็นอันเดียว (ดู TODO.md ข้อ 3.1)

### 7.7 DOUBLE mode classify

ต้องตรวจ status ทั้ง weight1 และ weight2 — ถ้าอันใดอันหนึ่งเป็น RED ผลรวมคือ RED
```java
String status = (s1 == RED || s2 == RED) ? "RED"
              : (s1 == YELLOW || s2 == YELLOW) ? "YELLOW" : "GREEN";
```

---

## 8. Code Review Checklist

ก่อน merge PR ตรวจ:

### Functionality
- [ ] ทำตาม spec ใน TODO/issue ครบ
- [ ] เพิ่ม/แก้ test ที่ครอบคลุม
- [ ] Manual test ใน local แล้ว

### Code Quality
- [ ] ไม่มี `console.log` / `System.out.println` ที่เหลือ
- [ ] Naming ตาม convention (section 3.1)
- [ ] ไม่มี duplicated code (DRY ไม่เกิน 3 ครั้งก็เริ่ม extract)
- [ ] ไม่มี hard-coded magic number / string
- [ ] Comment เฉพาะที่ "why" ไม่ใช่ "what"

### Security
- [ ] ไม่มี secret ใน code
- [ ] Endpoint ใหม่มี role check
- [ ] Input validation ทุก field ที่รับจาก user
- [ ] SQL injection: ใช้ parameterized query / JPA
- [ ] XSS: render user input ผ่าน React (auto-escape)

### Performance
- [ ] ไม่มี N+1 query (`@OneToMany` fetch=LAZY ใช้ถูก)
- [ ] Index ใน DB ถ้า query ใหม่
- [ ] Frontend ไม่ re-render ที่ไม่จำเป็น (useMemo/useCallback)

### UI/UX
- [ ] Responsive (ดู mobile + tablet ด้วย)
- [ ] Error message เป็นภาษาไทย + ชัดเจน
- [ ] Loading state ครอบคลุม
- [ ] Empty state มี

### Documentation
- [ ] อัปเดต MANUAL.md ถ้า user flow เปลี่ยน
- [ ] อัปเดต SYSTEM_DOCUMENTATION.md ถ้า API/DB เปลี่ยน
- [ ] CHANGELOG.md เพิ่ม entry

---

## 9. Git Workflow

### 9.1 Branch Strategy

```
main         ← production
  ↑
  └─ develop ← integration (ถ้าใช้)
      ↑
      ├─ feature/role-12-outer-approver
      ├─ fix/red-event-leader-403
      └─ docs/update-manual
```

### 9.2 Commit Convention

```
<type>(<scope>): <subject>

<body (optional)>

<footer (optional)>
```

**Types:**
- `feat` — new feature
- `fix` — bug fix
- `refactor` — code restructure
- `docs` — docs only
- `test` — tests
- `chore` — config/deps
- `style` — formatting (no logic change)
- `perf` — performance

**Examples:**
```
feat(approval): add MANAGEMENT role read-only support

- Update WebSecurityConfig to allow MANAGEMENT on GET endpoints
- Add readOnly prop to LeaderDashboard/QADashboard
- Hide all action buttons when readOnly=true

Closes #42
```

### 9.3 PR Process

1. Create branch from `main`
2. Develop + commit
3. Push + open PR
4. Self-review ด้วย Code Review Checklist (section 8)
5. Request reviewer (≥ 1 คนนอก author)
6. Fix review comments
7. Merge (squash หรือ merge commit ตามที่ทีมตกลง)
8. Delete branch

### 9.4 Tag Release

```bash
git tag -a v1.1.0 -m "Release v1.1.0 — Outer Approver routing"
git push --tags
```

ทุก tag ต้องอัปเดต `CHANGELOG.md`

---

## 10. Resources

### 10.1 เอกสารภายใน

| ไฟล์ | เมื่อไหร่ที่ควรเปิด |
|------|-------------------|
| `README.md` | Setup ครั้งแรก |
| `MANUAL.md` | เข้าใจ user flow |
| `WORKFLOW.md` | เห็น diagram ลำดับ |
| `SYSTEM_DOCUMENTATION.md` | API/DB reference |
| `DEPLOYMENT.md` | Deploy production |
| `TEST_PLAN.md` | ทดสอบก่อน release |
| `TODO.md` | งานค้าง / backlog |
| `IMPLEMENTATION_PROMPT.md` | สั่ง AI ช่วยทำ |
| `DEVELOPER_GUIDE.md` | **ไฟล์นี้** |
| `ARCHITECTURE_DECISIONS.md` | ทำไมถึงเลือก design นี้ |
| `CHANGELOG.md` | History ของ release |
| `GLOSSARY.md` | ศัพท์ technical + business |

### 10.2 เอกสารภายนอก

- [Spring Boot Docs](https://docs.spring.io/spring-boot/index.html)
- [Spring Security](https://docs.spring.io/spring-security/reference/)
- [React](https://react.dev/)
- [Ant Design v5](https://ant.design/components/overview)
- [Vite](https://vite.dev/)
- [Yubico WebAuthn](https://developers.yubico.com/java-webauthn-server/)

### 10.3 Tools ที่ใช้

| Tool | ที่ใช้ |
|------|--------|
| **IntelliJ IDEA / VSCode** | Backend dev (IntelliJ ดีกว่าสำหรับ Spring) |
| **VSCode** | Frontend dev |
| **Postman / Insomnia** | Test API |
| **DBeaver / Azure Data Studio** | DB browse |
| **Docker Desktop** | Run MSSQL local |
| **Git + GitHub** | Version control |

---

## 🎯 หลักการสุดท้าย

1. **อ่านโค้ดก่อนเขียน** — ดูว่ามี pattern อะไรอยู่แล้ว ทำตามแทนสร้างใหม่
2. **Test ตอนที่เขียน ไม่ใช่ทีหลัง** — เห็น bug ตั้งแต่แรก ถูกกว่า
3. **Comment "ทำไม" ไม่ใช่ "อะไร"** — ชื่อ method ดี ๆ บอก "อะไร" อยู่แล้ว
4. **Small PR > Big PR** — review ง่าย, merge เร็ว
5. **เปลี่ยน DB schema = ต้องมี migration file** — เด็ดขาด
6. **ถาม > เดา** — ถ้าไม่ชัด ถามใน team ก่อนเขียน 100 บรรทัด
