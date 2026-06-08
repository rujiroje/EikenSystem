package com.example.eikensystem.web;

import com.example.eikensystem.domain.Approval;
import com.example.eikensystem.domain.Product;
import com.example.eikensystem.domain.Measurement;
import com.example.eikensystem.domain.StandardWeightLog;
import com.example.eikensystem.domain.Scale;
import com.example.eikensystem.repo.ApprovalRepo;
import com.example.eikensystem.repo.ProductRepo;
import com.example.eikensystem.repo.StandardWeightLogRepo;
import com.example.eikensystem.repo.MeasurementRepo;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.HashMap;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;
import java.time.Instant;

@RestController
@RequestMapping("/api/approvals")
@RequiredArgsConstructor
public class ApprovalController {
    private final ApprovalRepo approvalRepo;
    private final ProductRepo productRepo;
    private final StandardWeightLogRepo stdLogRepo;
    private final MeasurementRepo measurementRepo;
    private final com.example.eikensystem.repo.ScaleRepo scaleRepo;

    private static final String ROLE_LEADER = "LEADER";
    private static final String ROLE_QA = "QA";
    private static final String STATUS_PENDING = "PENDING";
    private static final String STATUS_APPROVED = "APPROVED";
    private static final String TYPE_RED_EVENT = "RED_EVENT";
    private static final String TYPE_STD_CHANGE = "STD_CHANGE_REQUEST";
    private static final String TYPE_CLEANING = "CLEANING_CHECK";
    private static final String TYPE_OUTER = "OUTER_INSPECTION";
    private static final String STAGE_REQUESTED = "REQUESTED";
    private static final String STAGE_READY = "READY_FOR_APPLY";
    private static final List<String> LEADER_TYPES = List.of(TYPE_RED_EVENT, TYPE_CLEANING);

    @GetMapping
    @PreAuthorize("hasAnyRole('QA','LEADER','ADMIN')")
    public List<Approval> list() { return approvalRepo.findAll(); }

    // Leader pending: RED_EVENT + CLEANING_CHECK
    @GetMapping("/leader-pending")
    @PreAuthorize("hasRole('LEADER')")
    public List<Approval> listLeaderPending(@RequestParam(name = "withPayloadOnly", defaultValue = "true") boolean withPayloadOnly) {
        List<Approval> list = approvalRepo.findByApproverRoleAndStatusAndTypeIn(ROLE_LEADER, STATUS_PENDING, LEADER_TYPES);
        // fallback: ถ้าไม่มีข้อมูลใหม่และ withPayloadOnly=true ให้ดึง RED_EVENT เก่าด้วย
        if (list.isEmpty() && withPayloadOnly) {
            list = approvalRepo.findByApproverRoleAndStatusAndTypeOrderByRequestedAtDesc(ROLE_LEADER, STATUS_PENDING, TYPE_RED_EVENT);
        }
        return list;
    }

    // Lightweight counter for navbar badge (RED + CLEANING)
    @GetMapping("/leader-pending/count")
    @PreAuthorize("hasRole('LEADER')")
    public Map<String, Object> countLeaderPending(@RequestParam(name = "withPayloadOnly", defaultValue = "true") boolean withPayloadOnly) {
        long c = approvalRepo.countByApproverRoleAndStatusAndTypeIn(ROLE_LEADER, STATUS_PENDING, LEADER_TYPES);
        if (c == 0 && withPayloadOnly) {
            c = approvalRepo.countByApproverRoleAndStatusAndType(ROLE_LEADER, STATUS_PENDING, TYPE_RED_EVENT);
        }
        return Map.of("count", c);
    }

    // QA view for RED events (which are assigned to LEADER but QA can intervene)
    @GetMapping("/qa-red-pending")
    @PreAuthorize("hasRole('QA')")
    public List<Approval> listQaRedPending() {
        return approvalRepo.findByApproverRoleAndStatusAndTypeOrderByRequestedAtDesc(ROLE_LEADER, STATUS_PENDING, TYPE_RED_EVENT);
    }

    // Create a RED approval bound tightly to an existing measurement (single source of truth)
    @PostMapping("/red-for-measurement/{measurementId}")
    @PreAuthorize("hasAnyRole('OPERATOR','LEADER','ADMIN')")
    public ResponseEntity<?> createRedForMeasurement(@PathVariable Long measurementId) {
        if (measurementId == null) return ResponseEntity.badRequest().body("measurementId required");
        Measurement m = measurementRepo.findById(measurementId).orElse(null);
        if (m == null) return ResponseEntity.notFound().build();
        // If already linked, just return existing approval
        if (m.getApprovalId() != null) {
            return approvalRepo.findById(Objects.requireNonNull(m.getApprovalId()))
                    .<ResponseEntity<?>>map(ResponseEntity::ok)
                    .orElseGet(() -> ResponseEntity.ok().build());
        }
        Approval a = new Approval();
        a.setType(TYPE_RED_EVENT);
        a.setApproverRole(ROLE_LEADER);
        a.setStatus(STATUS_PENDING);
        a.setStage(STAGE_REQUESTED);
        a.setRequestedBy(m.getOperatorName());
        a.setTargetId(String.valueOf(measurementId));
        Map<String, Object> plMap = new HashMap<>();
        plMap.put("productCode", m.getProduct() != null ? m.getProduct().getProductCode() : "");
        plMap.put("scaleId",     m.getScale()   != null ? m.getScale().getScaleId()       : "");
        plMap.put("lotNo",       m.getLotNo()   != null ? m.getLotNo()                    : "");
        plMap.put("outerBox",    m.getOuterBoxNumber()  != null ? m.getOuterBoxNumber()   : "");
        plMap.put("innerOrder",  m.getInnerBoxOrder()   != null ? m.getInnerBoxOrder()    : "");
        plMap.put("weight",      m.getWeight());
        plMap.put("weight1",     m.getWeight1());
        plMap.put("weight2",     m.getWeight2());
        plMap.put("std",         m.getEffectiveStd());
        plMap.put("std1",        m.getEffectiveStd1());
        plMap.put("std2",        m.getEffectiveStd2());
        String payload;
        try { payload = new ObjectMapper().writeValueAsString(plMap); }
        catch (Exception ex) { payload = "{}"; }
        a.setPayloadJson(payload);
        Approval saved = approvalRepo.save(a);
        m.setApprovalId(saved.getId());
        measurementRepo.save(m);
        return ResponseEntity.ok(saved);
    }

    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Approval> get(@PathVariable Long id) {
        if (id == null) return ResponseEntity.badRequest().build();
        return approvalRepo.findById(id)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Approval> request(@RequestBody Approval a) {
        a.setStatus(a.getStatus() == null ? STATUS_PENDING : a.getStatus());
        if (a.getStage() == null || a.getStage().isBlank()) a.setStage(STAGE_REQUESTED);
        // บันทึกเวลาที่สร้าง request เพื่อใช้ในการกำหนด barrier timestamp ภายหลัง
        if (a.getRequestedAt() == null) a.setRequestedAt(Instant.now());
        return ResponseEntity.ok(approvalRepo.save(a));
    }

    @PostMapping("/{id}/approve")
    @PreAuthorize("hasAnyRole('QA','LEADER','ADMIN')")
    public ResponseEntity<Approval> approve(@PathVariable Long id) {
        if (id == null) return ResponseEntity.badRequest().build();
        return approvalRepo.findById(id)
                .map(a -> { a.setStatus(STATUS_APPROVED); return ResponseEntity.ok(approvalRepo.save(a)); })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/{id}/reject")
    @PreAuthorize("hasAnyRole('QA','LEADER','ADMIN')")
    public ResponseEntity<Approval> reject(@PathVariable Long id) {
        if (id == null) return ResponseEntity.badRequest().build();
        return approvalRepo.findById(id)
                .map(a -> { a.setStatus("REJECTED"); return ResponseEntity.ok(approvalRepo.save(a)); })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    /**
     * QA/LD อนุมัติ RED พร้อมเริ่มเก็บตัวอย่าง Std ใหม่ 10 กล่อง
     * ① อนุมัติ RED → Operator ชั่งซ้ำกล่องเดิมได้
     * ② ตั้ง recalcStdMode = true บน approval
     * ③ Insert RECALC_START barrier → reset consecutiveYellow เป็น 0 อัตโนมัติ
     */
    @PostMapping("/{id}/approve-recalc-std")
    @PreAuthorize("hasAnyRole('QA','LEADER','ADMIN')")
    public ResponseEntity<?> approveRecalcStd(@PathVariable Long id, @RequestBody ApproveWithNote req) {
        if (id == null) return ResponseEntity.badRequest().build();
        Approval ap = approvalRepo.findById(id).orElse(null);
        if (ap == null) return ResponseEntity.notFound().build();
        if (!TYPE_RED_EVENT.equals(ap.getType()))
            return ResponseEntity.badRequest().body("Only RED_EVENT approvals can use recalc-std");
        if (!"PENDING".equalsIgnoreCase(ap.getStatus()))
            return ResponseEntity.badRequest().body("Approval is not PENDING");

        // อนุมัติ RED
        ap.setStatus(STATUS_APPROVED);
        ap.setRecalcStdMode(true);
        ap.setActionBy(req.getActionBy());
        ap.setActionAt(Instant.now());
        if (req.getNote() != null && !req.getNote().isBlank())
            ap.setNote((ap.getNote() != null ? ap.getNote() + "\n" : "") + req.getNote());
        approvalRepo.save(ap);

        // Parse payload เพื่อหา product/scale/lot/outerBox
        Map<String, Object> payload = new HashMap<>();
        try {
            if (ap.getPayloadJson() != null && !ap.getPayloadJson().isBlank())
                payload = new ObjectMapper().readValue(ap.getPayloadJson(), new TypeReference<Map<String, Object>>() {});
        } catch (Exception ignored) {}

        String productCode = (String) payload.getOrDefault("productCode", "");
        String scaleId     = (String) payload.getOrDefault("scaleId", "");
        String lotNo       = (String) payload.getOrDefault("lotNo", "");

        // Insert RECALC_START barrier — breaks consecutiveYellow chain ทันที
        if (!productCode.isBlank() && !scaleId.isBlank() && !lotNo.isBlank()) {
            com.example.eikensystem.domain.Product product = productRepo.findById(productCode).orElse(null);
            com.example.eikensystem.domain.Scale scale = scaleRepo.findById(scaleId).orElse(null);
            if (product != null && scale != null) {
                Measurement barrier = new Measurement();
                barrier.setProduct(product);
                barrier.setScale(scale);
                barrier.setLotNo(lotNo);
                barrier.setOuterBoxNumber("000");         // ใช้ 000 เพื่อให้ /last endpoint ข้ามไป
                barrier.setInnerBoxOrder("RECALC_START");
                barrier.setIsForStandardAdjustment(true);
                barrier.setStatus("RECALC_START");
                barrier.setTimestamp(java.time.LocalDateTime.now());
                barrier.setNote("Recalc Std triggered by approval #" + id + " by " + req.getActionBy());
                measurementRepo.save(barrier);
            }
        }

        Map<String, Object> result = new HashMap<>();
        result.put("approved", true);
        result.put("recalcStarted", true);
        result.put("approvalId", id);
        return ResponseEntity.ok(result);
    }

    // Leader approves RED event with a reason/note
    @PostMapping("/{id}/approve-with-note")
    @PreAuthorize("hasAnyRole('LEADER', 'QA')")
    public ResponseEntity<Approval> approveWithNote(@PathVariable Long id, @RequestBody ApproveWithNote req) {
        if (id == null || req == null) return ResponseEntity.badRequest().build();
        return approvalRepo.findById(id)
                .map(a -> {
                    a.setStatus(STATUS_APPROVED);
                    a.setActionBy(req.getActionBy());
                    a.setActionAt(Instant.now());
                    if (req.getNote() != null && !req.getNote().isBlank()) {
                        a.setNote((a.getNote() != null ? a.getNote() + "\n" : "") + req.getNote());
                    }
                    return ResponseEntity.ok(approvalRepo.save(a));
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    // QA allows operator to continue box #4 and #5
    @PostMapping("/{id}/allow-4-5")
    @PreAuthorize("hasRole('QA')")
    public ResponseEntity<Approval> allowFourFive(@PathVariable Long id, @RequestBody AllowRequest req) {
        if (id == null || req == null) return ResponseEntity.badRequest().build();
        return approvalRepo.findById(id)
                .map(a -> {
                    a.setStage("ALLOW_4_5");
                    a.setActionBy(req.getActionBy());
                    a.setActionAt(Instant.now());
                    if (req.getNote() != null && !req.getNote().isBlank()) {
                        a.setNote((a.getNote() != null ? a.getNote() + "\n" : "") + req.getNote());
                    }
                    return ResponseEntity.ok(approvalRepo.save(a));
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    // Operator updates proposal after collecting 5 boxes (avg std + all 5 weights)
    @PostMapping("/{id}/update-proposal")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Approval> updateProposal(@PathVariable Long id, @RequestBody UpdateProposalRequest req) {
        if (id == null || req == null) return ResponseEntity.badRequest().build();
        return approvalRepo.findById(id)
                .map(a -> {
                    a.setStage(STAGE_READY);
                    // Persist proposal details in payloadJson merging with existing so productCode context is preserved.
                    String incoming = (req.getPayloadJson() != null ? req.getPayloadJson() : "{}");
                    String existing = (a.getPayloadJson() != null ? a.getPayloadJson() : "{}");
                    ObjectMapper om = new ObjectMapper();
                    Map<String,Object> merged = new HashMap<>();
                    try {
                        Map<String,Object> prev = om.readValue(existing, new TypeReference<Map<String,Object>>(){});
                        if (prev != null) merged.putAll(prev);
                    } catch (Exception ignored) { /* ignore */ }
                    try {
                        Map<String,Object> inc = om.readValue(incoming, new TypeReference<Map<String,Object>>(){});
                        if (inc != null) merged.putAll(inc);
                    } catch (Exception ignored) { /* ignore */ }
                    // Ensure required identification fields are present (do not drop them if proposal omitted)
                    // productCode, scaleId, lotNo, stdOld gathered from previous stage if missing.
                    try {
                        a.setPayloadJson(om.writeValueAsString(merged));
                    } catch (Exception e) {
                        // Fallback: store incoming raw proposal if serialization fails
                        a.setPayloadJson(incoming);
                    }
                    if (req.getNote() != null && !req.getNote().isBlank()) {
                        a.setNote((a.getNote() != null ? a.getNote() + "\n" : "") + req.getNote());
                    }
                    return ResponseEntity.ok(approvalRepo.save(a));
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    // QA applies a new standard: updates product.standardWeight and logs the change
    @PostMapping("/{id}/apply-std")
    @PreAuthorize("hasRole('QA')")
    public ResponseEntity<?> applyStd(@PathVariable Long id, @RequestBody ApplyStdRequest req) {
        if (id == null || req == null) return ResponseEntity.badRequest().build();
        Approval ap = approvalRepo.findById(id).orElse(null);
        if (ap == null) return ResponseEntity.notFound().build();
        if (!TYPE_STD_CHANGE.equals(ap.getType())) return ResponseEntity.badRequest().body("Invalid approval type");

        if (req.getProductCode() == null || (req.getNewStd() == null && req.getNewStd1() == null)) {
            return ResponseEntity.badRequest().body("productCode/newStd required");
        }
    String productCode = Objects.requireNonNull(req.getProductCode()).trim();
    Product p = productRepo.findById(productCode).orElse(null);
        if (p == null) return ResponseEntity.badRequest().body("Unknown product");

        // Determine previous effective standard (from latest log or master)
        Double oldStd = p.getStandardWeight();
        Double oldStd1 = p.getStandardWeight1();
        Double oldStd2 = p.getStandardWeight2();
        List<StandardWeightLog> logs = stdLogRepo.findByProductCodeOrderByApprovedAtDesc(productCode);
        if (!logs.isEmpty()) {
            StandardWeightLog latestLog = logs.get(0);
            if (latestLog.getNewStd() != null) oldStd = latestLog.getNewStd();
            if (latestLog.getNewStd1() != null) oldStd1 = latestLog.getNewStd1();
            if (latestLog.getNewStd2() != null) oldStd2 = latestLog.getNewStd2();
        }
        // Update Product master data with new Std and derived values
        if (req.getNewStd() != null) {
            double newStdVal = req.getNewStd();
            double wpp = p.getWeightPerPiece() != null ? p.getWeightPerPiece() : 0.0;
            p.setStandardWeight(newStdVal);
            // Use QA-verified values if provided, otherwise compute from formula
            p.setMinWeight(req.getNewMin() != null ? req.getNewMin() : newStdVal - wpp / 2.0);
            p.setMaxWeight(req.getNewMax() != null ? req.getNewMax() : newStdVal + wpp / 2.0);
            // Derive tolerance from QA-supplied DMin/DMax, or formula
            if (req.getNewDMin() != null) {
                p.setTolerance(newStdVal - req.getNewDMin());
            } else if (req.getNewDMax() != null) {
                p.setTolerance(req.getNewDMax() - newStdVal);
            } else {
                p.setTolerance(wpp / 4.0);
            }
        }
        if (req.getNewStd1() != null) p.setStandardWeight1(req.getNewStd1());
        if (req.getNewStd2() != null) p.setStandardWeight2(req.getNewStd2());
        productRepo.save(p);

        StandardWeightLog log = new StandardWeightLog();
        log.setProductCode(p.getProductCode());
        log.setOldStd(oldStd);
        log.setNewStd(req.getNewStd());
        log.setOldStd1(oldStd1);
        log.setNewStd1(req.getNewStd1());
        log.setOldStd2(oldStd2);
        log.setNewStd2(req.getNewStd2());
        log.setSampleWeightsJson(req.getSampleWeightsJson());
        log.setApprovalId(id);
        log.setApprovedBy(req.getApprovedBy());
        log.setApprovedAt(Instant.now());
        log.setReason(req.getReason());
        // [เพิ่ม] บันทึกตำแหน่ง Outer/Inner ลงใน Log โดยตรง
        // FIXME: StandardWeightLog entity is missing these fields. Uncomment after updating the entity.
        // log.setOuterBoxNumber(req.getOuterBox());
        // log.setInnerBoxOrder(req.getInnerOrder());


        // Try to record the current/latest box location for this change
        try {
            if (ap.getPayloadJson() != null) {
                ObjectMapper om = new ObjectMapper();
                Map<String, Object> map = om.readValue(ap.getPayloadJson(), new TypeReference<Map<String, Object>>() {});
                Object scObj = map.get("scaleId");
                Object lnObj = map.get("lotNo");
                if (scObj != null && lnObj != null) {
                    String scaleId = String.valueOf(scObj).trim();
                    String lotNo = String.valueOf(lnObj).trim();
                    measurementRepo.findTopByProduct_ProductCodeAndScale_ScaleIdAndLotNoOrderByTimestampDesc(productCode, scaleId, lotNo)
                        .ifPresent(m -> {
                            try {
                                // Calculate NEXT box location (Apply Location)
                                String nextOuter = m.getOuterBoxNumber();
                                String nextInner = m.getInnerBoxOrder();
                                try {
                                    int curOuter = Integer.parseInt(m.getOuterBoxNumber());
                                    int curInner = Integer.parseInt(m.getInnerBoxOrder());
                                    int capacity = (p.getInnerBoxQuantity() != null && p.getInnerBoxQuantity() > 0) ? p.getInnerBoxQuantity() : 50;
                                    
                                    // Count items in current outer to check if full
                                    List<Measurement> itemsInOuter = measurementRepo.findByProduct_ProductCodeAndScale_ScaleIdAndLotNoAndOuterBoxNumberOrderByInnerBoxOrderAsc(
                                            productCode, scaleId, lotNo, m.getOuterBoxNumber());
                                    long count = itemsInOuter.stream().filter(x -> x.getInnerBoxOrder() != null && x.getInnerBoxOrder().trim().matches("\\d+")).count();
                                    
                                    // Continuous inner number
                                    nextInner = String.format("%04d", curInner + 1);
                                    
                                    if (count < capacity) {
                                        nextOuter = String.format("%03d", curOuter);
                                    } else {
                                        nextOuter = String.format("%03d", curOuter + 1);
                                    }
                                } catch (Exception e) {
                                    // Fallback simple increment
                                    try { nextInner = String.format("%04d", Integer.parseInt(m.getInnerBoxOrder()) + 1); } catch (Exception ignored) {}
                                }
                                map.put("outerBox", nextOuter);
                                map.put("innerOrder", nextInner);
                                map.put("outer", nextOuter);
                                map.put("inner", nextInner);
                                ap.setPayloadJson(om.writeValueAsString(map));
                            } catch (Exception e) {}
                        });
                }
            }
        } catch (Exception e) { /* ignore location error */ }

        stdLogRepo.save(log);

        ap.setStatus(STATUS_APPROVED);
        ap.setActionBy(req.getApprovedBy());
        ap.setActionAt(Instant.now());
        String noteMsg = "Apply Std to " + p.getProductCode() + ": ";
        if ("DOUBLE".equalsIgnoreCase(p.getWeighingMode())) {
            noteMsg += String.format("Std1(%.3f -> %.3f), Std2(%.3f -> %.3f)", 
                oldStd1 != null ? oldStd1 : 0, req.getNewStd1() != null ? req.getNewStd1() : 0,
                oldStd2 != null ? oldStd2 : 0, req.getNewStd2() != null ? req.getNewStd2() : 0);
        } else {
            noteMsg += oldStd + " -> " + req.getNewStd();
        }
        ap.setNote((ap.getNote() != null ? ap.getNote() + "\n" : "") + noteMsg);
        ap.setStage("APPLIED");
        approvalRepo.save(ap);

        // --- Reset YELLOW streak barrier ---
        // ปัญหา: หลังจาก Apply Std แล้ว กล่อง YELLOW 3 กล่องล่าสุดยังอยู่บนสุด ทำให้ monitor และ operator กลับมาถูกล็อกอีก
        // แนวทาง: สร้าง measurement barrier (GREEN) ที่มี timestamp ล่าสุด เพื่อ 'ตัด' streak ของ YELLOW
        createBarrierMeasurement(ap, p, req.getNewStd(), req.getNewStd1(), req.getNewStd2(), req.getApprovedBy());

        return ResponseEntity.ok(p);
    }

    private void createBarrierMeasurement(Approval ap, Product p, Double newStd, Double newStd1, Double newStd2, String operatorName) {
        try {
            String payloadJson = ap.getPayloadJson();
            String scaleId = null;
            String lotNo = null;
            String outerBox = null;
            String innerOrder = null;
            if (payloadJson != null && !payloadJson.isBlank()) {
                ObjectMapper om = new ObjectMapper();
                try {
                    Map<String,Object> map = om.readValue(payloadJson, new TypeReference<Map<String,Object>>(){});
                    Object sc = map.get("scaleId"); if (sc instanceof String s) scaleId = s;
                    Object ln = map.get("lotNo"); if (ln instanceof String s) lotNo = s;
                    Object ob = map.get("outerBox"); if (ob instanceof String s) outerBox = s;
                    Object io = map.get("innerOrder"); if (io instanceof String s) innerOrder = s;
                } catch (Exception ignored) { /* ignore */ }
            }
            if (scaleId != null && lotNo != null) {
                Scale sc = scaleRepo.findById(scaleId).orElse(null);
                if (sc != null) {
                    Measurement barrier = new Measurement();
                    barrier.setProduct(p);
                    barrier.setScale(sc);
                    barrier.setLotNo(lotNo.trim());
                    // ใช้ outer/inner พิเศษเพื่อหลีกเลี่ยงชนกับกล่องจริง
                    barrier.setOuterBoxNumber("000");
                    barrier.setInnerBoxOrder("RST1");
                    barrier.setWeight(newStd);
                    barrier.setWeight1(newStd1);
                    barrier.setWeight2(newStd2);
                    // ── Barrier timestamp: ต้องอยู่ก่อนกล่องถัดไป (ไม่ใช่ server time ปัจจุบัน) ──
                    // ใช้ timestamp ของ measurement ที่ trigger การ approve (กล่องสุดท้ายที่ชั่ง)
                    // เพื่อให้ barrier ตกระหว่างกล่องนั้นกับกล่องถัดไปในลำดับเวลา
                    java.time.LocalDateTime barrierTs = null;
                    if (outerBox != null && innerOrder != null) {
                        try {
                            java.util.Optional<Measurement> triggerMeasurement =
                                measurementRepo.findByProduct_ProductCodeAndScale_ScaleIdAndLotNoAndOuterBoxNumberAndInnerBoxOrder(
                                    p.getProductCode(), scaleId, lotNo.trim(), outerBox, innerOrder);
                            if (triggerMeasurement.isPresent() && triggerMeasurement.get().getTimestamp() != null) {
                                // barrier จะอยู่หลังกล่องที่ trigger พอดี 1 nanosecond → กล่องถัดไปจะนับหลัง barrier ✓
                                barrierTs = triggerMeasurement.get().getTimestamp().plusNanos(1);
                            }
                        } catch (Exception ignored) { /* ignore */ }
                    }
                    // fallback: ใช้ requestedAt ของ approval (เวลาที่ operator สร้าง request = หลังกล่อง trigger)
                    if (barrierTs == null && ap.getRequestedAt() != null) {
                        barrierTs = java.time.LocalDateTime.ofInstant(ap.getRequestedAt(), java.time.ZoneId.systemDefault()).plusNanos(1);
                    }
                    // last resort fallback
                    if (barrierTs == null) {
                        barrierTs = java.time.LocalDateTime.now();
                    }
                    barrier.setTimestamp(barrierTs);
                    barrier.setOperatorName(operatorName);
                    barrier.setStatus("GREEN");
                    barrier.setIsForStandardAdjustment(Boolean.TRUE);
                    measurementRepo.save(barrier);
                }
            }
        } catch (Exception ignored) { /* ignore */ }
    }

    @lombok.Data
    public static class ApplyStdRequest {
        private String productCode;
        private String lotNo;
        private String scaleId;
        private String outerBox;
        private String innerOrder;
        private Double newStd;
        private Double newStd1;
        private Double newStd2;
        // QA-verified range values (optional — formula used as fallback if null)
        private Double newMin;
        private Double newMax;
        private Double newDMin;
        private Double newDMax;
        private String sampleWeightsJson; // JSON array string
        private String approvedBy;
        private String reason;
    }

    @lombok.Data
    public static class AllowRequest {
        private String actionBy; // QA username
        private String note;     // optional
    }

    @lombok.Data
    public static class UpdateProposalRequest {
        // the frontend can send a json string containing productCode, proposedStd, weights5, stdOld, etc.
        private String payloadJson;
        private String note; // optional
    }

    @lombok.Data
    public static class ApproveWithNote {
        private String actionBy; // Leader username
        private String note;     // required reason explanation
    }

    @lombok.Data
    public static class CleaningCheckRequest {
        private String scaleId;
        private String productCode;
        private String lotNo;
        private Long workOrderId;
        /** รูปแบบ: "YYYY-MM-DDTHH" เช่น "2025-04-11T10" — ใช้ dedup ต่อชั่วโมง */
        private String hourLabel;
    }

    // ── CLEANING CHECK ──────────────────────────────────────────────────────────

    /**
     * OP สร้าง CLEANING_CHECK request
     * body: { scaleId, productCode, lotNo, workOrderId, hourLabel }
     * targetId = "scaleId:hourLabel" เพื่อ dedup ต่อชั่วโมง
     */
    @PostMapping("/cleaning-check")
    @PreAuthorize("hasAnyRole('OPERATOR','ADMIN')")
    public ResponseEntity<?> requestCleaningCheck(@RequestBody CleaningCheckRequest req,
                                                   org.springframework.security.core.Authentication auth) {
        if (req.getScaleId() == null || req.getHourLabel() == null)
            return ResponseEntity.badRequest().body("scaleId and hourLabel are required");

        String targetId = req.getScaleId() + ":" + req.getHourLabel();

        // ตรวจสอบว่ามี PENDING หรือ APPROVED อยู่แล้วสำหรับชั่วโมงนี้หรือไม่
        List<Approval> existing = approvalRepo.findCleaningCheckByTargetId(targetId);
        if (!existing.isEmpty()) {
            Approval latest = existing.get(0);
            if (STATUS_APPROVED.equals(latest.getStatus()) || STATUS_PENDING.equals(latest.getStatus())) {
                return ResponseEntity.ok(latest); // คืน record เดิม
            }
        }

        String payload = String.format(
            "{\"scaleId\":\"%s\",\"productCode\":\"%s\",\"lotNo\":\"%s\",\"workOrderId\":%s,\"hourLabel\":\"%s\"}",
            req.getScaleId(),
            req.getProductCode() != null ? req.getProductCode() : "",
            req.getLotNo() != null ? req.getLotNo() : "",
            req.getWorkOrderId() != null ? req.getWorkOrderId() : "null",
            req.getHourLabel()
        );

        Approval a = new Approval();
        a.setType(TYPE_CLEANING);
        a.setApproverRole(ROLE_LEADER);
        a.setStatus(STATUS_PENDING);
        a.setStage(STAGE_REQUESTED);
        a.setTargetId(targetId);
        a.setRequestedBy(auth.getName());
        a.setRequestedAt(Instant.now());
        a.setPayloadJson(payload);
        return ResponseEntity.ok(approvalRepo.save(a));
    }

    /**
     * OP poll สถานะ CLEANING_CHECK สำหรับชั่วโมงปัจจุบัน
     * GET /api/approvals/cleaning-check/status?scaleId=S001&hourLabel=2025-04-11T10
     */
    @GetMapping("/cleaning-check/status")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> cleaningCheckStatus(@RequestParam String scaleId,
                                                  @RequestParam String hourLabel) {
        String targetId = scaleId + ":" + hourLabel;
        List<Approval> list = approvalRepo.findCleaningCheckByTargetId(targetId);
        if (list.isEmpty()) return ResponseEntity.ok(Map.of("status", "NONE"));
        Approval latest = list.get(0);
        return ResponseEntity.ok(Map.of(
            "id", latest.getId(),
            "status", latest.getStatus(),
            "actionBy", latest.getActionBy() != null ? latest.getActionBy() : ""
        ));
    }

    // Convenience endpoint for testing leader role mapping
    @GetMapping("/ping/leader")
    @PreAuthorize("hasRole('LEADER')")
    public ResponseEntity<?> leaderPing() {
        return ResponseEntity.ok(Map.of("ok", true, "role", ROLE_LEADER));
    }

    // ---- QA Pending Counts & Lists ----
    @GetMapping("/qa-pending-count")
    @PreAuthorize("hasRole('QA')")
    public Map<String, Object> qaPendingCount() {
        long readyForApply = approvalRepo.countByApproverRoleAndStatusAndTypeAndStage(ROLE_QA, STATUS_PENDING, TYPE_STD_CHANGE, STAGE_READY);
        long outerInspection = approvalRepo.countByApproverRoleAndStatusAndType(ROLE_QA, STATUS_PENDING, TYPE_OUTER);
        long redEvents = approvalRepo.countByApproverRoleAndStatusAndType(ROLE_LEADER, STATUS_PENDING, TYPE_RED_EVENT);
        return Map.of(
                "readyForApplyCount", readyForApply,
                "outerInspectionCount", outerInspection,
                "redEventsCount", redEvents,
                "total", readyForApply + outerInspection + redEvents
        );
    }

    @GetMapping("/qa-pending")
    @PreAuthorize("hasRole('QA')")
    public List<Approval> qaPending(@RequestParam(name = "stage", required = false) String stage) {
        List<Approval> result;
        if (stage != null && !stage.isBlank()) {
            result = approvalRepo.findByApproverRoleAndStatusAndTypeAndStageOrderByRequestedAtDesc(ROLE_QA, STATUS_PENDING, TYPE_STD_CHANGE, stage);
        } else {
            // default: merge both REQUESTED and READY_FOR_APPLY
            List<Approval> requested = approvalRepo.findByApproverRoleAndStatusAndTypeAndStageOrderByRequestedAtDesc(ROLE_QA, STATUS_PENDING, TYPE_STD_CHANGE, STAGE_REQUESTED);
            List<Approval> ready = approvalRepo.findByApproverRoleAndStatusAndTypeAndStageOrderByRequestedAtDesc(ROLE_QA, STATUS_PENDING, TYPE_STD_CHANGE, STAGE_READY);
            java.util.ArrayList<Approval> merged = new java.util.ArrayList<>(requested);
            merged.addAll(ready);
            result = merged;
        }
        // Enrich payload with individual measurement weights if missing (e.g., old approvals)
        ObjectMapper om = new ObjectMapper();
        for (Approval a : result) {
            try {
                Map<String, Object> pl = a.getPayloadJson() != null
                        ? om.readValue(a.getPayloadJson(), new TypeReference<Map<String, Object>>() {})
                        : new HashMap<>();
                List<?> existingAll = pl.get("allWeights") instanceof List ? (List<?>) pl.get("allWeights") : java.util.List.of();
                List<?> existing5   = pl.get("weights5")   instanceof List ? (List<?>) pl.get("weights5")   : java.util.List.of();
                if (existingAll.isEmpty() && existing5.isEmpty()) {
                    String productCode = pl.get("productCode") instanceof String s ? s : null;
                    String lotNo       = pl.get("lotNo")       instanceof String s ? s : null;
                    if (productCode != null && lotNo != null) {
                        Product product = productRepo.findById(productCode).orElse(null);
                        int threshold = (product != null && product.getInnerBoxQuantity() != null && product.getInnerBoxQuantity() > 0)
                                ? product.getInnerBoxQuantity() : 10;
                        List<com.example.eikensystem.domain.Measurement> history =
                                measurementRepo.findTop100ByProduct_ProductCodeAndLotNoOrderByTimestampDesc(productCode, lotNo);
                        List<com.example.eikensystem.domain.Measurement> firstN = history.stream()
                                .filter(x -> !Boolean.TRUE.equals(x.getIsForStandardAdjustment())
                                        && !"000".equals(x.getOuterBoxNumber())
                                        && !"RST1".equals(x.getInnerBoxOrder()))
                                .sorted(java.util.Comparator.comparing(com.example.eikensystem.domain.Measurement::getTimestamp))
                                .limit(threshold)
                                .toList();
                        if (!firstN.isEmpty()) {
                            pl.put("allWeights",  firstN.stream().filter(m -> m.getWeight()  != null).map(com.example.eikensystem.domain.Measurement::getWeight).collect(java.util.stream.Collectors.toList()));
                            pl.put("allWeights1", firstN.stream().filter(m -> m.getWeight1() != null).map(com.example.eikensystem.domain.Measurement::getWeight1).collect(java.util.stream.Collectors.toList()));
                            pl.put("allWeights2", firstN.stream().filter(m -> m.getWeight2() != null).map(com.example.eikensystem.domain.Measurement::getWeight2).collect(java.util.stream.Collectors.toList()));
                            a.setPayloadJson(om.writeValueAsString(pl));
                        }
                    }
                }
            } catch (Exception ignored) {}
        }
        return result;
    }

    // ── OUTER INSPECTION ────────────────────────────────────────────────────────

    @lombok.Data
    public static class OuterInspectionRequest {
        private String productCode;
        private String scaleId;
        private String lotNo;
        private String outerBox;
        private Long workOrderId;
        private String requestedBy;
    }

    /**
     * OP creates OUTER_INSPECTION request when an outer box is completed.
     * targetId = "productCode:scaleId:lotNo:outerBox" for dedup.
     */
    @PostMapping("/outer-inspection")
    @PreAuthorize("hasAnyRole('OPERATOR','ADMIN')")
    public ResponseEntity<?> requestOuterInspection(@RequestBody OuterInspectionRequest req,
                                                     org.springframework.security.core.Authentication auth) {
        if (req.getProductCode() == null || req.getScaleId() == null
                || req.getLotNo() == null || req.getOuterBox() == null)
            return ResponseEntity.badRequest().body("productCode, scaleId, lotNo, outerBox are required");

        String targetId = req.getProductCode() + ":" + req.getScaleId() + ":" + req.getLotNo() + ":" + req.getOuterBox();

        // Dedup: ถ้ามี PENDING อยู่แล้ว คืน record เดิม
        List<Approval> existing = approvalRepo.findByApproverRoleAndStatusAndTypeOrderByRequestedAtDesc(ROLE_QA, STATUS_PENDING, TYPE_OUTER);
        for (Approval a : existing) {
            if (targetId.equals(a.getTargetId())) return ResponseEntity.ok(a);
        }

        String payload = String.format(
            "{\"productCode\":\"%s\",\"scaleId\":\"%s\",\"lotNo\":\"%s\",\"outerBox\":\"%s\",\"workOrderId\":%s}",
            req.getProductCode(), req.getScaleId(), req.getLotNo(), req.getOuterBox(),
            req.getWorkOrderId() != null ? req.getWorkOrderId() : "null"
        );

        Approval a = new Approval();
        a.setType(TYPE_OUTER);
        a.setApproverRole(ROLE_QA);
        a.setStatus(STATUS_PENDING);
        a.setStage(STAGE_REQUESTED);
        a.setTargetId(targetId);
        a.setRequestedBy(auth.getName());
        a.setRequestedAt(Instant.now());
        a.setPayloadJson(payload);
        return ResponseEntity.ok(approvalRepo.save(a));
    }

    /**
     * GET /api/approvals/outer-inspection/pending
     * QA fetches all pending OUTER_INSPECTION approvals.
     */
    @GetMapping("/outer-inspection/pending")
    @PreAuthorize("hasRole('QA')")
    public List<Approval> outerInspectionPending() {
        return approvalRepo.findByApproverRoleAndStatusAndTypeOrderByRequestedAtDesc(ROLE_QA, STATUS_PENDING, TYPE_OUTER);
    }

    /**
     * POST /api/approvals/{id}/approve-outer
     * QA approves outer inspection (1-click, optional note).
     */
    @PostMapping("/{id}/approve-outer")
    @PreAuthorize("hasRole('QA')")
    public ResponseEntity<Approval> approveOuter(@PathVariable Long id,
                                                  @RequestBody(required = false) ApproveWithNote req) {
        if (id == null) return ResponseEntity.badRequest().build();
        return approvalRepo.findById(id)
                .map(a -> {
                    a.setStatus(STATUS_APPROVED);
                    a.setStage("APPROVED");
                    a.setActionAt(Instant.now());
                    if (req != null) {
                        if (req.getActionBy() != null) a.setActionBy(req.getActionBy());
                        if (req.getNote() != null && !req.getNote().isBlank())
                            a.setNote((a.getNote() != null ? a.getNote() + "\n" : "") + req.getNote());
                    }
                    return ResponseEntity.ok(approvalRepo.save(a));
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }
}
