# Eikensystem — Glossary (อภิธานศัพท์)

> รวบรวมคำศัพท์ที่ใช้ในระบบ Eikensystem
> แยก 2 ส่วน: **Business Terms** (เนื้อหาโรงงาน) + **Technical Terms** (เทคนิคโปรแกรม)

---

## ส่วนที่ 1 — Business Terms (ศัพท์โรงงาน)

### กล่อง / Box

| คำ | ความหมาย | ตัวอย่าง |
|----|----------|---------|
| **Inner Box** (กล่องใน) | กล่องชั้นใน ที่ใส่ผลิตภัณฑ์โดยตรง | กล่องบรรจุยา 1 แผง |
| **Outer Box** (กล่องนอก) | กล่องชั้นนอก ที่บรรจุหลาย Inner | กล่อง shipping ที่ใส่ 20 แผง |
| **InnerBoxOrder** | ลำดับ Inner ภายใน Outer หนึ่ง ๆ | "0001", "0002", ..., "0020" |
| **OuterBoxNumber** | หมายเลข Outer ภายใน Lot | "001", "002", "003" |
| **innerBoxQuantity** (IBQ) | จำนวน Inner ต่อ 1 Outer | 20 (Inner ต่อ Outer) |

### น้ำหนัก / Weight

| คำ | ความหมาย | สูตร |
|----|----------|------|
| **WeightPerPiece** (WghPcs) | น้ำหนักต่อชิ้น (1 หน่วยภายใน Inner) | จาก spec product |
| **QuantityPerMeasurement** (Qty) | จำนวนชิ้นที่ชั่งในการชั่งครั้งหนึ่ง | จาก spec — เช่น ชั่ง 50 ชิ้นต่อครั้ง |
| **StandardWeight** (Std) | น้ำหนักมาตรฐานต่อการชั่ง 1 ครั้ง | `WghPcs × Qty` |
| **MinWeight** (Min) | น้ำหนักต่ำสุดที่ยังยอมรับ | `Std - WghPcs/2` |
| **MaxWeight** (Max) | น้ำหนักสูงสุดที่ยังยอมรับ | `Std + WghPcs/2` |
| **DMin** | ขอบล่างของช่วง GREEN | `Std - Tolerance` |
| **DMax** | ขอบบนของช่วง GREEN | `Std + Tolerance` |
| **Tolerance** (DevW) | ค่าเบี่ยงเบนที่ยอมรับสำหรับ GREEN | จาก spec |
| **DoubleWeighingTolerance** | tolerance สำหรับ DOUBLE mode | จาก spec |
| **Specimen** | ตัวอย่าง — ใช้ในคำสั่งพิเศษเช่น "ชั่งทั้งหมดก่อนชั่ง Specimen" |

### สี / Status

| สี | ความหมาย | เงื่อนไข |
|----|----------|----------|
| 🟢 **GREEN** | ผ่าน — อยู่ในช่วง tolerance | `DMin ≤ w ≤ DMax` |
| 🟡 **YELLOW** | เฉียดเกณฑ์ — อยู่ระหว่าง tolerance กับ half-piece | `(Min ≤ w < DMin) หรือ (DMax < w ≤ Max)` |
| 🔴 **RED** | ไม่ผ่าน — นอกช่วง half-piece | `w < Min หรือ w > Max` |

### Workflow / Operation

| คำ | ความหมาย |
|----|----------|
| **Work Order** (WO) | คำสั่งผลิต — ระบุ Product, Scale, Line, Lot, เวลา |
| **Lot** | รหัสล็อตการผลิต — measurement ทุก record ผูกกับ Lot |
| **Line** | สายการผลิต |
| **Scale** | เครื่องชั่ง (เครื่องวัดน้ำหนัก) |
| **Machine** | เครื่องจักรหรือสายการผลิต |
| **Yellow Streak** | จำนวน Yellow ต่อเนื่อง — ครบ 5 ระบบล็อก |
| **Initial Std** | Std เริ่มต้นสำหรับ Lot ใหม่ — จากค่าเฉลี่ย 10 กล่องแรก |
| **Barrier Measurement** | record พิเศษ (Outer=000, Inner=RST1) ใช้ตัด streak นับย้อนหลัง |
| **Reweigh** | ชั่งซ้ำกล่องเดิม (มี Leader/QA approval) |
| **Relocate** | ย้าย Inner/Outer ไปตำแหน่งใหม่ (Sorting) |
| **Sorting** | ขั้นตอนคัดแยก/แก้ไขกล่องหลังจบการผลิต |
| **Cleaning Check** | ตรวจสอบทำความสะอาดเครื่องชั่งทุก 1 ชม. |
| **Outer Inspection** | ตรวจสอบกล่อง Outer เมื่อบรรจุครบ |
| **Approver** | ผู้อนุมัติ — ตาม Product master (QA/Operator/Leader) |
| **Std Change Request** | คำขอเปลี่ยน Std (เกิดจาก Yellow Streak 5 หรือ Initial Std) |
| **Apply Std** | การยืนยัน Std ใหม่ → บันทึก StandardWeightLog + Barrier |
| **Allow 4&5** | QA อนุญาตให้ Operator ชั่งกล่องที่ 4-5 (หลัง Yellow Streak 5) |

### Approval Types

| Type | Trigger | Approver | คำอธิบาย |
|------|---------|----------|----------|
| `RED_EVENT` | Operator ชั่ง RED | **QA** | ปลดล็อคให้ชั่งซ้ำ (Leader เห็นแต่กดไม่ได้) |
| `STD_CHANGE_REQUEST` | Yellow Streak ≥ 5 หรือ 10 กล่องแรก | QA | Stage flow 4 ขั้น |
| `CLEANING_CHECK` | ทุก 1 ชม. ต่อเครื่องชั่ง | Leader | Cleaning record |
| `OUTER_INSPECTION` | Outer เต็ม | **Dynamic ตาม Product.outerApproverRole** | QA / Operator / Leader |

### Approval Stages (STD_CHANGE_REQUEST)

```
REQUESTED → ALLOW_4_5 → READY_FOR_APPLY → APPLIED
    ↑ Op create   ↑ QA allow      ↑ Op send proposal    ↑ QA apply
```

### Roles ในระบบ

| Role | คำอธิบาย |
|------|----------|
| **OPERATOR** | พนักงานชั่งน้ำหนัก / Sorting |
| **LEADER** | หัวหน้ากะ — สร้าง WO, อนุมัติ Cleaning, ดู Dashboard |
| **QA** | Quality Assurance — อนุมัติ RED, STD change, Outer (เมื่อ Product กำหนด) |
| **DATA_ADMIN** | จัดการ Master Data — Users/Products/Scales/Reasons |
| **ADMIN** | สิทธิ์ทั้งหมด (รวม system admin) |
| **MANAGEMENT** | Read-only — ดู Dashboard + Report เท่านั้น |

### Modes & Special Settings

| คำ | ความหมาย |
|----|----------|
| **SINGLE mode** | ชั่ง 1 ครั้งต่อ Inner — มี Std เดียว |
| **DOUBLE mode** | ชั่ง 2 ครั้งต่อ Inner — มี Std1 (ผงก่อน), Std2 (ผงหลัง) |
| **InnerNumberingMode** | วิธีเรียงเลข Inner: `1-20`, `CONTINUOUS`, `RESET_PER_OUTER` |
| **outerApproverRole** | role ของผู้ตรวจ Outer ของ Product นี้ |
| **outerApproverNote** | คำสั่งพิเศษก่อนตรวจ (เช่น "ชั่งทั้งหมดก่อนชั่ง Specimen") |
| **CleanerTime** | จำนวนชั่วโมง interval ของ Cleaning Check (2, 4 ชม.) |
| **targetTubes** | จำนวนหลอด/ชิ้นที่ต้องการของ WO |
| **requires_note** | (ใน Sorting Reason) ถ้า true → บังคับให้กรอกหมายเหตุเพิ่ม |
| **scope** | (ใน Sorting Reason) `BULK` / `SINGLE` / `BOTH` — ใช้ในจุดไหน |

---

## ส่วนที่ 2 — Technical Terms (ศัพท์เทคนิค)

### Authentication & Security

| คำ | คำอธิบาย |
|----|----------|
| **JWT** (JSON Web Token) | Token แบบ self-contained — ใช้ตรวจ identity ของ user |
| **Bearer Token** | รูปแบบส่ง JWT ใน header: `Authorization: Bearer <token>` |
| **JJWT** | Java library สำหรับ generate/validate JWT (`io.jsonwebtoken`) |
| **BCrypt** | Password hashing algorithm (cost factor 12) |
| **WebAuthn** | มาตรฐาน W3C สำหรับ biometric auth บน browser |
| **Yubico** | Library WebAuthn server สำหรับ Java |
| **PublicKeyCredential** | Credential ของ WebAuthn ที่ store ใน device |
| **Challenge** | Random nonce ที่ server สร้าง — เพื่อกัน replay attack |
| **CORS** | Cross-Origin Resource Sharing — กฎ browser สำหรับ cross-domain |
| **CSP** | Content Security Policy — กัน XSS โดย restrict source |
| **Spring Security** | Framework auth/authz ของ Spring |
| **@PreAuthorize** | Annotation สำหรับ method-level role check |
| **OWASP Top 10** | รายการ vulnerability ที่พบบ่อย (A01-A10) |

### Backend Architecture

| คำ | คำอธิบาย |
|----|----------|
| **Spring Boot** | Framework Java สำหรับ build microservice |
| **JPA / Hibernate** | ORM library — map Java object ↔ SQL table |
| **JpaRepository** | Interface สำหรับ CRUD ต่อ entity |
| **@Entity** | Annotation บอก class นี้คือ DB entity |
| **@Transactional** | Annotation บอก method นี้อยู่ใน DB transaction |
| **DTO** (Data Transfer Object) | Object สำหรับส่ง/รับข้อมูลผ่าน API |
| **Controller** | Class รับ HTTP request → return response |
| **Service** | Class layer ที่มี business logic — เรียกจาก Controller |
| **Repository** | Class layer ที่ติดต่อ DB (JpaRepository) |
| **Bean** | Object ที่ Spring จัดการ lifecycle ให้ |
| **@Component / @Service / @Repository** | Annotation บอก Spring ให้ scan + manage |
| **@Autowired / Constructor Injection** | กลไก inject dependency |
| **ddl-auto** | JPA setting: `validate` (prod), `update` (dev), `create-drop` (test) |
| **Flyway / Liquibase** | DB migration tool (ปัจจุบันใช้ manual SQL ใน `db-migration/`) |

### Frontend Architecture

| คำ | คำอธิบาย |
|----|----------|
| **React** | UI library — declarative component-based |
| **Vite** | Build tool + dev server สำหรับ frontend |
| **TypeScript** | JS + static types — ช่วย catch error ตอน compile |
| **JSX / TSX** | Syntax ผสม HTML ใน JS/TS |
| **Hook** | Function ที่ขึ้นต้นด้วย `use` — เช่น useState, useEffect |
| **useState** | Hook สำหรับ component state |
| **useEffect** | Hook สำหรับ side effects (fetch, subscription) |
| **useMemo / useCallback** | Hook สำหรับ optimize re-render |
| **useRef** | Hook สำหรับ mutable reference (DOM, mutable value) |
| **Props** | Argument ที่ส่งให้ component |
| **Component** | Reusable UI block — function ที่ return JSX |
| **antd** (Ant Design) | UI component library — Button, Modal, Table, Form |
| **antd v5** | Version ปัจจุบัน — `destroyOnHidden` แทน `destroyOnClose` |
| **recharts** | Chart library สำหรับ React |
| **Vite proxy** | Forward API request จาก dev server → backend |
| **localStorage** | Browser storage สำหรับ data ระดับ session+ |

### Database

| คำ | คำอธิบาย |
|----|----------|
| **MS SQL Server 2022** | RDBMS ของ Microsoft |
| **sqlcmd** | CLI ของ MS SQL สำหรับ run query |
| **Migration** | SQL script ที่เปลี่ยน schema (ALTER, CREATE) |
| **Index** | โครงสร้างช่วยเร่งความเร็ว SELECT |
| **Foreign Key** | Constraint ที่ link 2 tables |
| **Soft delete** | ไม่ลบ row จริง — set flag `is_active = false` |
| **Audit trail** | บันทึกทุก action สำหรับ tracing |
| **ChangeLog** | Table เก็บประวัติการแก้ measurement |

### DevOps / Infrastructure

| คำ | คำอธิบาย |
|----|----------|
| **Docker** | Container runtime |
| **docker-compose** | Tool สำหรับ define multi-container apps |
| **nginx** | Web server / reverse proxy |
| **systemd** | Linux init system สำหรับ manage service |
| **Let's Encrypt** | Free SSL certificate authority |
| **certbot** | CLI สำหรับ obtain Let's Encrypt cert |
| **logrotate** | Linux tool สำหรับ rotate log files |
| **cron** | Linux scheduler |
| **Health check** | Endpoint `/health` ที่ตรวจ service สถานะ |
| **Smoke test** | Test สั้น ๆ หลัง deploy เพื่อตรวจ deploy สำเร็จ |
| **Rollback** | กลับไปใช้ version เก่าถ้า deploy ใหม่มีปัญหา |
| **Snapshot** | Backup ณ จุดเวลาก่อน deploy |

### Testing

| คำ | คำอธิบาย |
|----|----------|
| **JUnit** | Test framework สำหรับ Java |
| **MockMvc** | Spring testing utility สำหรับ test Controller |
| **Testcontainers** | Library สำหรับ integration test ด้วย real DB ใน container |
| **JaCoCo** | Code coverage tool สำหรับ Java |
| **Vitest** | Test framework สำหรับ Vite (frontend) |
| **React Testing Library (RTL)** | Library สำหรับ test React component |
| **k6 / JMeter** | Load testing tool |
| **Postman / Insomnia** | API testing GUI |
| **UAT** (User Acceptance Test) | User ทดสอบก่อน sign-off |
| **Regression Test** | Test ครอบคลุม feature ทั้งระบบ ก่อน release |
| **Smoke Test** | Test สั้น ๆ ตรวจ critical path |
| **E2E Test** (End-to-End) | Test ทั้ง flow จาก user perspective |

### Logging & Monitoring

| คำ | คำอธิบาย |
|----|----------|
| **SLF4J / Logback** | Logging facade ใน Spring Boot |
| **Log level** | TRACE / DEBUG / INFO / WARN / ERROR |
| **Prometheus** | Metrics collection |
| **Grafana** | Metrics visualization |
| **ELK / Loki** | Log aggregation |
| **Actuator** | Spring Boot endpoint สำหรับ monitoring (`/actuator/health`) |
| **p50/p95/p99** | Percentile ของ response time |
| **KPI** (Key Performance Indicator) | ตัวชี้วัด เช่น login success rate |

### Patterns & Concepts

| คำ | คำอธิบาย |
|----|----------|
| **REST API** | Architectural style — GET/POST/PUT/DELETE on resources |
| **Stateless** | Server ไม่เก็บ session state — ใช้ JWT |
| **CRUD** | Create / Read / Update / Delete |
| **Polling** | Client ถาม server เป็นช่วง ๆ (vs WebSocket) |
| **WebSocket** | Two-way realtime connection |
| **SSE** (Server-Sent Events) | One-way push จาก server |
| **N+1 query** | Anti-pattern: ทำ 1 query แล้ว loop query เพิ่ม |
| **Lazy loading** | โหลด data ทีละนิดตามต้องการ |
| **Eager loading** | โหลด data ทั้งหมดทันที |
| **DRY** (Don't Repeat Yourself) | หลีกเลี่ยงโค้ดซ้ำ |
| **YAGNI** (You Aren't Gonna Need It) | อย่าทำ feature ที่ยังไม่ต้อง |
| **DTO Pattern** | Object สำหรับ transfer data — แยกจาก Entity |
| **Repository Pattern** | Abstraction layer สำหรับ data access |
| **Conventional Commits** | format: `<type>(<scope>): <subject>` |
| **Semantic Versioning** | MAJOR.MINOR.PATCH |

### Acronyms ที่พบบ่อย

| Acronym | Full Form | คำอธิบาย |
|---------|-----------|---------|
| **API** | Application Programming Interface | |
| **CSV** | Comma-Separated Values | ไฟล์ data |
| **CSP** | Content Security Policy | |
| **CORS** | Cross-Origin Resource Sharing | |
| **CRUD** | Create Read Update Delete | |
| **DTO** | Data Transfer Object | |
| **ER** | Entity Relationship | DB diagram |
| **JDK** | Java Development Kit | |
| **JPA** | Java Persistence API | ORM standard |
| **JSON** | JavaScript Object Notation | |
| **JWT** | JSON Web Token | |
| **MVC** | Model-View-Controller | Pattern |
| **OEE** | Overall Equipment Effectiveness | Manufacturing metric |
| **ORM** | Object-Relational Mapping | |
| **PR** | Pull Request | |
| **REST** | Representational State Transfer | |
| **SDK** | Software Development Kit | |
| **SLA** | Service Level Agreement | |
| **SSE** | Server-Sent Events | |
| **SQL** | Structured Query Language | |
| **TLS / SSL** | Transport Layer Security | |
| **UAT** | User Acceptance Test | |
| **UI / UX** | User Interface / User Experience | |
| **URL** | Uniform Resource Locator | |
| **YAML** | YAML Ain't Markup Language | config format |

---

## ภาคผนวก: คำที่ใช้ตรงกันใน Code

ตารางนี้ map คำในเอกสาร ↔ ชื่อจริงในโค้ด (เผื่องง):

| คำในเอกสาร | Field/Variable ใน Code |
|------------|----------------------|
| น้ำหนักต่อชิ้น | `weightPerPiece` / `wpp` / `wghPcs` |
| จำนวนต่อการชั่ง | `quantityPerMeasurement` / `qty` |
| Std | `standardWeight` / `std` |
| Tolerance | `tolerance` / `tol` / `devW` |
| Min | `minWeight` |
| Max | `maxWeight` |
| Inner ต่อ Outer | `innerBoxQuantity` / `IBQ` / `innerPerOuter` |
| ผลิต/หลอด | `tubes` / `tubesPerInner` / `pcs` |
| Outer เป้า | `outerTarget` (calculated) |
| Outer ที่ทำได้ | `outerActual` (calculated) |
| สถานะการชั่ง | `status` (`GREEN`/`YELLOW`/`RED`) |
| Yellow streak | `consecutiveYellow` / `yellowStreak` |
| ผู้อนุมัติ Outer | `outerApproverRole` (`QA`/`OPERATOR`/`LEADER`) |
| คำสั่งพิเศษ | `outerApproverNote` |
| เหตุผล Sorting | `reason` (legacy) / `reasonCode` + `reasonNote` (new) |
| Barrier | `isForStandardAdjustment = true` + `outer=000, inner=RST1` |

---

## 🎯 วิธีใช้ Glossary นี้

1. **Onboard developer ใหม่** — อ่านส่วน Technical Terms ก่อนเริ่มงาน
2. **Onboard tester** — อ่านส่วน Business Terms ก่อนเขียน test
3. **อ้างอิงตอนเขียน docs** — ใช้คำให้ตรงกัน หลีกเลี่ยงสับสน
4. **เพิ่มคำใหม่** — เมื่อมี term ใหม่เกิดขึ้นใน feature/PR → เพิ่มที่นี่ทันที
