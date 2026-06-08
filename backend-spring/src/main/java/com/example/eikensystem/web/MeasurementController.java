package com.example.eikensystem.web;

import com.example.eikensystem.domain.Measurement;
import com.example.eikensystem.domain.Product;
import com.example.eikensystem.domain.Scale;
import com.example.eikensystem.domain.WorkOrder;
import com.example.eikensystem.domain.Approval;
import com.example.eikensystem.domain.ChangeLog;
import com.example.eikensystem.repo.MeasurementRepo;
import com.example.eikensystem.repo.ProductRepo;
import com.example.eikensystem.repo.ScaleRepo;
import com.example.eikensystem.repo.WorkOrderRepo;
import com.example.eikensystem.repo.ApprovalRepo;
import com.example.eikensystem.repo.ChangeLogRepo;
import com.example.eikensystem.repo.StandardWeightLogRepo;
import com.example.eikensystem.domain.StandardWeightLog;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.Objects;
import java.util.Optional;
import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import java.util.HashMap;
import java.util.LinkedHashMap;

@RestController
@RequestMapping("/api/measurements")
@RequiredArgsConstructor
public class MeasurementController {
    private final Calculator calculator;
    private final ProductRepo productRepo;
    private final ScaleRepo scaleRepo;
    private final MeasurementRepo measurementRepo;
    private final ApprovalRepo approvalRepo;
    private final ChangeLogRepo changeLogRepo;
    private final WorkOrderRepo workOrderRepo;
    private final StandardWeightLogRepo stdLogRepo;

    @PostMapping("/classify")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ClassificationResponse> classify(@RequestBody ClassificationRequest req) {
        String st = calculator.classify(req.getWeight(), req.getParams().getWeightPerPiece(),
                req.getParams().getQuantityPerMeasurement(), req.getParams().getTolerance());
        ClassificationResponse resp = new ClassificationResponse();
        resp.setStatus(st);
        return ResponseEntity.ok(resp);
    }

    // Compute consecutive YELLOW (latest-first) for a given product/scale/lot, and return last 3 weights
    // Logic: Count continuous YELLOW records from latest going backward.
    // Stop counting when encountering GREEN (not YELLOW) or barrier (Apply Std).
    // When count reaches 5, lock system if no barrier exists after yellow streak.
    @GetMapping("/yellow-streak")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> yellowStreak(@RequestParam String productCode,
                                          @RequestParam String scaleId,
                                          @RequestParam String lotNo) {
        String cleanProduct = productCode.trim();
        String cleanLot = lotNo.trim();
        
        // Query by Product, Scale, and LotNo to ensure data consistency for the specific station.
        List<Measurement> latest = measurementRepo.findTop100ByProduct_ProductCodeAndScale_ScaleIdAndLotNoOrderByTimestampDesc(
                cleanProduct, scaleId, cleanLot);

        int consec = 0;
        List<Double> weights = new ArrayList<>();
        List<Double> weights1 = new ArrayList<>();
        List<Double> weights2 = new ArrayList<>();
        LocalDateTime firstYellowTime = null;  // Track when yellow streak started

        for (Measurement m : latest) {
            // Barrier resets the streak — stop counting here
            if (Boolean.TRUE.equals(m.getIsForStandardAdjustment())) break;
            // GREEN resets the streak
            if ("GREEN".equalsIgnoreCase(m.getStatus())) break;
            // RED does NOT reset the streak — skip and keep scanning backward
            if ("YELLOW".equalsIgnoreCase(m.getStatus())) {
                consec++;
                if (firstYellowTime == null) firstYellowTime = m.getTimestamp();
                if (weights.size() < 5 && m.getWeight() != null) weights.add(m.getWeight());
                if (weights1.size() < 5 && m.getWeight1() != null) weights1.add(m.getWeight1());
                if (weights2.size() < 5 && m.getWeight2() != null) weights2.add(m.getWeight2());
            }
        }

        // For DOUBLE mode: count how many of the streak have weight1/weight2 individually YELLOW
        int consec1 = 0;
        int consec2 = 0;
        Product p = productRepo.findById(cleanProduct).orElse(null);
        if (p != null && "DOUBLE".equalsIgnoreCase(p.getWeighingMode())) {
            Double effStd1 = p.getStandardWeight1() != null ? p.getStandardWeight1() : 0.0;
            Double effStd2 = p.getStandardWeight2() != null ? p.getStandardWeight2() : 0.0;
            Optional<Measurement> barrier = measurementRepo
                .findTopByProduct_ProductCodeAndLotNoAndIsForStandardAdjustmentTrueOrderByTimestampDesc(cleanProduct, cleanLot);
            if (barrier.isPresent()) {
                if (barrier.get().getWeight1() != null) effStd1 = barrier.get().getWeight1();
                if (barrier.get().getWeight2() != null) effStd2 = barrier.get().getWeight2();
            }
            for (Measurement m : latest) {
                if (Boolean.TRUE.equals(m.getIsForStandardAdjustment())) break;
                if ("GREEN".equalsIgnoreCase(m.getStatus())) break;
                // RED does NOT break the streak — keep checking individual weights
                if (m.getWeight1() != null && effStd1 > 0) {
                    String s1 = classifySingleWeight(m.getWeight1(), effStd1, p, p.getTolerance1());
                    if ("YELLOW".equals(s1) || "RED".equals(s1)) consec1++;
                }
                if (m.getWeight2() != null && effStd2 > 0) {
                    String s2 = classifySingleWeight(m.getWeight2(), effStd2, p, p.getTolerance2());
                    if ("YELLOW".equals(s2) || "RED".equals(s2)) consec2++;
                }
            }
        }

        // If count >= 5, check if there's a barrier (Apply Std) after yellow streak started
        boolean requiresApproval = false;
        int remainingYellow = Math.max(0, 5 - consec);  // How many more YELLOW can be accepted
        if (consec >= 5) {
            requiresApproval = true;
        }

        // Check for pending QA approval (STD_CHANGE_REQUEST) to restore state
        Long pendingApprovalId = null;
        if (requiresApproval) {
            try {
                List<Approval> pending = approvalRepo.findAll().stream()
                    .filter(a -> "PENDING".equalsIgnoreCase(a.getStatus()))
                    .filter(a -> "STD_CHANGE_REQUEST".equalsIgnoreCase(a.getType()))
                    .filter(a -> a.getPayloadJson() != null && a.getPayloadJson().contains(cleanLot))
                    .collect(java.util.stream.Collectors.toList());
                if (!pending.isEmpty()) {
                    pendingApprovalId = pending.stream().map(Approval::getId).filter(Objects::nonNull).max(Long::compare).orElse(null);
                }
            } catch (Exception e) {}
        }

        Map<String, Object> result = new java.util.HashMap<>();
        result.put("count", consec);
        result.put("weights3", weights.stream().limit(3).collect(java.util.stream.Collectors.toList()));
        result.put("weights5", weights);
        result.put("weights5_1", weights1);
        result.put("weights5_2", weights2);
        result.put("consec1", consec1);
        result.put("consec2", consec2);
        result.put("remainingYellow", remainingYellow);
        result.put("requiresApproval", requiresApproval);
        result.put("pendingApprovalId", pendingApprovalId != null ? pendingApprovalId : 0);
        return ResponseEntity.ok(result);
    }

    // Helper to get the current operational standard (Latest Log > Master)
    private Double getEffectiveStandard(Product p, String lotNo) {
        return getEffectiveStandard(p, lotNo, null);
    }

    /**
     * ลำดับความสำคัญของ Std:
     * 1. Barrier record (Applied Std จาก QA) — สูงสุด
     * 2. WO customStd ที่ LD กำหนด (ถ้ามี และยังไม่มี barrier)
     * 3. Product standardWeight
     * 4. WeightPerPiece × Qty (fallback)
     */
    private Double getEffectiveStandard(Product p, String lotNo, Long workOrderId) {
        // 1. Barrier record
        Optional<Measurement> barrier = measurementRepo.findTopByProduct_ProductCodeAndLotNoAndIsForStandardAdjustmentTrueOrderByTimestampDesc(p.getProductCode(), lotNo.trim());
        if (barrier.isPresent()) return barrier.get().getWeight();

        // 2. WO customStd
        if (workOrderId != null) {
            Optional<WorkOrder> wo = workOrderRepo.findById(workOrderId);
            if (wo.isPresent() && wo.get().getCustomStd() != null && wo.get().getCustomStd() > 0) {
                return wo.get().getCustomStd();
            }
        }

        // 3. Product standardWeight / 4. Fallback: Std = quantityPerMeasurement × weightPerPiece
        return p.getStandardWeight() != null && p.getStandardWeight() > 0
                ? p.getStandardWeight()
                : (p.getWeightPerPiece() != null ? p.getWeightPerPiece() : 0.0) * (p.getQuantityPerMeasurement() != null ? p.getQuantityPerMeasurement() : 0);
    }

    private String classifySingleWeight(Double weight, Double std, Product p, Double specificTolerance) {
        if (weight == null || std == null || std == 0) return "GREEN";
        double wpp  = p.getWeightPerPiece() != null ? p.getWeightPerPiece() : 0.0;
        double min  = std - wpp / 2.0;
        double max  = std + wpp / 2.0;
        double devW = specificTolerance != null ? specificTolerance : wpp / 4.0;
        double dmin = std - devW;
        double dmax = std + devW;
        if (weight < min || weight > max) return "RED";
        if (weight < dmin || weight > dmax) return "YELLOW";
        return "GREEN";
    }

    private Map<String, Object> getInitialStdStatus(String productCode, String lotNo) {
        Product product = productRepo.findById(productCode).orElse(null);
        int threshold = (product != null && product.getInnerBoxQuantity() != null && product.getInnerBoxQuantity() > 0)
                ? product.getInnerBoxQuantity() : 10;

        List<Measurement> lotHistory = measurementRepo.findTop100ByProduct_ProductCodeAndLotNoOrderByTimestampDesc(productCode, lotNo);
        List<Measurement> validBoxes = lotHistory.stream()
                .filter(x -> !Boolean.TRUE.equals(x.getIsForStandardAdjustment()) && !"000".equals(x.getOuterBoxNumber()) && !"RST1".equals(x.getInnerBoxOrder()))
                .toList();

        long count = validBoxes.size();

        // A YELLOW-streak barrier created BEFORE the threshold was reached should NOT
        // prevent Initial Std from triggering.  Only a barrier applied AT OR AFTER the
        // timestamp of the threshold-th measurement counts as "Initial Std already done".
        List<Measurement> barriers = lotHistory.stream()
                .filter(x -> Boolean.TRUE.equals(x.getIsForStandardAdjustment()))
                .collect(java.util.stream.Collectors.toList());

        boolean requiresInitialStd = false;
        if (count >= threshold) {
            // Sort valid boxes ASC to find when the threshold was reached
            List<Measurement> sortedValid = validBoxes.stream()
                    .sorted(java.util.Comparator.comparing(Measurement::getTimestamp,
                            java.util.Comparator.nullsLast(java.util.Comparator.naturalOrder())))
                    .collect(java.util.stream.Collectors.toList());
            LocalDateTime thresholdReachedAt = sortedValid.get(threshold - 1).getTimestamp();
            // Only barriers whose timestamp is >= thresholdReachedAt count as "already applied"
            boolean hasPostThresholdBarrier = barriers.stream()
                    .filter(b -> b.getTimestamp() != null)
                    .anyMatch(b -> !b.getTimestamp().isBefore(thresholdReachedAt));
            requiresInitialStd = !hasPostThresholdBarrier;
        }

        Map<String, Object> result = new HashMap<>();
        result.put("count", count);
        result.put("threshold", threshold);
        result.put("requiresApproval", requiresInitialStd);

        if (requiresInitialStd) {
            List<Measurement> firstN = validBoxes.stream()
                    .sorted(java.util.Comparator.comparing(Measurement::getTimestamp))
                    .limit(threshold)
                    .toList();

            double sumW1 = 0; int countW1 = 0;
            double sumW2 = 0; int countW2 = 0;
            double sumW = 0; int countW = 0;

            for (Measurement m : firstN) {
                if (m.getWeight1() != null) { sumW1 += m.getWeight1(); countW1++; }
                if (m.getWeight2() != null) { sumW2 += m.getWeight2(); countW2++; }
                if (m.getWeight() != null) { sumW += m.getWeight(); countW++; }
            }

            result.put("avgWeight1", countW1 > 0 ? (sumW1 / countW1) : null);
            result.put("avgWeight2", countW2 > 0 ? (sumW2 / countW2) : null);
            result.put("avgWeight", countW > 0 ? (sumW / countW) : null);
            result.put("allWeights",  firstN.stream().filter(m -> m.getWeight()  != null).map(Measurement::getWeight).collect(java.util.stream.Collectors.toList()));
            result.put("allWeights1", firstN.stream().filter(m -> m.getWeight1() != null).map(Measurement::getWeight1).collect(java.util.stream.Collectors.toList()));
            result.put("allWeights2", firstN.stream().filter(m -> m.getWeight2() != null).map(Measurement::getWeight2).collect(java.util.stream.Collectors.toList()));
        } else {
            result.put("avgWeight1", null);
            result.put("avgWeight2", null);
            result.put("avgWeight", null);
            result.put("allWeights",  java.util.List.of());
            result.put("allWeights1", java.util.List.of());
            result.put("allWeights2", java.util.List.of());
        }
        return result;
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('OPERATOR','LEADER','ADMIN')")
    public ResponseEntity<?> create(@RequestBody CreateMeasurementRequest req) {
        if (req.getProductCode() == null || req.getScaleId() == null) {
            return ResponseEntity.badRequest().body("productCode and scaleId are required");
        }
        String cleanProduct = Objects.requireNonNull(req.getProductCode()).trim();
        Product p = productRepo.findById(cleanProduct).orElse(null);
        if (p == null) return ResponseEntity.badRequest().body("Unknown product");
        Scale s = scaleRepo.findById(Objects.requireNonNull(req.getScaleId())).orElse(null);
        if (s == null) return ResponseEntity.badRequest().body("Unknown scale");

        String status;
        double w = req.getWeight();

        // ─── Recalc Std Mode check (ต้องทำก่อน classification ปกติ) ───────────
        List<Measurement> earlyHistory = measurementRepo
                .findTop100ByProduct_ProductCodeAndScale_ScaleIdAndLotNoOrderByTimestampDesc(
                        p.getProductCode(), s.getScaleId(), req.getLotNo().trim());
        RecalcState recalc = computeRecalcState(earlyHistory);
        if (recalc.active && recalc.sampleCount < 10) {
            // ข้ามการตรวจ Std เดิม — คำนวณ running average Std จากกล่องที่ชั่งมาแล้ว
            double newAvg = (recalc.sumWeights + w) / (recalc.sampleCount + 1);
            int newCount  = recalc.sampleCount + 1;

            // ตรวจ duplicate
            boolean existsRecalc = measurementRepo.existsByProduct_ProductCodeAndLotNoAndOuterBoxNumberAndInnerBoxOrder(
                    p.getProductCode(), req.getLotNo().trim(), req.getOuterBox(), req.getInnerOrder());
            if (existsRecalc)
                return ResponseEntity.status(409).body("Measurement already exists for this box");

            Measurement rm = new Measurement();
            rm.setProduct(p); rm.setScale(s);
            rm.setLotNo(req.getLotNo().trim());
            rm.setOuterBoxNumber(req.getOuterBox());
            rm.setInnerBoxOrder(req.getInnerOrder());
            rm.setWeight(w);
            rm.setWeight1(req.getWeight1()); rm.setWeight2(req.getWeight2());
            rm.setTimestamp(req.getTimestamp() != null
                    ? req.getTimestamp().atZone(java.time.ZoneId.systemDefault()).toLocalDateTime()
                    : LocalDateTime.now());
            rm.setOperatorName(req.getOperatorName());
            rm.setStatus("RECALC_SAMPLE");
            rm.setNote(req.getNote());
            rm.setIsForStandardAdjustment(false);
            rm.setWorkOrderId(req.getWorkOrderId());
            rm.setEffectiveStd(newAvg);   // running average IS the Std snapshot for this sample
            Measurement rSaved = measurementRepo.save(rm);

            Map<String, Object> recalcResp = new HashMap<>();
            recalcResp.put("measurement", rSaved);
            recalcResp.put("recalcStdMode", true);
            recalcResp.put("recalcSampleCount", newCount);
            recalcResp.put("recalcCurrentAvg", newAvg);
            recalcResp.put("recalcComplete", newCount >= 10);
            recalcResp.put("consecutiveYellow", 0);
            recalcResp.put("requiresApproval", false);
            recalcResp.put("requiresInitialStdApproval", false);

            if (newCount >= 10) {
                // ครบ 10 กล่อง → สร้าง STD_CHANGE_REQUEST ให้ QA อนุมัติ Std ใหม่
                Approval stdReq = new Approval();
                stdReq.setType("STD_CHANGE_REQUEST");
                stdReq.setApproverRole("QA");
                stdReq.setStatus("PENDING");
                stdReq.setStage("READY_FOR_APPLY");
                stdReq.setRequestedBy(req.getOperatorName());
                stdReq.setRequestedAt(java.time.Instant.now());
                Map<String, Object> stdPayload = new java.util.LinkedHashMap<>();
                stdPayload.put("productCode", p.getProductCode());
                stdPayload.put("scaleId", s.getScaleId());
                stdPayload.put("lotNo", req.getLotNo().trim());
                stdPayload.put("proposedStd", newAvg);
                stdPayload.put("recalcFromRed", true);
                // รวบรวม weights ของ 10 กล่อง (ASC) เพื่อให้ QA ดู
                List<Double> allW = earlyHistory.stream()
                        .filter(x -> "RECALC_SAMPLE".equals(x.getStatus()) && x.getWeight() != null)
                        .sorted(java.util.Comparator.comparing(Measurement::getTimestamp))
                        .map(Measurement::getWeight)
                        .collect(java.util.stream.Collectors.toList());
                allW.add(w); // เพิ่มกล่องที่เพิ่งชั่ง
                try { stdPayload.put("sampleWeightsJson",
                        new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(allW)); }
                catch (Exception ignored2) {}
                try { stdReq.setPayloadJson(
                        new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(stdPayload)); }
                catch (Exception ignored2) {}
                Approval savedStdReq = approvalRepo.save(stdReq);
                recalcResp.put("stdChangeApprovalId", savedStdReq.getId());
                recalcResp.put("requiresInitialStdApproval", true);
            }
            return ResponseEntity.ok(recalcResp);
        }
        // ─── end recalc check ────────────────────────────────────────────────

        // effectiveStd snapshot — stored on the record so history display is always accurate
        Double snapshotStd = null, snapshotStd1 = null, snapshotStd2 = null;

        if ("DOUBLE".equalsIgnoreCase(p.getWeighingMode())) {
            Double w1 = req.getWeight1();
            Double w2 = req.getWeight2();
            Double std1 = p.getStandardWeight1() != null ? p.getStandardWeight1() : 0.0;
            Double std2 = p.getStandardWeight2() != null ? p.getStandardWeight2() : 0.0;

            // WO customStd1/customStd2 override product defaults (ถ้ายังไม่มี barrier)
            if (req.getWorkOrderId() != null) {
                Optional<WorkOrder> wo = workOrderRepo.findById(req.getWorkOrderId());
                if (wo.isPresent()) {
                    if (wo.get().getCustomStd1() != null && wo.get().getCustomStd1() > 0) std1 = wo.get().getCustomStd1();
                    if (wo.get().getCustomStd2() != null && wo.get().getCustomStd2() > 0) std2 = wo.get().getCustomStd2();
                }
            }

            Optional<Measurement> barrier = measurementRepo.findTopByProduct_ProductCodeAndLotNoAndIsForStandardAdjustmentTrueOrderByTimestampDesc(p.getProductCode(), req.getLotNo().trim());
            if (barrier.isPresent()) {
                if (barrier.get().getWeight1() != null) std1 = barrier.get().getWeight1();
                if (barrier.get().getWeight2() != null) std2 = barrier.get().getWeight2();
            }

            snapshotStd1 = std1;
            snapshotStd2 = std2;

            String st1 = classifySingleWeight(w1, std1, p, p.getTolerance1());
            String st2 = classifySingleWeight(w2, std2, p, p.getTolerance2());
            if ("RED".equals(st1) || "RED".equals(st2)) status = "RED";
            else if ("YELLOW".equals(st1) || "YELLOW".equals(st2)) status = "YELLOW";
            else status = "GREEN";
            w = (w1 != null ? w1 : 0.0) + (w2 != null ? w2 : 0.0);
        } else {
            double baseStd = getEffectiveStandard(p, req.getLotNo(), req.getWorkOrderId());
            double wpp    = p.getWeightPerPiece() != null ? p.getWeightPerPiece() : 0.0;
            double min    = baseStd - wpp / 2.0;
            double max    = baseStd + wpp / 2.0;
            double dmin   = baseStd - wpp / 4.0;
            double dmax   = baseStd + wpp / 4.0;
            if (w < min || w > max) status = "RED";
            else if (w < dmin || w > dmax) status = "YELLOW";
            else status = "GREEN";
            snapshotStd = baseStd;
        }

    // Reject duplicate (same product/scale/lot/outer/inner)
    boolean exists = measurementRepo.existsByProduct_ProductCodeAndLotNoAndOuterBoxNumberAndInnerBoxOrder(
        p.getProductCode(), req.getLotNo().trim(), req.getOuterBox(), req.getInnerOrder());
    if (exists) {
        return ResponseEntity.status(409).body("Measurement already exists for this box");
    }

    Measurement m = new Measurement();
        m.setProduct(p);
        m.setScale(s);
        m.setLotNo(req.getLotNo().trim());
        m.setOuterBoxNumber(req.getOuterBox());
        m.setInnerBoxOrder(req.getInnerOrder());
        m.setWeight(w);
        m.setWeight1(req.getWeight1());
        m.setWeight2(req.getWeight2());
        if (req.getTimestamp() != null) {
            m.setTimestamp(req.getTimestamp().atZone(java.time.ZoneId.systemDefault()).toLocalDateTime());
        } else {
            m.setTimestamp(LocalDateTime.now());
        }
        m.setOperatorName(req.getOperatorName());
        m.setStatus(status);
        m.setApprovalId(req.getApprovalId());
        m.setNote(req.getNote());
        m.setIsForStandardAdjustment(Boolean.FALSE);
        m.setWorkOrderId(req.getWorkOrderId());
        // Store effective Std snapshot so history display is always accurate
        m.setEffectiveStd(snapshotStd);
        m.setEffectiveStd1(snapshotStd1);
        m.setEffectiveStd2(snapshotStd2);
        Measurement saved = measurementRepo.save(m);

        // Calculate consecutive yellow with approval check
        List<Measurement> history = measurementRepo.findTop100ByProduct_ProductCodeAndScale_ScaleIdAndLotNoOrderByTimestampDesc(
                p.getProductCode(), s.getScaleId(), req.getLotNo().trim());
        int consec = 0;
        LocalDateTime firstYellowTime = null;
        for (Measurement x : history) {
            if (Boolean.TRUE.equals(x.getIsForStandardAdjustment())) break;
            if ("GREEN".equalsIgnoreCase(x.getStatus())) break;
            // RED does NOT reset the streak — only GREEN does
            if ("YELLOW".equalsIgnoreCase(x.getStatus())) {
                consec++;
                if (firstYellowTime == null) firstYellowTime = x.getTimestamp();
            }
        }

        // For DOUBLE mode: count how many of the streak have weight1/weight2 individually YELLOW
        int consec1 = 0;
        int consec2 = 0;
        if ("DOUBLE".equalsIgnoreCase(p.getWeighingMode())) {
            Double effStd1 = p.getStandardWeight1() != null ? p.getStandardWeight1() : 0.0;
            Double effStd2 = p.getStandardWeight2() != null ? p.getStandardWeight2() : 0.0;
            Optional<Measurement> barrierChk = measurementRepo
                .findTopByProduct_ProductCodeAndLotNoAndIsForStandardAdjustmentTrueOrderByTimestampDesc(p.getProductCode(), req.getLotNo().trim());
            if (barrierChk.isPresent()) {
                if (barrierChk.get().getWeight1() != null) effStd1 = barrierChk.get().getWeight1();
                if (barrierChk.get().getWeight2() != null) effStd2 = barrierChk.get().getWeight2();
            }
            for (Measurement x : history) {
                if (Boolean.TRUE.equals(x.getIsForStandardAdjustment())) break;
                if ("GREEN".equalsIgnoreCase(x.getStatus())) break;
                // RED does NOT break the streak — keep checking individual weights
                if (x.getWeight1() != null && effStd1 > 0) {
                    String s1 = classifySingleWeight(x.getWeight1(), effStd1, p, p.getTolerance1());
                    if ("YELLOW".equals(s1) || "RED".equals(s1)) consec1++;
                }
                if (x.getWeight2() != null && effStd2 > 0) {
                    String s2 = classifySingleWeight(x.getWeight2(), effStd2, p, p.getTolerance2());
                    if ("YELLOW".equals(s2) || "RED".equals(s2)) consec2++;
                }
            }
        }

        // Check if approval is needed
        boolean requiresApproval = false;
        int remainingYellow = Math.max(0, 5 - consec);
        if (consec >= 5) {
            requiresApproval = true;
        }

        Map<String, Object> initialStatus = getInitialStdStatus(p.getProductCode(), req.getLotNo().trim());
        boolean requiresInitialStdApproval = (boolean) initialStatus.get("requiresApproval");

        Map<String, Object> responseMap = new HashMap<>(Map.of(
            "measurement", saved, "consecutiveYellow", consec, "remainingYellow", remainingYellow,
            "requiresApproval", requiresApproval, "requiresInitialStdApproval", requiresInitialStdApproval
        ));
        responseMap.put("avgWeight1", initialStatus.get("avgWeight1"));
        responseMap.put("avgWeight2", initialStatus.get("avgWeight2"));
        responseMap.put("avgWeight", initialStatus.get("avgWeight"));
        responseMap.put("allWeights",  initialStatus.get("allWeights"));
        responseMap.put("allWeights1", initialStatus.get("allWeights1"));
        responseMap.put("allWeights2", initialStatus.get("allWeights2"));
        responseMap.put("initialStdThreshold", initialStatus.get("threshold"));
        responseMap.put("consecutiveYellow1", consec1);
        responseMap.put("consecutiveYellow2", consec2);

        return ResponseEntity.ok(responseMap);
    }

    @GetMapping("/last")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> getLast(@RequestParam String productCode,
                                     @RequestParam String scaleId,
                                     @RequestParam String lotNo) {
        String cleanProduct = productCode.trim();
        String cleanLot = lotNo.trim();
        System.out.println("DEBUG: getLast params: product=" + cleanProduct + ", scale=" + scaleId + ", lot=" + cleanLot);
        // ดึงข้อมูลล่าสุดหลายรายการภายใน lot เพื่อข้าม barrier หรือ record ที่ไม่ใช่กล่องจริง
        List<Measurement> latest = measurementRepo
                .findTop100ByProduct_ProductCodeAndScale_ScaleIdAndLotNoOrderByTimestampDesc(cleanProduct, scaleId, cleanLot);
        System.out.println("DEBUG: getLast found " + latest.size() + " items");
        // Debug: print top 10 candidates
        for (int di = 0; di < Math.min(10, latest.size()); di++) {
            Measurement dc = latest.get(di);
            System.out.println("DEBUG: getLast candidate[" + di + "] id=" + dc.getMeasurementId() + " outer=[" + dc.getOuterBoxNumber() + "] inner=[" + dc.getInnerBoxOrder() + "] isBarrier=" + dc.getIsForStandardAdjustment() + " ts=" + dc.getTimestamp());
        }
        Measurement m = null;
        for (Measurement cand : latest) {
            String outer = cand.getOuterBoxNumber();
            // More permissive check: extract digits and check if > 0
            if (outer != null) {
                String digits = outer.replaceAll("\\D+", "");
                if (!digits.isEmpty()) {
                    try {
                        if (Integer.parseInt(digits) > 0) { m = cand; break; }
                    } catch (NumberFormatException ignored) {}
                }
            }
        }
        if (m != null) {
            System.out.println("DEBUG: getLast selected measurement: id=" + m.getMeasurementId() + ", outer=" + m.getOuterBoxNumber() + ", inner=" + m.getInnerBoxOrder());
        } else {
            System.out.println("DEBUG: getLast no valid measurement found (m is null)");
        }

        // Calculate consecutive yellow for display
        int consec = 0;
        LocalDateTime firstYellowTime = null;
        for (Measurement x : latest) {
            if (Boolean.TRUE.equals(x.getIsForStandardAdjustment())) break;
            if ("GREEN".equalsIgnoreCase(x.getStatus())) break;
            // RED does NOT reset the streak — only GREEN does
            if ("YELLOW".equalsIgnoreCase(x.getStatus())) {
                consec++;
                if (firstYellowTime == null) firstYellowTime = x.getTimestamp();
            }
        }

        // Check if approval is needed
        boolean requiresApproval = false;
        int remainingYellow = Math.max(0, 5 - consec);
        Long pendingApprovalId = null;
        if (consec >= 5) {
            requiresApproval = true;
        }
        Map<String, Object> initialStatus = getInitialStdStatus(cleanProduct, cleanLot);
        boolean requiresInitialStdApproval = (boolean) initialStatus.get("requiresApproval");

        // ค้นหา pending approval สำหรับ STD_CHANGE_REQUEST ของ lot นี้ (เพื่อ restore lock state)
        if (requiresApproval) {
            try {
                List<Approval> pending = approvalRepo.findAll().stream()
                    .filter(a -> "PENDING".equalsIgnoreCase(a.getStatus()))
                    .filter(a -> "STD_CHANGE_REQUEST".equalsIgnoreCase(a.getType()))
                    .filter(a -> a.getPayloadJson() != null && a.getPayloadJson().contains(cleanLot))
                    .collect(java.util.stream.Collectors.toList());
                if (!pending.isEmpty()) {
                    pendingApprovalId = pending.stream().map(Approval::getId).filter(Objects::nonNull).max(Long::compare).orElse(null);
                }
            } catch (Exception e) { /* silent */ }
        }

        LastResponse resp = new LastResponse();
        // Default values if no history found
        String nextOuter = "001";
        String nextInner = "0001";
        resp.setDebugMessage("Found " + latest.size() + " items. Selected ID: " + (m != null ? m.getMeasurementId() : "None") + (m!=null ? " Outer:"+m.getOuterBoxNumber() : ""));
        resp.setFoundHistory(m != null);
        resp.setConsecutiveYellow(consec);
        resp.setRemainingYellow(remainingYellow);
        resp.setRequiresApproval(requiresApproval);
        resp.setRequiresInitialStdApproval(requiresInitialStdApproval);
        resp.setAvgWeight1((Double) initialStatus.get("avgWeight1"));
        resp.setAvgWeight2((Double) initialStatus.get("avgWeight2"));
        resp.setAvgWeight((Double) initialStatus.get("avgWeight"));
        resp.setInitialStdThreshold((Integer) initialStatus.get("threshold"));

        // Recalc Std mode state
        RecalcState recalcLast = computeRecalcState(latest);
        resp.setRecalcStdMode(recalcLast.active);
        resp.setRecalcSampleCount(recalcLast.sampleCount);
        resp.setRecalcCurrentAvg(recalcLast.currentAvg);
        
        // Check for pending QA approval (for logout/login scenario recovery)
        // ตรวจสอบว่ามี approval ที่ pending อยู่แล้วหรือไม่ เพื่อให้ frontend restore lock state
        try {
          // Query: หา approval ที่ pending สำหรับ STD_CHANGE_REQUEST ของ lot นี้
          // ในกรณี logout/login - state reset แต่ approval ยังคงอยู่ในระบบ
          List<Approval> pendingApprovals = approvalRepo.findAll().stream()
            .filter(a -> "PENDING".equalsIgnoreCase(a.getStatus()))
            .filter(a -> "STD_CHANGE_REQUEST".equalsIgnoreCase(a.getType()))
            .filter(a -> a.getPayloadJson() != null && a.getPayloadJson().contains(cleanLot))
            .collect(java.util.stream.Collectors.toList());
          
          if (!pendingApprovals.isEmpty()) {
            // ใช้ approval ตัวล่าสุด
            Approval latestPending = pendingApprovals.stream()
              .max(java.util.Comparator.comparing(Approval::getId))
              .orElse(null);
            if (latestPending != null) {
              resp.setId(latestPending.getId()); // Use approval ID as indicator for frontend
              // ปล. frontend จะตรวจสอบว่า resp.id มีค่า && requiresApproval=true เพื่อ restore qaApprovalId
            }
          }
        } catch (Exception e) {
          // Silent catch - ไม่ใช่ critical operation
        }

        if (m != null) {
            resp.setId(m.getMeasurementId());
            resp.setApprovalId(m.getApprovalId());
            resp.setOuterBoxNumber(m.getOuterBoxNumber());
            resp.setInnerBoxOrder(m.getInnerBoxOrder());
            resp.setTimestamp(m.getTimestamp());
            resp.setStatus(m.getStatus());

            // ถ้า measurement มี approvalId ผูกอยู่ และ approval ยัง PENDING + เป็น RED_EVENT
            // → override status เป็น "RED" เพื่อให้ frontend restore ถูกต้อง
            // (backend อาจเก็บ status=YELLOW เพราะ formula ต่างจาก frontend แต่ approval คือหลักฐานว่าเป็น RED)
            if (m.getApprovalId() != null) {
                try {
                    Approval linkedApproval = approvalRepo.findById(m.getApprovalId()).orElse(null);
                    if (linkedApproval != null
                            && "PENDING".equalsIgnoreCase(linkedApproval.getStatus())
                            && "RED_EVENT".equalsIgnoreCase(linkedApproval.getType())) {
                        resp.setStatus("RED");
                    }
                } catch (Exception ignored) { /* ไม่ใช่ critical — ถ้าเกิด error ใช้ status เดิม */ }
            }
        }

        resp.setPendingApprovalId(pendingApprovalId);
        // Calculate Next Outer/Inner based on Product configuration
        if (m != null) {
            try {
                int curOuter = Integer.parseInt(m.getOuterBoxNumber());
                Product p = m.getProduct();
                if (p == null) p = productRepo.findById(Objects.requireNonNull(cleanProduct)).orElse(null);
                
                // Assume InnerBoxQuantity exists in Product (as per spec). 
                // If not present in class, default to a high number or use QuantityPerMeasurement as fallback if appropriate.
                // Here we default to 50 if 0 or null to prevent infinite loop/error.
                int capacity = (p != null && p.getInnerBoxQuantity() != null && p.getInnerBoxQuantity() > 0) ? p.getInnerBoxQuantity() : 50;
                String numberingMode = (p != null && p.getInnerNumberingMode() != null) ? p.getInnerNumberingMode() : "CONTINUOUS";

                // Check count of items in current outer box to decide if we should move to next outer
                List<Measurement> itemsInOuter = measurementRepo.findByProduct_ProductCodeAndScale_ScaleIdAndLotNoAndOuterBoxNumberOrderByInnerBoxOrderAsc(
                        cleanProduct, scaleId, cleanLot, m.getOuterBoxNumber());
                
                long count;
                if (itemsInOuter.isEmpty()) {
                    // Fallback: ถ้า query ไม่เจอรายการ (อาจเพราะ format string ไม่ตรงกัน) ให้ลองใช้เลขจาก m โดยตรง
                    try {
                        count = Long.parseLong(m.getInnerBoxOrder().trim());
                    } catch (Exception e) {
                        count = 0;
                    }
                } else {
                    count = itemsInOuter.stream().filter(x -> x.getInnerBoxOrder() != null && x.getInnerBoxOrder().trim().matches("\\d+")).count();
                }

                // คำนวณ Inner ถัดไปจาก MAX inner ใน outer นี้ (ไม่ใช่จาก m เพราะ m อาจไม่ใช่ inner ล่าสุด)
                // ใช้ final copy เพราะ Java lambda ต้องการ effectively final variable
                final Measurement mFinal = m;
                final long countFinal = count;
                int lastInnerVal = 0;
                if (!itemsInOuter.isEmpty()) {
                    // ใช้ MAX inner box order จากทุก record ใน outer นี้ เพื่อหลีกเลี่ยง off-by-one เมื่อ m ไม่ใช่ record ล่าสุด
                    lastInnerVal = itemsInOuter.stream()
                        .filter(x -> x.getInnerBoxOrder() != null && x.getInnerBoxOrder().trim().matches("\\d+"))
                        .mapToInt(x -> { try { return Integer.parseInt(x.getInnerBoxOrder().trim()); } catch (Exception e2) { return 0; } })
                        .max()
                        .orElseGet(() -> { try { return Integer.parseInt(mFinal.getInnerBoxOrder()); } catch (NumberFormatException e2) { return (int) countFinal; } });
                } else {
                    try { lastInnerVal = Integer.parseInt(m.getInnerBoxOrder()); } catch (NumberFormatException e) { lastInnerVal = (int) count; }
                }
                System.out.println("DEBUG: getLast lastInnerVal=" + lastInnerVal + " count=" + count + " capacity=" + capacity);

                if (count < capacity) {
                    nextOuter = String.format("%03d", curOuter);
                    nextInner = String.format("%04d", lastInnerVal + 1);
                } else {
                    nextOuter = String.format("%03d", curOuter + 1);
                    if ("RESET_PER_OUTER".equalsIgnoreCase(numberingMode)) {
                        nextInner = "0001";
                    } else {
                        nextInner = String.format("%04d", lastInnerVal + 1);
                    }
                }
            } catch (NumberFormatException e) {
                // Fallback if parsing fails
                nextOuter = m.getOuterBoxNumber();
                nextInner = m.getInnerBoxOrder();
            }
        }
        resp.setNextOuterBoxNumber(nextOuter);
        resp.setNextInnerBoxOrder(nextInner);
        resp.setDebugMessage(resp.getDebugMessage() + " [Calc Next: Outer=" + nextOuter + ", Inner=" + nextInner + "]");

        return ResponseEntity.ok()
                .header("Cache-Control", "no-cache, no-store, must-revalidate")
                .body(resp);
    }

    @GetMapping("/exists")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Boolean> exists(@RequestParam String productCode,
                                          @RequestParam String scaleId,
                                          @RequestParam String lotNo,
                                          @RequestParam String outerBox,
                                          @RequestParam String innerOrder) {
        boolean ex = measurementRepo.existsByProduct_ProductCodeAndLotNoAndOuterBoxNumberAndInnerBoxOrder(
                productCode.trim(), lotNo.trim(), outerBox, innerOrder);
        return ResponseEntity.ok(ex);
    }

    @GetMapping("/current-outer")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> getCurrentOuter(@RequestParam String productCode,
                                             @RequestParam String scaleId,
                                             @RequestParam String lotNo) {
        String cleanProduct = productCode.trim();
        String cleanLot = lotNo.trim();
        // 1. Find latest measurement to determine current Outer
        Optional<Measurement> lastOpt = measurementRepo.findTopByProduct_ProductCodeAndScale_ScaleIdAndLotNoOrderByTimestampDesc(Objects.requireNonNull(cleanProduct), scaleId, cleanLot);
        
        Product p = productRepo.findById(cleanProduct).orElse(null);
        int capacity = (p != null && p.getInnerBoxQuantity() != null && p.getInnerBoxQuantity() > 0) ? p.getInnerBoxQuantity() : 50;

        String currentOuter = "001";
        if (lastOpt.isPresent()) {
            String lastOuter = lastOpt.get().getOuterBoxNumber();
            // Check if last outer is full
            List<Measurement> itemsInLast = measurementRepo.findByProduct_ProductCodeAndScale_ScaleIdAndLotNoAndOuterBoxNumberOrderByInnerBoxOrderAsc(
                    cleanProduct, scaleId, cleanLot, lastOuter);
            long countInLast = itemsInLast.stream().filter(m -> m.getInnerBoxOrder() != null && m.getInnerBoxOrder().trim().matches("\\d+")).count();
            
            if (countInLast >= capacity) {
                try {
                    currentOuter = String.format("%03d", Integer.parseInt(lastOuter) + 1);
                } catch (NumberFormatException e) {
                    currentOuter = lastOuter;
                }
            } else {
                currentOuter = lastOuter;
            }
        }

        // 2. Fetch all items for this outer
        List<Measurement> items = measurementRepo.findByProduct_ProductCodeAndScale_ScaleIdAndLotNoAndOuterBoxNumberOrderByInnerBoxOrderAsc(
                cleanProduct, scaleId, cleanLot, currentOuter);
        
        // 3. Calculate stats
        long count = items.stream().filter(m -> m.getInnerBoxOrder() != null && m.getInnerBoxOrder().trim().matches("\\d+")).count();
        int remaining = Math.max(0, capacity - (int)count);

        // Calculate consecutive yellow for display in Outer section
        List<Measurement> history = measurementRepo.findTop100ByProduct_ProductCodeAndScale_ScaleIdAndLotNoOrderByTimestampDesc(cleanProduct, scaleId, cleanLot);
        int consec = 0;
        for (Measurement h : history) {
            if (Boolean.TRUE.equals(h.getIsForStandardAdjustment())) break;
            if ("GREEN".equalsIgnoreCase(h.getStatus())) break;
            // RED does NOT reset the streak — only GREEN does
            if ("YELLOW".equalsIgnoreCase(h.getStatus())) consec++;
        }

        return ResponseEntity.ok(java.util.Map.of(
            "outerBox", currentOuter,
            "capacity", capacity,
            "packed", count,
            "remaining", remaining,
            "consecutiveYellow", consec,
            "items", items
        ));
    }

    @GetMapping("/history")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<List<Map<String, Object>>> getHistory(@RequestParam String productCode,
                                                        @RequestParam String scaleId,
                                                        @RequestParam String lotNo) {
        String cleanProduct = productCode.trim();
        String cleanLot = lotNo.trim();
        List<Measurement> list = measurementRepo.findByProduct_ProductCodeAndScale_ScaleIdAndLotNoOrderByTimestampDesc(Objects.requireNonNull(cleanProduct), scaleId, cleanLot);
        
        // Fetch barriers for this lot (fallback for old records that have no effectiveStd snapshot)
        List<Measurement> barriers = measurementRepo.findByProduct_ProductCodeAndLotNoAndIsForStandardAdjustmentTrueOrderByTimestampAsc(cleanProduct, cleanLot);
        Product p = productRepo.findById(cleanProduct).orElse(null);
        Double originalStd = (p != null && p.getStandardWeight() != null && p.getStandardWeight() > 0)
                ? p.getStandardWeight()
                : (p != null && p.getWeightPerPiece() != null && p.getQuantityPerMeasurement() != null
                    ? p.getWeightPerPiece() * p.getQuantityPerMeasurement() : 0.0);
        // For old records without effectiveStd: use StandardWeightLog.oldStd as the most accurate
        // pre-barrier baseline (exact std before the first QA change for this product).
        Double preBarrierStd = originalStd; // default fallback
        if (!barriers.isEmpty()) {
            List<StandardWeightLog> logs = stdLogRepo.findByProductCodeOrderByApprovedAtDesc(cleanProduct);
            if (!logs.isEmpty()) {
                // Oldest log (last in DESC list) has the original oldStd before the very first change
                StandardWeightLog oldest = logs.get(logs.size() - 1);
                if (oldest.getOldStd() != null && oldest.getOldStd() > 0) preBarrierStd = oldest.getOldStd();
            }
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (Measurement m : list) {
            if (Boolean.TRUE.equals(m.getIsForStandardAdjustment())) continue; // skip barrier records
            Map<String, Object> map = new HashMap<>();
            map.put("measurementId", m.getMeasurementId());
            map.put("outerBoxNumber", m.getOuterBoxNumber());
            map.put("innerBoxOrder", m.getInnerBoxOrder());
            map.put("weight", m.getWeight());
            map.put("weight1", m.getWeight1());
            map.put("weight2", m.getWeight2());
            map.put("status", m.getStatus());
            map.put("timestamp", m.getTimestamp());
            map.put("operatorName", m.getOperatorName());

            // Prefer stored snapshot (new records) — fall back to barrier reconstruction (old records)
            Double historicalStd;
            Double historicalStd1;
            Double historicalStd2;
            if (m.getEffectiveStd() != null || m.getEffectiveStd1() != null) {
                historicalStd  = m.getEffectiveStd();
                historicalStd1 = m.getEffectiveStd1();
                historicalStd2 = m.getEffectiveStd2();
            } else {
                // Legacy fallback: reconstruct from barriers using pre-barrier baseline
                historicalStd  = barriers.isEmpty() ? originalStd : preBarrierStd;
                historicalStd1 = p != null ? p.getStandardWeight1() : null;
                historicalStd2 = p != null ? p.getStandardWeight2() : null;
                if (m.getTimestamp() != null) {
                    for (Measurement b : barriers) {
                        if (b.getTimestamp() == null) continue;
                        if (!b.getTimestamp().isAfter(m.getTimestamp())) {
                            if (b.getWeight()  != null) historicalStd  = b.getWeight();
                            if (b.getWeight1() != null) historicalStd1 = b.getWeight1();
                            if (b.getWeight2() != null) historicalStd2 = b.getWeight2();
                        }
                    }
                }
            }
            map.put("std", historicalStd);
            if (p != null && "DOUBLE".equalsIgnoreCase(p.getWeighingMode())) {
                map.put("std1", historicalStd1);
                map.put("std2", historicalStd2);
            }
            result.add(map);
        }

        return ResponseEntity.ok()
                .header("Cache-Control", "no-cache, no-store, must-revalidate")
                .body(result);
    }

    // Return all measurements for a specific outer box (QA Outer Inspection / Sorting)
    @GetMapping("/by-outer")
    @PreAuthorize("hasAnyRole('QA','LEADER','OPERATOR','ADMIN')")
    public ResponseEntity<List<Map<String, Object>>> byOuter(@RequestParam String productCode,
                                                              @RequestParam(required = false, defaultValue = "") String scaleId,
                                                              @RequestParam String lotNo,
                                                              @RequestParam String outerBox) {
        List<Measurement> list;
        if (scaleId != null && !scaleId.isBlank()) {
            list = measurementRepo
                    .findByProduct_ProductCodeAndScale_ScaleIdAndLotNoAndOuterBoxNumberOrderByInnerBoxOrderAsc(
                            productCode.trim(), scaleId.trim(), lotNo.trim(), outerBox.trim());
        } else {
            // fallback: no scale filter (e.g. scaleId not captured in approval payload)
            list = measurementRepo
                    .findByProduct_ProductCodeAndLotNoAndOuterBoxNumberOrderByInnerBoxOrderAsc(
                            productCode.trim(), lotNo.trim(), outerBox.trim());
        }
        Product pByOuter = productRepo.findById(productCode.trim()).orElse(null);
        List<Measurement> barriersForOuter = measurementRepo
                .findByProduct_ProductCodeAndLotNoAndIsForStandardAdjustmentTrueOrderByTimestampAsc(
                        productCode.trim(), lotNo.trim());
        // Pre-barrier fallback: use StandardWeightLog.oldStd (exact original), else wpp×qty, else currentStd
        Double outerPreBarrierStd = pByOuter != null && pByOuter.getStandardWeight() != null
                ? pByOuter.getStandardWeight() : null;
        if (!barriersForOuter.isEmpty()) {
            List<StandardWeightLog> outerLogs = stdLogRepo.findByProductCodeOrderByApprovedAtDesc(productCode.trim());
            if (!outerLogs.isEmpty()) {
                StandardWeightLog oldest = outerLogs.get(outerLogs.size() - 1);
                if (oldest.getOldStd() != null && oldest.getOldStd() > 0) outerPreBarrierStd = oldest.getOldStd();
            } else if (pByOuter != null && pByOuter.getWeightPerPiece() != null && pByOuter.getQuantityPerMeasurement() != null) {
                outerPreBarrierStd = pByOuter.getWeightPerPiece() * pByOuter.getQuantityPerMeasurement();
            }
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (Measurement m : list) {
            if (Boolean.TRUE.equals(m.getIsForStandardAdjustment())) continue; // skip barriers
            Map<String, Object> map = new HashMap<>();
            map.put("measurementId", m.getMeasurementId());
            map.put("outerBox", m.getOuterBoxNumber());
            map.put("innerOrder", m.getInnerBoxOrder());
            map.put("weight", m.getWeight());
            map.put("weight1", m.getWeight1());
            map.put("weight2", m.getWeight2());
            map.put("status", m.getStatus());
            map.put("timestamp", m.getTimestamp());
            map.put("operatorName", m.getOperatorName());
            // Prefer stored snapshot; fall back to barrier reconstruction for old records
            Double effStd, effStd1, effStd2;
            if (m.getEffectiveStd() != null || m.getEffectiveStd1() != null) {
                effStd  = m.getEffectiveStd();
                effStd1 = m.getEffectiveStd1();
                effStd2 = m.getEffectiveStd2();
            } else {
                // Legacy fallback: use preBarrierStd for pre-barrier period, barrier.weight after change
                effStd  = barriersForOuter.isEmpty() ? outerPreBarrierStd : outerPreBarrierStd;
                effStd1 = pByOuter != null ? pByOuter.getStandardWeight1() : null;
                effStd2 = pByOuter != null ? pByOuter.getStandardWeight2() : null;
                if (m.getTimestamp() != null) {
                    for (Measurement b : barriersForOuter) {
                        if (b.getTimestamp() != null && !b.getTimestamp().isAfter(m.getTimestamp())) {
                            if (b.getWeight()  != null) effStd  = b.getWeight();
                            if (b.getWeight1() != null) effStd1 = b.getWeight1();
                            if (b.getWeight2() != null) effStd2 = b.getWeight2();
                        }
                    }
                }
            }
            map.put("std", effStd);
            if (pByOuter != null && "DOUBLE".equalsIgnoreCase(pByOuter.getWeighingMode())) {
                map.put("std1", effStd1);
                map.put("std2", effStd2);
            }
            // Also include product tolerance for frontend validation
            if (pByOuter != null) {
                map.put("tolerance", pByOuter.getTolerance());
                map.put("tolerance1", pByOuter.getTolerance1());
                map.put("tolerance2", pByOuter.getTolerance2());
                map.put("weightPerPiece", pByOuter.getWeightPerPiece());
            }
            result.add(map);
        }
        return ResponseEntity.ok(result);
    }

    // Determine which standard to use for the given lot per business flow:
    // - If there is an APPLIED Std (barrier record in this lot), use that value (source = 'applied').
    // - Otherwise, use the table default (weightPerPiece * quantityPerMeasurement) (source = 'table').
    @GetMapping("/std-source")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> stdSource(@RequestParam String productCode,
                       @RequestParam String scaleId,
                       @RequestParam String lotNo) {
    String cleanProduct = productCode.trim();
    Product p = productRepo.findById(cleanProduct).orElse(null);
    if (p == null) return ResponseEntity.badRequest().body("Unknown product");
    
    Optional<Measurement> barrier = measurementRepo.findTopByProduct_ProductCodeAndLotNoAndIsForStandardAdjustmentTrueOrderByTimestampDesc(Objects.requireNonNull(cleanProduct), lotNo.trim());
    if (barrier.isPresent()) {
        Map<String, Object> res = new HashMap<>();
        res.put("source", "applied");
        res.put("std", barrier.get().getWeight());
        if (p != null && "DOUBLE".equalsIgnoreCase(p.getWeighingMode())) {
            res.put("std1", barrier.get().getWeight1());
            res.put("std2", barrier.get().getWeight2());
        }
        return ResponseEntity.ok(res);
    }

    double std = p.getStandardWeight() != null && p.getStandardWeight() > 0
            ? p.getStandardWeight()
            : (p.getWeightPerPiece() != null ? p.getWeightPerPiece() : 0.0) * (p.getQuantityPerMeasurement() != null ? p.getQuantityPerMeasurement() : 0);
    Map<String, Object> res = new HashMap<>();
    res.put("source", "table");
    res.put("std", std);
    if (p != null && "DOUBLE".equalsIgnoreCase(p.getWeighingMode())) {
        res.put("std1", p.getStandardWeight1());
        res.put("std2", p.getStandardWeight2());
    }
    return ResponseEntity.ok(res);
    }

    // Operator re-weighs the same box after Leader approval
    @PutMapping("/reweigh")
    @PreAuthorize("hasRole('OPERATOR')")
    public ResponseEntity<?> reweigh(@RequestBody ReweighRequest req) {
        if (req.getProductCode() == null || req.getScaleId() == null || req.getLotNo() == null
                || req.getOuterBox() == null || req.getInnerOrder() == null) {
            return ResponseEntity.badRequest().body("Missing keys for reweigh");
        }
        Optional<Measurement> opt = measurementRepo.findByProduct_ProductCodeAndLotNoAndOuterBoxNumberAndInnerBoxOrder(
                req.getProductCode().trim(), req.getLotNo().trim(), req.getOuterBox(), req.getInnerOrder());
        if (opt.isEmpty()) return ResponseEntity.notFound().build();
        Measurement m = opt.get();
        // Must have an approved Leader approval linked
        if (m.getApprovalId() == null) {
            return ResponseEntity.status(409).body("Reweigh not allowed: no leader approval linked");
        }
    Approval ap = approvalRepo.findById(Objects.requireNonNull(m.getApprovalId())).orElse(null);
        if (ap == null || ap.getStatus() == null || !"APPROVED".equalsIgnoreCase(ap.getStatus())) {
            return ResponseEntity.status(409).body("Reweigh not allowed: approval is not APPROVED");
        }

        // Recompute classification with current product settings
        Product p = m.getProduct();
    if (p == null) p = productRepo.findById(Objects.requireNonNull(req.getProductCode().trim())).orElse(null);
        if (p == null) return ResponseEntity.badRequest().body("Unknown product");

        String prevStatus = m.getStatus();
        Double prevWeight = m.getWeight();
        double w = req.getWeight();
        String status;

        Double reweighSnapshotStd = null, reweighSnapshotStd1 = null, reweighSnapshotStd2 = null;

        if ("DOUBLE".equalsIgnoreCase(p.getWeighingMode())) {
            Double w1 = req.getWeight1();

            Double w2 = req.getWeight2();
            Double std1 = p.getStandardWeight1() != null ? p.getStandardWeight1() : 0.0;
            Double std2 = p.getStandardWeight2() != null ? p.getStandardWeight2() : 0.0;

            Optional<Measurement> barrier = measurementRepo.findTopByProduct_ProductCodeAndLotNoAndIsForStandardAdjustmentTrueOrderByTimestampDesc(p.getProductCode(), req.getLotNo().trim());
            if (barrier.isPresent()) {
                if (barrier.get().getWeight1() != null) std1 = barrier.get().getWeight1();
                if (barrier.get().getWeight2() != null) std2 = barrier.get().getWeight2();
            }

            reweighSnapshotStd1 = std1;
            reweighSnapshotStd2 = std2;

            String st1 = classifySingleWeight(w1, std1, p, p.getTolerance1());
            String st2 = classifySingleWeight(w2, std2, p, p.getTolerance2());
            if ("RED".equals(st1) || "RED".equals(st2)) status = "RED";
            else if ("YELLOW".equals(st1) || "YELLOW".equals(st2)) status = "YELLOW";
            else status = "GREEN";
            w = (w1 != null ? w1 : 0.0) + (w2 != null ? w2 : 0.0);
        } else {
            double baseStd = getEffectiveStandard(p, req.getLotNo());
            double wpp2   = p.getWeightPerPiece() != null ? p.getWeightPerPiece() : 0.0;
            double min    = baseStd - wpp2 / 2.0;
            double max    = baseStd + wpp2 / 2.0;
            double dmin   = baseStd - wpp2 / 4.0;
            double dmax   = baseStd + wpp2 / 4.0;
            if (w < min || w > max) status = "RED";
            else if (w < dmin || w > dmax) status = "YELLOW";
            else status = "GREEN";
            reweighSnapshotStd = baseStd;
        }

        // ถ้า approval มี recalcStdMode=true → กล่องนี้คือ Sample #1 ของ Recalc
        // status เปลี่ยนเป็น RECALC_SAMPLE, effectiveStd = น้ำหนักกล่องนี้ (avg ของ 1 กล่อง = ตัวเอง)
        if (ap.isRecalcStdMode()) {
            status = "RECALC_SAMPLE";
            reweighSnapshotStd  = w;    // running avg ของ 1 กล่อง = น้ำหนักกล่องนั้น
            reweighSnapshotStd1 = null;
            reweighSnapshotStd2 = null;
        }

        m.setWeight(w);
        m.setWeight1(req.getWeight1());
        m.setWeight2(req.getWeight2());
        m.setStatus(status);
        m.setEffectiveStd(reweighSnapshotStd);
        m.setEffectiveStd1(reweighSnapshotStd1);
        m.setEffectiveStd2(reweighSnapshotStd2);
        if (req.getTimestamp() != null) {
            m.setTimestamp(req.getTimestamp().atZone(java.time.ZoneId.systemDefault()).toLocalDateTime());
        } else {
            m.setTimestamp(LocalDateTime.now());
        }
        if (req.getOperatorName() != null && !req.getOperatorName().isBlank()) m.setOperatorName(req.getOperatorName());

        // Create change log for audit trail
        ChangeLog log = new ChangeLog();
        log.setProductCode(p.getProductCode());
        log.setChangeType("MEASUREMENT_REWEIGH");
        String desc = "{"
                + "\"lotNo\":\"" + m.getLotNo() + "\"," 
                + "\"outerBox\":\"" + m.getOuterBoxNumber() + "\"," 
                + "\"innerOrder\":\"" + m.getInnerBoxOrder() + "\"," 
                + "\"prevWeight\":" + (prevWeight != null ? prevWeight : 0.0) + ","
                + "\"prevStatus\":\"" + (prevStatus != null ? prevStatus : "") + "\"," 
                + "\"newWeight\":" + w + ","
                + "\"newStatus\":\"" + status + "\"," 
                + "\"usedApprovalId\":" + m.getApprovalId() + "}";
        log.setDescription(desc);
        log.setCreatedBy(req.getOperatorName());
        changeLogRepo.save(log);

        // Consume approval link: next RED requires a new approval
        m.setApprovalId(null);
        Measurement saved = measurementRepo.save(m);

        // Calculate streak for reweigh response (same logic as create method)
        List<Measurement> history = measurementRepo.findTop100ByProduct_ProductCodeAndScale_ScaleIdAndLotNoOrderByTimestampDesc(
                p.getProductCode(), m.getScale().getScaleId(), m.getLotNo());
        int consec = 0;
        LocalDateTime firstYellowTime = null;
        for (Measurement x : history) {
            if (Boolean.TRUE.equals(x.getIsForStandardAdjustment())) break;
            if ("GREEN".equalsIgnoreCase(x.getStatus())) break;
            // RED does NOT reset the streak — only GREEN does
            if ("YELLOW".equalsIgnoreCase(x.getStatus())) {
                consec++;
                if (firstYellowTime == null) firstYellowTime = x.getTimestamp();
            }
        }

        // Check if approval is needed
        boolean requiresApproval = false;
        int remainingYellow = Math.max(0, 5 - consec);
        if (consec >= 5) {
            requiresApproval = true;
        }

        Map<String, Object> initialStatus = getInitialStdStatus(p.getProductCode(), m.getLotNo());
        boolean requiresInitialStdApproval = (boolean) initialStatus.get("requiresApproval");

        Map<String, Object> responseMap = new HashMap<>(Map.of(
            "measurement", saved, "consecutiveYellow", consec, "remainingYellow", remainingYellow,
            "requiresApproval", requiresApproval, "requiresInitialStdApproval", requiresInitialStdApproval
        ));
        responseMap.put("avgWeight1", initialStatus.get("avgWeight1"));
        responseMap.put("avgWeight2", initialStatus.get("avgWeight2"));
        responseMap.put("avgWeight", initialStatus.get("avgWeight"));
        responseMap.put("allWeights",  initialStatus.get("allWeights"));
        responseMap.put("allWeights1", initialStatus.get("allWeights1"));
        responseMap.put("allWeights2", initialStatus.get("allWeights2"));
        responseMap.put("initialStdThreshold", initialStatus.get("threshold"));

        return ResponseEntity.ok(responseMap);
    }

    @Data
    public static class ClassificationRequest {
        private double weight;
        private Params params;
    }

    @Data
    public static class Params {
        private double weightPerPiece;
        private int quantityPerMeasurement;
        private double tolerance;
    }

    @Data
    public static class ClassificationResponse {
        private String status;
    }

    @Data
    public static class CreateMeasurementRequest {
        private String productCode;
        private String scaleId;
        private String lotNo;
        private String outerBox;
        private String innerOrder;
        private double weight;
        private Double weight1;
        private Double weight2;
        private java.time.Instant timestamp; // optional; if null server time
        private String operatorName; // optional
        private Long approvalId; // optional
        private String note; // optional
        private Long workOrderId; // optional — อ้างอิง Work Order
    }

    @Data
    public static class LastResponse {
        private Long id;
        private Long approvalId;
        private String outerBoxNumber;
        private String innerBoxOrder;
        private LocalDateTime timestamp;
        private String status;
        private String nextOuterBoxNumber;
        private String nextInnerBoxOrder;
        private String debugMessage;
        private boolean foundHistory;
        private int consecutiveYellow;
        private int remainingYellow;
        private boolean requiresApproval;  // true if count >= 5 and no barrier after yellow streak
        private boolean requiresInitialStdApproval; // true when box count >= innerBoxQuantity and no initial std applied
        private int initialStdThreshold;            // = product.innerBoxQuantity (จำนวน Inner ต่อ Outer)
        private Long pendingApprovalId;    // ID of pending STD_CHANGE_REQUEST if exists
        private Double avgWeight1;
        private Double avgWeight2;
        private Double avgWeight;
        // Recalc Std mode fields
        private boolean recalcStdMode;     // true = กำลังเก็บตัวอย่าง Std ใหม่ 10 กล่อง
        private int recalcSampleCount;     // จำนวนกล่องที่เก็บแล้ว (0-10)
        private double recalcCurrentAvg;   // ค่าเฉลี่ยวิ่งปัจจุบัน
    }

    /** Recalc state computed from measurement history for a given product/scale/lot */
    private static class RecalcState {
        final boolean active;
        final int sampleCount;
        final double sumWeights;
        final double currentAvg;
        RecalcState(boolean active, int sampleCount, double sumWeights, double currentAvg) {
            this.active = active; this.sampleCount = sampleCount;
            this.sumWeights = sumWeights; this.currentAvg = currentAvg;
        }
    }

    /**
     * ตรวจสอบว่า lot นี้อยู่ใน Recalc Std mode หรือไม่
     * RECALC_START barrier (isForStandardAdjustment=true, status="RECALC_START") = หัวสาย
     * RECALC_SAMPLE measurements (status="RECALC_SAMPLE") หลัง barrier = ตัวอย่างที่เก็บได้
     * ถ้าพบ barrier ประเภทอื่นก่อน = recalc สิ้นสุดแล้ว (QA apply Std ใหม่แล้ว)
     */
    private RecalcState computeRecalcState(List<Measurement> historyDesc) {
        int barrierIdx = -1;
        for (int i = 0; i < historyDesc.size(); i++) {
            Measurement x = historyDesc.get(i);
            if (Boolean.TRUE.equals(x.getIsForStandardAdjustment())) {
                if ("RECALC_START".equals(x.getStatus())) barrierIdx = i;
                break; // หยุดที่ barrier ตัวแรก (ไม่ว่าจะเป็นประเภทใด)
            }
        }
        if (barrierIdx == -1) return new RecalcState(false, 0, 0.0, 0.0);

        double sumWeights = 0.0;
        int count = 0;
        for (int i = 0; i < barrierIdx; i++) {
            Measurement x = historyDesc.get(i);
            if ("RECALC_SAMPLE".equals(x.getStatus()) && x.getWeight() != null) {
                sumWeights += x.getWeight();
                count++;
            }
        }
        double avg = count > 0 ? sumWeights / count : 0.0;
        return new RecalcState(true, count, sumWeights, avg);
    }

    // Leader/Operator: ย้าย/แก้ไข Outer, Inner (และน้ำหนัก) ของ measurement ที่บันทึกแล้ว
    @PutMapping("/{id}/relocate")
    @PreAuthorize("hasAnyRole('OPERATOR','LEADER','ADMIN')")
    public ResponseEntity<?> relocate(@PathVariable Long id, @RequestBody RelocateRequest req) {
        if (req.getNewOuter() == null || req.getNewInner() == null || req.getChangedBy() == null) {
            return ResponseEntity.badRequest().body("newOuter, newInner, changedBy are required");
        }
        Optional<Measurement> opt = measurementRepo.findById(id);
        if (opt.isEmpty()) return ResponseEntity.notFound().build();
        Measurement m = opt.get();
        // ห้ามแก้ไข barrier record (isForStandardAdjustment)
        if (Boolean.TRUE.equals(m.getIsForStandardAdjustment())) {
            return ResponseEntity.badRequest().body("Cannot relocate a barrier record");
        }
        // Capture ค่าเดิมสำหรับ log
        String oldOuter = m.getOuterBoxNumber();
        String oldInner = m.getInnerBoxOrder();
        Double oldWeight = m.getWeight();
        Double oldWeight1 = m.getWeight1();
        Double oldWeight2 = m.getWeight2();
        String oldStatus = m.getStatus();

        // ตรวจสอบ duplicate ก่อนเปลี่ยน Outer/Inner
        String newOuterTrim = req.getNewOuter().trim();
        String newInnerTrim = req.getNewInner().trim();
        boolean positionChanging = !newOuterTrim.equals(oldOuter) || !newInnerTrim.equals(oldInner);
        if (positionChanging) {
            Product p2 = m.getProduct();
            if (p2 == null) p2 = productRepo.findById(m.getProduct().getProductCode()).orElse(null);
            String scaleIdReloc = m.getScale() != null ? m.getScale().getScaleId() : null;
            boolean isDuplicate;
            if (p2 != null && "RESET_PER_OUTER".equalsIgnoreCase(p2.getInnerNumberingMode())) {
                // RESET_PER_OUTER: inner รีเซ็ตทุก outer → ตรวจ target outer + inner
                isDuplicate = scaleIdReloc != null
                    ? measurementRepo.existsByProduct_ProductCodeAndScale_ScaleIdAndLotNoAndOuterBoxNumberAndInnerBoxOrder(
                            p2.getProductCode(), scaleIdReloc, m.getLotNo(), newOuterTrim, newInnerTrim)
                    : measurementRepo.existsByProduct_ProductCodeAndLotNoAndOuterBoxNumberAndInnerBoxOrder(
                            p2.getProductCode(), m.getLotNo(), newOuterTrim, newInnerTrim);
            } else {
                // CONTINUOUS: inner unique ทั้ง lot → ตรวจข้ามทุก outer (เฉพาะเมื่อ inner เปลี่ยน)
                isDuplicate = !newInnerTrim.equals(oldInner)
                    && measurementRepo.existsByProduct_ProductCodeAndLotNoAndInnerBoxOrder(
                            m.getProduct().getProductCode(), m.getLotNo(), newInnerTrim);
            }
            if (isDuplicate) {
                Optional<Measurement> dup = scaleIdReloc != null
                    ? measurementRepo.findByProduct_ProductCodeAndScale_ScaleIdAndLotNoAndOuterBoxNumberAndInnerBoxOrder(
                            m.getProduct().getProductCode(), scaleIdReloc, m.getLotNo(), newOuterTrim, newInnerTrim)
                    : measurementRepo.findByProduct_ProductCodeAndLotNoAndOuterBoxNumberAndInnerBoxOrder(
                            m.getProduct().getProductCode(), m.getLotNo(), newOuterTrim, newInnerTrim);
                if (dup.isPresent() && !dup.get().getMeasurementId().equals(id)) {
                    String dupInfo = String.format(" (ID:%d น้ำหนัก:%.3f สถานะ:%s)",
                            dup.get().getMeasurementId(),
                            dup.get().getWeight() != null ? dup.get().getWeight() : 0.0,
                            dup.get().getStatus() != null ? dup.get().getStatus() : "-");
                    return ResponseEntity.status(409).body(
                            "DUPLICATE_INNER:Outer " + newOuterTrim + " / Inner " + newInnerTrim + " ถูกใช้แล้ว" + dupInfo + " — กรุณาใช้เลขอื่น");
                }
            }
        }

        // อัปเดต Outer/Inner
        m.setOuterBoxNumber(newOuterTrim);
        m.setInnerBoxOrder(newInnerTrim);

        // ถ้าต้องการเปลี่ยนน้ำหนักด้วย: อัปเดตน้ำหนักและคำนวณ status ใหม่
        String newStatus = oldStatus;
        if (Boolean.TRUE.equals(req.getChangeWeightToo())) {
            Product p = m.getProduct();
            if (p == null) return ResponseEntity.badRequest().body("Unknown product");
            if ("DOUBLE".equalsIgnoreCase(p.getWeighingMode())) {
                Double w1 = req.getNewWeight1();
                Double w2 = req.getNewWeight2();
                Double std1 = p.getStandardWeight1() != null ? p.getStandardWeight1() : 0.0;
                Double std2 = p.getStandardWeight2() != null ? p.getStandardWeight2() : 0.0;
                Optional<Measurement> barrier = measurementRepo.findTopByProduct_ProductCodeAndLotNoAndIsForStandardAdjustmentTrueOrderByTimestampDesc(p.getProductCode(), m.getLotNo());
                if (barrier.isPresent()) {
                    if (barrier.get().getWeight1() != null) std1 = barrier.get().getWeight1();
                    if (barrier.get().getWeight2() != null) std2 = barrier.get().getWeight2();
                }
                String st1 = classifySingleWeight(w1, std1, p, p.getTolerance1());
                String st2 = classifySingleWeight(w2, std2, p, p.getTolerance2());
                if ("RED".equals(st1) || "RED".equals(st2)) newStatus = "RED";
                else if ("YELLOW".equals(st1) || "YELLOW".equals(st2)) newStatus = "YELLOW";
                else newStatus = "GREEN";
                m.setWeight((w1 != null ? w1 : 0.0) + (w2 != null ? w2 : 0.0));
                m.setWeight1(w1);
                m.setWeight2(w2);
            } else {
                double w = req.getNewWeight() != null ? req.getNewWeight() : (m.getWeight() != null ? m.getWeight() : 0.0);
                double baseStd = getEffectiveStandard(p, m.getLotNo());
                double wpp3   = p.getWeightPerPiece() != null ? p.getWeightPerPiece() : 0.0;
                double min    = baseStd - wpp3 / 2.0;
                double max    = baseStd + wpp3 / 2.0;
                double dmin   = baseStd - wpp3 / 4.0;
                double dmax   = baseStd + wpp3 / 4.0;
                if (w < min || w > max) newStatus = "RED";
                else if (w < dmin || w > dmax) newStatus = "YELLOW";
                else newStatus = "GREEN";
                m.setWeight(w);
            }
            m.setStatus(newStatus);
        }
        measurementRepo.save(m);

        // บันทึก ChangeLog สำหรับ audit trail
        ChangeLog log = new ChangeLog();
        log.setProductCode(m.getProduct() != null ? m.getProduct().getProductCode() : null);
        log.setChangeType("BOX_RELOCATE");
        String desc;
        try {
            Map<String, Object> descMap = new LinkedHashMap<>();
            descMap.put("lotNo", m.getLotNo());
            descMap.put("scaleId", m.getScale() != null ? m.getScale().getScaleId() : "");
            descMap.put("measurementId", id);
            descMap.put("oldOuter", oldOuter != null ? oldOuter : "");
            descMap.put("oldInner", oldInner != null ? oldInner : "");
            descMap.put("newOuter", req.getNewOuter().trim());
            descMap.put("newInner", req.getNewInner().trim());
            descMap.put("oldWeight", oldWeight);
            descMap.put("oldWeight1", oldWeight1);
            descMap.put("oldWeight2", oldWeight2);
            descMap.put("newWeight", m.getWeight());
            descMap.put("newWeight1", m.getWeight1());
            descMap.put("newWeight2", m.getWeight2());
            descMap.put("oldStatus", oldStatus != null ? oldStatus : "");
            descMap.put("newStatus", newStatus);
            descMap.put("changeWeightToo", Boolean.TRUE.equals(req.getChangeWeightToo()));
            descMap.put("reason", req.getReason() != null ? req.getReason() : "");
            desc = new ObjectMapper().writeValueAsString(descMap);
        } catch (Exception ex) {
            desc = "{\"lotNo\":\"" + m.getLotNo() + "\",\"error\":\"json_serialize_failed\"}";
        }
        log.setDescription(desc);
        log.setLotNo(m.getLotNo());
        log.setCreatedBy(req.getChangedBy());
        changeLogRepo.save(log);
        System.out.println("[relocate] ChangeLog saved ok for id=" + id + " lotNo=" + m.getLotNo());

        return ResponseEntity.ok(Map.of("success", true, "message", "แก้ไขสำเร็จ"));
    }

    @Data
    public static class RelocateRequest {
        private String newOuter;
        private String newInner;
        private Boolean changeWeightToo;
        private Double newWeight;
        private Double newWeight1;
        private Double newWeight2;
        private String changedBy;
        private String reason;
    }

    @Data
    public static class ReweighRequest {
        private String productCode;
        private String scaleId;
        private String lotNo;
        private String outerBox;
        private String innerOrder;
        private double weight;
        private Double weight1;
        private Double weight2;
        private java.time.Instant timestamp; // optional
        private String operatorName; // optional
    }

    /**
     * QA re-weighs a specific measurement during Outer Inspection.
     * - Preserves original timestamp (does NOT change it) → yellow streak unaffected
     * - Recalculates status with current Std
     * - Optionally relocates outer/inner number (sorting)
     * - Records audit trail in ChangeLog with QA username + actual time
     */
    @PutMapping("/{id}/qa-reweigh")
    @PreAuthorize("hasAnyRole('QA','ADMIN')")
    public ResponseEntity<?> qaReweigh(@PathVariable Long id, @RequestBody QaReweighRequest req) {
        if (req.getQaUsername() == null || req.getQaUsername().isBlank()) {
            return ResponseEntity.badRequest().body("qaUsername is required");
        }
        Optional<Measurement> opt = measurementRepo.findById(id);
        if (opt.isEmpty()) return ResponseEntity.notFound().build();
        Measurement m = opt.get();
        if (Boolean.TRUE.equals(m.getIsForStandardAdjustment())) {
            return ResponseEntity.badRequest().body("Cannot modify a barrier record");
        }

        Product p = m.getProduct();
        if (p == null) p = productRepo.findById(m.getProduct().getProductCode()).orElse(null);
        if (p == null) return ResponseEntity.badRequest().body("Unknown product");

        // Snapshot ค่าเดิมสำหรับ audit log
        String oldOuter   = m.getOuterBoxNumber();
        String oldInner   = m.getInnerBoxOrder();
        Double oldWeight  = m.getWeight();
        Double oldWeight1 = m.getWeight1();
        Double oldWeight2 = m.getWeight2();
        String oldStatus  = m.getStatus();
        // timestamp เดิมจะไม่ถูกแตะ → yellow streak ไม่เพี้ยน

        // คำนวณ status ใหม่
        String newStatus;
        double newW;
        Double qaSnapshotStd = null, qaSnapshotStd1 = null, qaSnapshotStd2 = null;
        if ("DOUBLE".equalsIgnoreCase(p.getWeighingMode())) {
            Double w1 = req.getWeight1();
            Double w2 = req.getWeight2();
            Double std1 = p.getStandardWeight1() != null ? p.getStandardWeight1() : 0.0;
            Double std2 = p.getStandardWeight2() != null ? p.getStandardWeight2() : 0.0;
            Optional<Measurement> barrier = measurementRepo
                    .findTopByProduct_ProductCodeAndLotNoAndIsForStandardAdjustmentTrueOrderByTimestampDesc(
                            p.getProductCode(), m.getLotNo());
            if (barrier.isPresent()) {
                if (barrier.get().getWeight1() != null) std1 = barrier.get().getWeight1();
                if (barrier.get().getWeight2() != null) std2 = barrier.get().getWeight2();
            }
            qaSnapshotStd1 = std1;
            qaSnapshotStd2 = std2;
            String st1 = classifySingleWeight(w1, std1, p, p.getTolerance1());
            String st2 = classifySingleWeight(w2, std2, p, p.getTolerance2());
            if ("RED".equals(st1) || "RED".equals(st2)) newStatus = "RED";
            else if ("YELLOW".equals(st1) || "YELLOW".equals(st2)) newStatus = "YELLOW";
            else newStatus = "GREEN";
            newW = (w1 != null ? w1 : 0.0) + (w2 != null ? w2 : 0.0);
            m.setWeight1(w1);
            m.setWeight2(w2);
        } else {
            newW = req.getWeight() != null ? req.getWeight() : (m.getWeight() != null ? m.getWeight() : 0.0);
            double baseStd = getEffectiveStandard(p, m.getLotNo());
            double wpp4   = p.getWeightPerPiece() != null ? p.getWeightPerPiece() : 0.0;
            if (newW < baseStd - wpp4 / 2.0 || newW > baseStd + wpp4 / 2.0) newStatus = "RED";
            else if (newW < baseStd - wpp4 / 4.0 || newW > baseStd + wpp4 / 4.0) newStatus = "YELLOW";
            else newStatus = "GREEN";
            qaSnapshotStd = baseStd;
        }
        m.setWeight(newW);
        m.setStatus(newStatus);
        m.setEffectiveStd(qaSnapshotStd);
        m.setEffectiveStd1(qaSnapshotStd1);
        m.setEffectiveStd2(qaSnapshotStd2);

        // เปลี่ยน Inner เท่านั้น (ห้ามเปลี่ยน Outer)
        boolean relocated = false;
        if (req.getNewInner() != null && !req.getNewInner().trim().equals(oldInner)) {
            String targetInner = req.getNewInner().trim();
            String scaleId = m.getScale() != null ? m.getScale().getScaleId() : null;

            // ตรวจสอบว่า Inner ซ้ำหรือไม่ตามโหมด innerNumberingMode
            boolean isDuplicate;
            if ("RESET_PER_OUTER".equalsIgnoreCase(p.getInnerNumberingMode())) {
                // RESET_PER_OUTER: inner รีเซ็ตทุก outer → ตรวจเฉพาะภายใน outer เดียวกัน
                isDuplicate = scaleId != null
                    ? measurementRepo.existsByProduct_ProductCodeAndScale_ScaleIdAndLotNoAndOuterBoxNumberAndInnerBoxOrder(
                            p.getProductCode(), scaleId, m.getLotNo(), oldOuter, targetInner)
                    : measurementRepo.existsByProduct_ProductCodeAndLotNoAndOuterBoxNumberAndInnerBoxOrder(
                            p.getProductCode(), m.getLotNo(), oldOuter, targetInner);
            } else {
                // CONTINUOUS: inner unique ทั้ง lot → ตรวจข้ามทุก outer
                isDuplicate = measurementRepo.existsByProduct_ProductCodeAndLotNoAndInnerBoxOrder(
                        p.getProductCode(), m.getLotNo(), targetInner);
            }

            if (isDuplicate) {
                // ดึง measurement ที่ใช้เลขนั้นอยู่เพื่อให้ข้อมูลสำหรับแจ้ง OP
                String dupInfo = "";
                try {
                    Optional<Measurement> dup = scaleId != null
                        ? measurementRepo.findByProduct_ProductCodeAndScale_ScaleIdAndLotNoAndOuterBoxNumberAndInnerBoxOrder(
                                p.getProductCode(), scaleId, m.getLotNo(), oldOuter, targetInner)
                        : measurementRepo.findByProduct_ProductCodeAndLotNoAndOuterBoxNumberAndInnerBoxOrder(
                                p.getProductCode(), m.getLotNo(), oldOuter, targetInner);
                    if (dup.isPresent()) {
                        dupInfo = String.format(" (ID:%d น้ำหนัก:%.3f สถานะ:%s)",
                                dup.get().getMeasurementId(),
                                dup.get().getWeight() != null ? dup.get().getWeight() : 0.0,
                                dup.get().getStatus() != null ? dup.get().getStatus() : "-");
                    }
                } catch (Exception ignored) {}
                return ResponseEntity.status(409).body(
                    "DUPLICATE_INNER:Inner " + targetInner + " ถูกใช้แล้ว" + dupInfo + " — กรุณาใช้เลขอื่น หรือแจ้ง Operator ให้ข้ามเลขนี้ไป");
            }

            m.setInnerBoxOrder(targetInner);
            relocated = true;
        }

        measurementRepo.save(m);
        System.out.println("[qaReweigh] measurement saved id=" + id + " newStatus=" + newStatus);

        // บันทึก audit trail — ใช้ createdAt = now (เวลา QA แก้จริง), timestamp ของ measurement คงเดิม
        try {
            ChangeLog log = new ChangeLog();
            log.setProductCode(p.getProductCode());
            log.setChangeType("QA_OUTER_REWEIGH");
            String reasonSafe = req.getReason() != null ? req.getReason().replace("\"", "'") : "";
            String desc = "{"
                    + "\"lotNo\":\"" + m.getLotNo() + "\","
                    + "\"approvalId\":" + (req.getApprovalId() != null ? req.getApprovalId() : "null") + ","
                    + "\"measurementId\":" + id + ","
                    + "\"oldOuter\":\"" + (oldOuter != null ? oldOuter : "") + "\","
                    + "\"oldInner\":\"" + (oldInner != null ? oldInner : "") + "\","
                    + "\"newOuter\":\"" + m.getOuterBoxNumber() + "\","
                    + "\"newInner\":\"" + m.getInnerBoxOrder() + "\","
                    + "\"oldWeight\":" + (oldWeight != null ? oldWeight : "null") + ","
                    + "\"oldWeight1\":" + (oldWeight1 != null ? oldWeight1 : "null") + ","
                    + "\"oldWeight2\":" + (oldWeight2 != null ? oldWeight2 : "null") + ","
                    + "\"newWeight\":" + newW + ","
                    + "\"newWeight1\":" + (m.getWeight1() != null ? m.getWeight1() : "null") + ","
                    + "\"newWeight2\":" + (m.getWeight2() != null ? m.getWeight2() : "null") + ","
                    + "\"oldStatus\":\"" + (oldStatus != null ? oldStatus : "") + "\","
                    + "\"newStatus\":\"" + newStatus + "\","
                    + "\"relocated\":" + relocated + ","
                    + "\"originalTimestamp\":\"" + m.getTimestamp() + "\","
                    + "\"reason\":\"" + reasonSafe + "\""
                    + "}";
            log.setDescription(desc);
            log.setLotNo(m.getLotNo());
            log.setCreatedBy(req.getQaUsername());
            changeLogRepo.save(log);
            System.out.println("[qaReweigh] ChangeLog saved ok");
        } catch (Exception ex) {
            // Audit log failure must not roll back the measurement save
            System.err.println("[qaReweigh] WARNING: ChangeLog save failed (measurement already saved): " + ex.getMessage());
        }

        Map<String, Object> resp = new HashMap<>();
        resp.put("success", true);
        resp.put("measurementId", id);
        resp.put("newStatus", newStatus);
        resp.put("relocated", relocated);
        resp.put("message", "QA re-weigh สำเร็จ (timestamp เดิมคงเดิม)");
        return ResponseEntity.ok(resp);
    }

    @Data
    public static class QaReweighRequest {
        private Double weight;       // น้ำหนักใหม่ (SINGLE mode)
        private Double weight1;      // น้ำหนักใหม่ชั่งที่ 1 (DOUBLE mode)
        private Double weight2;      // น้ำหนักใหม่ชั่งที่ 2 (DOUBLE mode)
        private String newInner;     // optional: เปลี่ยน Inner เท่านั้น (ห้ามเปลี่ยน Outer)
        private String qaUsername;   // required: QA ที่ทำการแก้ไข
        private String reason;       // optional: เหตุผล
        private Long approvalId;     // optional: อ้างอิง outer inspection approval
    }
}
