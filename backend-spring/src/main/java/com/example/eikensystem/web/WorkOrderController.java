package com.example.eikensystem.web;

import com.example.eikensystem.domain.Machine;
import com.example.eikensystem.domain.Product;
import com.example.eikensystem.domain.Scale;
import com.example.eikensystem.domain.WorkOrder;
import com.example.eikensystem.repo.MachineRepo;
import com.example.eikensystem.repo.MeasurementRepo;
import com.example.eikensystem.repo.ProductRepo;
import com.example.eikensystem.repo.ScaleRepo;
import com.example.eikensystem.repo.WorkOrderRepo;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/work-orders")
@RequiredArgsConstructor
public class WorkOrderController {

    private final WorkOrderRepo workOrderRepo;
    private final ProductRepo productRepo;
    private final ScaleRepo scaleRepo;
    private final MachineRepo machineRepo;
    private final MeasurementRepo measurementRepo;

    // ─────────────────────────────────────────────
    //  GET  /api/work-orders             — ดึงรายการทั้งหมด (filter by status)
    //  GET  /api/work-orders?status=ACTIVE
    //  GET  /api/work-orders?status=ACTIVE&availableForOperator=true
    //       → เพิ่มกรอง: startDate <= today (หรือ null) AND endDate >= today (หรือ null)
    //         ใช้สำหรับ Operator เลือก WO เพื่อทำงาน
    // ─────────────────────────────────────────────
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<WorkOrder>> list(
            @RequestParam(required = false) String status,
            @RequestParam(required = false, defaultValue = "false") boolean availableForOperator) {
        List<WorkOrder> result;
        if (status != null && !status.isBlank()) {
            result = workOrderRepo.findByStatusOrderByCreatedAtDesc(status.toUpperCase());
        } else {
            result = workOrderRepo.findAllByOrderByCreatedAtDesc();
        }
        if (availableForOperator) {
            LocalDate today = LocalDate.now();
            result = result.stream()
                .filter(wo -> wo.getStartDate() == null || !wo.getStartDate().isAfter(today))
                .filter(wo -> wo.getEndDate()   == null || !wo.getEndDate().isBefore(today))
                .collect(Collectors.toList());
        }
        return ResponseEntity.ok(result);
    }

    // ─────────────────────────────────────────────
    //  GET  /api/work-orders/{id}        — ดึง WO เดียว
    // ─────────────────────────────────────────────
    @GetMapping("/{id}")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> getOne(@PathVariable Long id) {
        return workOrderRepo.findById(id)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    // ─────────────────────────────────────────────
    //  POST /api/work-orders             — LD สร้าง WO ใหม่
    // ─────────────────────────────────────────────
    @PostMapping
    @PreAuthorize("hasAnyRole('LEADER','ADMIN')")
    public ResponseEntity<?> create(@RequestBody CreateWorkOrderRequest req, Authentication auth) {
        if (req.getProductCode() == null || req.getProductCode().isBlank())
            return ResponseEntity.badRequest().body("productCode is required");
        if (req.getScaleId() == null || req.getScaleId().isBlank())
            return ResponseEntity.badRequest().body("scaleId is required");
        if (req.getLotNo() == null || req.getLotNo().isBlank())
            return ResponseEntity.badRequest().body("lotNo is required");

        Product product = productRepo.findById(req.getProductCode().trim()).orElse(null);
        if (product == null) return ResponseEntity.badRequest().body("Product not found: " + req.getProductCode());

        Scale scale = scaleRepo.findById(req.getScaleId().trim()).orElse(null);
        if (scale == null) return ResponseEntity.badRequest().body("Scale not found: " + req.getScaleId());

        Machine machine = null;
        if (req.getMachineId() != null && !req.getMachineId().isBlank()) {
            machine = machineRepo.findById(req.getMachineId().trim()).orElse(null);
            if (machine == null) return ResponseEntity.badRequest().body("Machine not found: " + req.getMachineId());
        }

        // validate rework source if provided
        WorkOrder reworkSource = null;
        if (req.getReworkSourceWoId() != null) {
            reworkSource = workOrderRepo.findById(req.getReworkSourceWoId()).orElse(null);
            if (reworkSource == null)
                return ResponseEntity.badRequest().body("Rework source WO not found: " + req.getReworkSourceWoId());
            // ตรวจว่า Product ตรงกับ WO ต้นฉบับ
            String sourceProductCode = reworkSource.getProduct() != null ? reworkSource.getProduct().getProductCode() : null;
            if (sourceProductCode != null && !sourceProductCode.equals(req.getProductCode() != null ? req.getProductCode().trim() : null))
                return ResponseEntity.badRequest().body(
                    "Product ไม่ตรงกับ WO ต้นฉบับ: ต้องเป็น " + sourceProductCode + " (WO #" + reworkSource.getWorkOrderId() + ")");
        }

        WorkOrder wo = new WorkOrder();
        wo.setProduct(product);
        wo.setScale(scale);
        wo.setMachine(machine);
        wo.setLine(req.getLine());
        wo.setLotNo(req.getLotNo().trim());
        wo.setStartDate(req.getStartDate());
        wo.setEndDate(req.getEndDate());
        wo.setCustomStd(req.getCustomStd());
        wo.setCustomStd1(req.getCustomStd1());
        wo.setCustomStd2(req.getCustomStd2());
        wo.setReworkSourceWo(reworkSource);
        wo.setReworkReason(req.getReworkReason());
        wo.setStatus("ACTIVE");
        wo.setCreatedBy(auth.getName());
        wo.setCreatedAt(LocalDateTime.now());

        WorkOrder saved = workOrderRepo.save(wo);
        return ResponseEntity.ok(saved);
    }

    // ─────────────────────────────────────────────
    //  PUT  /api/work-orders/{id}        — LD แก้ไข WO (แก้ข้อมูลก่อนเริ่มชั่ง)
    // ─────────────────────────────────────────────
    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('LEADER','ADMIN')")
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody CreateWorkOrderRequest req) {
        Optional<WorkOrder> opt = workOrderRepo.findById(id);
        if (opt.isEmpty()) return ResponseEntity.notFound().build();
        WorkOrder wo = opt.get();

        // ห้ามแก้ถ้า WO ปิดแล้ว (ยกเว้น SORTING ที่ LD เปิดเองได้)
        if ("END".equals(wo.getStatus())) {
            return ResponseEntity.badRequest().body("Cannot edit a closed WO. Change status to SORTING first.");
        }

        if (req.getProductCode() != null && !req.getProductCode().isBlank()) {
            Product product = productRepo.findById(req.getProductCode().trim()).orElse(null);
            if (product == null) return ResponseEntity.badRequest().body("Product not found");
            wo.setProduct(product);
        }
        if (req.getScaleId() != null && !req.getScaleId().isBlank()) {
            Scale scale = scaleRepo.findById(req.getScaleId().trim()).orElse(null);
            if (scale == null) return ResponseEntity.badRequest().body("Scale not found");
            wo.setScale(scale);
        }
        if (req.getMachineId() != null) {
            if (req.getMachineId().isBlank()) {
                wo.setMachine(null);
            } else {
                Machine machine = machineRepo.findById(req.getMachineId().trim()).orElse(null);
                if (machine == null) return ResponseEntity.badRequest().body("Machine not found: " + req.getMachineId());
                wo.setMachine(machine);
            }
        }
        if (req.getLine() != null) wo.setLine(req.getLine());
        if (req.getLotNo() != null && !req.getLotNo().isBlank()) wo.setLotNo(req.getLotNo().trim());
        if (req.getStartDate() != null) wo.setStartDate(req.getStartDate());
        if (req.getEndDate() != null) wo.setEndDate(req.getEndDate());
        if (req.getCustomStd() != null) wo.setCustomStd(req.getCustomStd());
        if (req.getCustomStd1() != null) wo.setCustomStd1(req.getCustomStd1());
        if (req.getCustomStd2() != null) wo.setCustomStd2(req.getCustomStd2());
        if (req.getReworkSourceWoId() != null) {
            if (req.getReworkSourceWoId() == 0L) {
                // ส่ง 0 = ล้างค่า rework
                wo.setReworkSourceWo(null);
                wo.setReworkReason(null);
            } else {
                if (req.getReworkSourceWoId().equals(id))
                    return ResponseEntity.badRequest().body("WO ไม่สามารถ Rework ตัวเองได้");
                WorkOrder source = workOrderRepo.findById(req.getReworkSourceWoId()).orElse(null);
                if (source == null)
                    return ResponseEntity.badRequest().body("Rework source WO not found: " + req.getReworkSourceWoId());
                // ตรวจ product ตรงกัน
                String srcCode = source.getProduct() != null ? source.getProduct().getProductCode() : null;
                String reqCode = wo.getProduct() != null ? wo.getProduct().getProductCode() : null;
                if (srcCode != null && !srcCode.equals(reqCode))
                    return ResponseEntity.badRequest().body(
                        "Product ไม่ตรงกับ WO ต้นฉบับ: ต้องเป็น " + srcCode + " (WO #" + source.getWorkOrderId() + ")");
                wo.setReworkSourceWo(source);
            }
        }
        if (req.getReworkReason() != null) wo.setReworkReason(req.getReworkReason());

        return ResponseEntity.ok(workOrderRepo.save(wo));
    }

    // ─────────────────────────────────────────────
    //  PUT  /api/work-orders/{id}/status — LD เปลี่ยน status
    //  Body: { "status": "SORTING" }
    // ─────────────────────────────────────────────
    @PutMapping("/{id}/status")
    @PreAuthorize("hasAnyRole('LEADER','ADMIN')")
    public ResponseEntity<?> changeStatus(@PathVariable Long id,
                                          @RequestBody StatusRequest req,
                                          Authentication auth) {
        Optional<WorkOrder> opt = workOrderRepo.findById(id);
        if (opt.isEmpty()) return ResponseEntity.notFound().build();
        WorkOrder wo = opt.get();

        String newStatus = req.getStatus() == null ? "" : req.getStatus().toUpperCase();
        if (!List.of("ACTIVE", "END", "SORTING").contains(newStatus))
            return ResponseEntity.badRequest().body("Invalid status. Allowed: ACTIVE, END, SORTING");

        wo.setStatus(newStatus);
        if ("END".equals(newStatus)) {
            wo.setClosedAt(LocalDateTime.now());
            wo.setClosedBy(auth.getName());
        } else if ("SORTING".equals(newStatus)) {
            // บันทึกว่าใครเปลี่ยนเป็น SORTING และเมื่อไหร่
            // ใช้ closedAt/closedBy เพื่อ track (เป็นเวลาที่เปลี่ยนสถานะล่าสุด)
            wo.setClosedAt(LocalDateTime.now());
            wo.setClosedBy(auth.getName());
        } else if ("ACTIVE".equals(newStatus)) {
            // Re-activate: ล้าง closedAt/closedBy
            wo.setClosedAt(null);
            wo.setClosedBy(null);
        }
        return ResponseEntity.ok(workOrderRepo.save(wo));
    }

    // ─────────────────────────────────────────────
    //  POST /api/work-orders/{id}/start  — OP เริ่ม session (กรอกชื่อทีม)
    // ─────────────────────────────────────────────
    @PostMapping("/{id}/start")
    @PreAuthorize("hasAnyRole('OPERATOR','ADMIN')")
    public ResponseEntity<?> startSession(@PathVariable Long id,
                                          @RequestBody StartSessionRequest req,
                                          Authentication auth) {
        Optional<WorkOrder> opt = workOrderRepo.findById(id);
        if (opt.isEmpty()) return ResponseEntity.notFound().build();
        WorkOrder wo = opt.get();

        if (!"ACTIVE".equals(wo.getStatus()))
            return ResponseEntity.badRequest().body("WO is not ACTIVE (status=" + wo.getStatus() + ")");

        // ตรวจสอบว่า WO หมดอายุแล้วหรือไม่
        if (wo.getEndDate() != null && wo.getEndDate().isBefore(LocalDate.now())) {
            wo.setStatus("END");
            wo.setClosedAt(LocalDateTime.now());
            wo.setClosedBy("SYSTEM");
            workOrderRepo.save(wo);
            return ResponseEntity.badRequest().body(
                "WO#" + id + " หมดอายุแล้ว (endDate: " + wo.getEndDate() + ") — สถานะถูกเปลี่ยนเป็น END อัตโนมัติ");
        }

        wo.setOperatorNames(req.getOperatorNames());
        wo.setStartedBy(auth.getName());
        wo.setSessionStartedAt(LocalDateTime.now());
        return ResponseEntity.ok(workOrderRepo.save(wo));
    }

    // ─────────────────────────────────────────────
    //  POST /api/work-orders/{id}/close  — OP ปิด WO → END
    // ─────────────────────────────────────────────
    @PostMapping("/{id}/close")
    @PreAuthorize("hasAnyRole('OPERATOR','LEADER','ADMIN')")
    public ResponseEntity<?> closeWO(@PathVariable Long id, Authentication auth) {
        Optional<WorkOrder> opt = workOrderRepo.findById(id);
        if (opt.isEmpty()) return ResponseEntity.notFound().build();
        WorkOrder wo = opt.get();

        if ("END".equals(wo.getStatus()))
            return ResponseEntity.badRequest().body("WO is already END");

        wo.setStatus("END");
        wo.setClosedAt(LocalDateTime.now());
        wo.setClosedBy(auth.getName());
        return ResponseEntity.ok(workOrderRepo.save(wo));
    }

    // ─────────────────────────────────────────────
    //  DELETE /api/work-orders/{id}         — LD ลบ WO (เฉพาะที่ยังไม่มีการผลิต)
    // ─────────────────────────────────────────────
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('LEADER','ADMIN')")
    public ResponseEntity<?> delete(@PathVariable Long id) {
        Optional<WorkOrder> opt = workOrderRepo.findById(id);
        if (opt.isEmpty()) return ResponseEntity.notFound().build();
        WorkOrder wo = opt.get();

        // ตรวจว่ามีบันทึกการผลิต (measurements) อยู่แล้วหรือไม่
        String productCode = wo.getProduct() != null ? wo.getProduct().getProductCode() : null;
        if (productCode != null && wo.getLotNo() != null
                && measurementRepo.existsByProduct_ProductCodeAndLotNo(productCode, wo.getLotNo())) {
            return ResponseEntity.badRequest().body(
                "ไม่สามารถลบได้: WO #" + id + " มีบันทึกการผลิต (Lot: " + wo.getLotNo() + ") อยู่แล้ว");
        }

        // ตรวจว่ามี WO อื่นอ้างถึง WO นี้เป็น Rework source หรือไม่
        List<WorkOrder> reworkChildren = workOrderRepo.findByReworkSourceWo_WorkOrderIdOrderByCreatedAtDesc(id);
        if (!reworkChildren.isEmpty()) {
            String childIds = reworkChildren.stream()
                    .map(w -> "#" + w.getWorkOrderId())
                    .collect(java.util.stream.Collectors.joining(", "));
            return ResponseEntity.badRequest().body(
                "ไม่สามารถลบได้: WO #" + id + " ถูกอ้างถึงเป็น Rework source โดย WO " + childIds);
        }

        workOrderRepo.deleteById(id);
        return ResponseEntity.ok("ลบ WO #" + id + " สำเร็จ");
    }

    // ─────────────────────────────────────────────
    //  GET  /api/work-orders/availability   — ตรวจว่า M/C และ Scale ไหนว่างในช่วงวันที่
    //  ?startDate=2026-06-01&endDate=2026-06-05&excludeWoId=9 (excludeWoId ใช้ตอน Edit)
    // ─────────────────────────────────────────────
    @GetMapping("/availability")
    @PreAuthorize("hasAnyRole('LEADER','ADMIN')")
    public ResponseEntity<?> availability(
            @RequestParam String startDate,
            @RequestParam String endDate,
            @RequestParam(required = false) Long excludeWoId) {
        LocalDate start, end;
        try {
            start = LocalDate.parse(startDate);
            end   = LocalDate.parse(endDate);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("Invalid date format. Use YYYY-MM-DD");
        }
        if (end.isBefore(start))
            return ResponseEntity.badRequest().body("endDate must be >= startDate");

        List<WorkOrder> conflicts = workOrderRepo.findConflictingActiveWOs(start, end, excludeWoId);

        // รวบรวม machineId และ scaleId ที่ถูกใช้ พร้อมข้อมูล WO ที่ครอบ
        java.util.Map<String, java.util.Map<String, Object>> busyMachines = new java.util.LinkedHashMap<>();
        java.util.Map<String, java.util.Map<String, Object>> busyScales   = new java.util.LinkedHashMap<>();

        for (WorkOrder wo : conflicts) {
            if (wo.getMachine() != null) {
                String mid = wo.getMachine().getMachineId();
                busyMachines.computeIfAbsent(mid, k -> {
                    java.util.Map<String, Object> info = new java.util.HashMap<>();
                    info.put("machineId",      mid);
                    info.put("conflictWoId",   wo.getWorkOrderId());
                    info.put("conflictLotNo",  wo.getLotNo());
                    info.put("conflictStart",  wo.getStartDate());
                    info.put("conflictEnd",    wo.getEndDate());
                    return info;
                });
            }
            if (wo.getScale() != null) {
                String sid = wo.getScale().getScaleId();
                busyScales.computeIfAbsent(sid, k -> {
                    java.util.Map<String, Object> info = new java.util.HashMap<>();
                    info.put("scaleId",        sid);
                    info.put("conflictWoId",   wo.getWorkOrderId());
                    info.put("conflictLotNo",  wo.getLotNo());
                    info.put("conflictStart",  wo.getStartDate());
                    info.put("conflictEnd",    wo.getEndDate());
                    return info;
                });
            }
        }

        java.util.Map<String, Object> result = new java.util.HashMap<>();
        result.put("busyMachines", new java.util.ArrayList<>(busyMachines.values()));
        result.put("busyScales",   new java.util.ArrayList<>(busyScales.values()));
        return ResponseEntity.ok(result);
    }

    // ─────────────────────────────────────────────
    //  Inner request/response DTOs
    // ─────────────────────────────────────────────

    @Data
    public static class CreateWorkOrderRequest {
        private String productCode;
        private String scaleId;
        private String machineId;
        private String line;
        private String lotNo;
        private LocalDate startDate;
        private LocalDate endDate;
        /** ค่า Std ที่ LD กำหนดเอง (SINGLE / override) — null = ใช้จาก product table */
        private Double customStd;
        /** ค่า Std สำหรับชั่งครั้งที่ 1 (DOUBLE mode) */
        private Double customStd1;
        /** ค่า Std สำหรับชั่งครั้งที่ 2 (DOUBLE mode) */
        private Double customStd2;
        /** WO ต้นฉบับที่นำมา Rework — null = WO ปกติ, 0 = ล้างค่า (ใช้ใน update) */
        private Long reworkSourceWoId;
        /** เหตุผลที่ต้อง Rework */
        private String reworkReason;
    }

    @Data
    public static class StatusRequest {
        private String status;
    }

    @Data
    public static class StartSessionRequest {
        /** ชื่อผู้ร่วมทำงาน (text อิสระ เช่น "สมชาย, สมหญิง") */
        private String operatorNames;
    }
}
