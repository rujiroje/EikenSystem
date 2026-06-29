# Changelog

> ประวัติการเปลี่ยนแปลงของระบบ Eikensystem
> Format ตาม [Keep a Changelog](https://keepachangelog.com/) + [Semantic Versioning](https://semver.org/)

---

## [Unreleased]

### Planned
- Token blacklist สำหรับ logout
- WebAuthn challenge ย้ายไป Redis
- ลบ `backend/` (Express mock) ออกจาก repo
- ลบไฟล์ frontend ซ้ำซ้อน (`MeasurementEntry_Old.tsx`)
- Centralized error handler (`@RestControllerAdvice`)
- Performance dashboard (OEE เต็มรูปแบบ)

### Pending Migration
- [ ] รวม `localStorage` token key เป็นอันเดียว (`'token'`)
- [ ] เปลี่ยน `destroyOnClose` → `destroyOnHidden` (antd v5)

---

## [v2.1.0] — 2026-06-24 (commit `777aada`)

> 🚀 Major update — Outer Approver per Product + Sorting Reasons + targetTubes + Mobile responsive

### Added — โครงสร้างใหม่
- **OuterInspection entity** — เก็บประวัติการตรวจ Outer (รวม self-check)
- **SortingReason entity** + master data + Admin UI (`SortingReasonsAdmin.tsx`)
- **Product.outerApproverRole** (QA / OPERATOR / LEADER) — Routing dynamic ตาม product
- **Product.outerApproverNote** — คำสั่งพิเศษ
- **Product.cleanerTime** — ช่วงเวลา cleaning ต่อ product
- **WorkOrder.targetTubes** — เป้าผลผลิต
- **WorkOrder.rework fields** — รองรับ rework lot
- **Role MANAGEMENT** (read-only) — สำหรับผู้บริหาร
- **SortingReasonController** + endpoints `/api/sorting-reasons`, `/api/admin/sorting-reasons`
- **Mobile responsive design** — Hamburger drawer nav, Modal maxWidth 95vw, table scroll x

### Changed
- **RED Event approval:** Leader ยังเห็นแต่ **กดอนุมัติไม่ได้** — QA-only
- **Outer Inspection:** Route ตาม Product.outerApproverRole
  - QA → สร้าง approval ปกติ
  - OPERATOR → self-check ทันที (ไม่สร้าง approval)
  - LEADER → ส่งไป Leader Dashboard
- **ApprovalController:** เพิ่ม TYPE_OUTER ใน LEADER_TYPES, `/approve-outer` รองรับ QA+LEADER
- **Sorting reason:** เปลี่ยนจาก free text → dropdown จาก master
- **change_logs:** เพิ่ม `reason_code`, `reason_note`
- **MeasurementEntry:** Outer progress เป็น Progress circle (cyan)
- **WOReportPage:** RED ที่ถูก reweigh แสดงใน report ผ่าน ChangeLog
- **ReportController:** แยก `pendingOuterLeader` vs `pendingOuterQa`

### Documentation
- เพิ่ม **SYSTEM_DOCUMENTATION.md** (743 บรรทัด) — Roles, DB schema, API, Flow
- เพิ่ม **MANUAL.md** — User manual แยกตาม Role
- เพิ่ม **DEPLOYMENT.md** — แผน deploy production
- เพิ่ม **TEST_PLAN.md** — Programmer + UAT
- เพิ่ม **DEVELOPER_GUIDE.md** — สำหรับ developer onboarding
- เพิ่ม **ARCHITECTURE_DECISIONS.md** — ADR records
- เพิ่ม **CHANGELOG.md** (ไฟล์นี้)
- เพิ่ม **GLOSSARY.md**

### Fixed
- Outer counting: ใช้ distinct (outer, inner) จาก measurement records (ไม่อิงเลข Outer)
- Barrier measurement: filter ทุก query ที่ aggregate
- Modal responsive บน mobile

### Security
- ApprovalController: ตรวจ role ที่ endpoint approve สำหรับ RED_EVENT (403 ถ้าไม่ใช่ QA)
- WebSecurityConfig: เพิ่ม MANAGEMENT GET permissions

---

## [v2.0.0] — 2026-05-27 (commit `e26a7f0`)

> 🎉 Initial release — Eikensystem v2.0

### Added — Core Features
- **Backend:**
  - Spring Boot 3.5 + Java 21
  - JWT authentication (JJWT 0.12)
  - WebAuthn integration (Yubico)
  - Entities: AppUser, Product, Scale, Machine, WorkOrder, Measurement, Approval, ChangeLog, CleaningLog, StandardWeightLog, WebAuthnCredential
  - Endpoints: `/api/auth/*`, `/api/products`, `/api/work-orders`, `/api/measurements`, `/api/approvals`, `/api/reports`, `/api/admin/*`
  - Calculator: GREEN/YELLOW/RED classification + SINGLE/DOUBLE mode
  - DataInitializer: seed users + products (dev only)

- **Frontend:**
  - React 18 + Vite + TypeScript + Ant Design 5
  - Pages: MeasurementEntry, SortingPage, LeaderDashboard, QADashboard, WorkOrderManagement, WOReportPage, AdminData
  - Login: password + biometric (KiosBioAgent + WebAuthn)
  - Real-time polling Dashboard (15-30s)

- **KiosBioAgent:**
  - .NET 6 minimal API
  - DigitalPersona SDK integration
  - HTTPS self-signed บน port 5001
  - Endpoints: `/health`, `/authenticate`, `/identify`

- **Infrastructure:**
  - docker-compose: MS SQL Server 2022 + nginx
  - Auto SSL generation script (`generate-ssl.sh`/.bat)
  - Database migration scripts (`db-migration/`)

### Business Logic
- Work Order lifecycle: ACTIVE → SORTING → END
- Yellow Streak ≥ 5 → ระบบล็อก → STD_CHANGE_REQUEST flow
- Initial Std after 10 boxes
- Barrier Measurement (outer=000, inner=RST1) ตัด streak
- Cleaning Check (deduped per scaleId:hourLabel)
- Outer Inspection (กล่อง Outer เต็ม)
- Sorting (relocate + reweigh)

### Documentation (initial)
- README.md, EikenDetail.txt, EikenDetail.doc
- WORKFLOW.md — Sequence/state diagrams
- mockup_operator.html / mockup_operator_v2.html

---

## รูปแบบการเขียน Changelog ต่อไป

ใช้ template นี้สำหรับ release ใหม่:

```markdown
## [vX.Y.Z] — YYYY-MM-DD (commit `<hash>`)

### Added
- Feature ใหม่ที่เพิ่มเข้ามา

### Changed
- เปลี่ยน behavior ของ feature เดิม

### Fixed
- Bug ที่แก้ไข

### Deprecated
- Feature ที่จะถูกลบในอนาคต (ยังใช้ได้)

### Removed
- Feature ที่ลบออก

### Security
- Security fix
```

### Versioning Rules

| Bump | เมื่อไหร่ |
|------|----------|
| **MAJOR** (X.0.0) | Breaking change ที่ user/API ต้องแก้ตาม |
| **MINOR** (1.X.0) | Feature ใหม่ที่ไม่ break |
| **PATCH** (1.0.X) | Bug fix อย่างเดียว |

### กฎที่ต้องทำเสมอ
1. **ทุก PR ที่ merge → เพิ่ม entry ใน [Unreleased]**
2. **ก่อน tag release → ย้าย [Unreleased] → [vX.Y.Z]**
3. **เพิ่มวันที่ + commit hash**
4. **เขียนเป็นภาษามนุษย์อ่านง่าย** ไม่ใช่ technical jargon

---

## ภาคผนวก: Release Process

### Pre-release Checklist
- [ ] รวบรวมทุก feature/fix ใน [Unreleased]
- [ ] รัน `mvn verify` + `npm test` ผ่าน
- [ ] รัน Test Plan (TEST_PLAN.md) ผ่าน ≥95%
- [ ] อัปเดต MANUAL.md ถ้า user flow เปลี่ยน
- [ ] อัปเดต SYSTEM_DOCUMENTATION.md ถ้า API/DB เปลี่ยน
- [ ] Review CHANGELOG.md
- [ ] PM อนุมัติ

### Release Commands

```bash
# 1. Merge ทุกอย่างเข้า main
git checkout main && git pull

# 2. Update CHANGELOG.md
# ย้าย [Unreleased] → [v2.2.0] + date + commit hash

# 3. Commit changelog
git commit -m "docs(changelog): release v2.2.0"

# 4. Tag
git tag -a v2.2.0 -m "Release v2.2.0"

# 5. Push
git push origin main --tags

# 6. Create GitHub Release
# จาก tag → คัดลอก changelog section ใส่
```

### Post-release
- [ ] Deploy ตาม DEPLOYMENT.md
- [ ] Smoke test ใน production
- [ ] Announce ใน team channel
- [ ] Update [Unreleased] section ใหม่ใน CHANGELOG.md
