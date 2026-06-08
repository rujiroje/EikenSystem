package com.example.eikensystem.web;

import com.example.eikensystem.domain.Measurement;
import com.example.eikensystem.domain.Product;
import com.example.eikensystem.repo.ApprovalRepo;
import com.example.eikensystem.repo.ChangeLogRepo;
import com.example.eikensystem.repo.MeasurementRepo;
import com.example.eikensystem.repo.ProductRepo;
import com.example.eikensystem.repo.ScaleRepo;
import com.example.eikensystem.repo.WorkOrderRepo;
import com.example.eikensystem.domain.WorkOrder;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.*;
import java.time.LocalDateTime;
import java.time.ZoneId;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.core.type.TypeReference;

@RestController
@RequestMapping("/api/reports")
@RequiredArgsConstructor
public class ReportController {
    private final MeasurementRepo measurementRepo;
    private final ProductRepo productRepo;
    private final ApprovalRepo approvalRepo;
    private final ChangeLogRepo changeLogRepo;
    private final com.example.eikensystem.repo.StandardWeightLogRepo stdLogRepo;
    private final ScaleRepo scaleRepo;
    private final WorkOrderRepo workOrderRepo;
    private final com.example.eikensystem.repo.MachineRepo machineRepo;

    @GetMapping("/lot-summary")
    public List<Map<String,Object>> lotSummary(@RequestParam String productCode, @RequestParam String scaleId) {
        if (productCode == null || productCode.isBlank() || scaleId == null || scaleId.isBlank()) return List.of();
        List<Measurement> list = measurementRepo.findByProduct_ProductCodeAndScale_ScaleIdOrderByTimestampDesc(productCode, scaleId);
        Map<String, Map<String,Object>> byLot = new LinkedHashMap<>();
        for (Measurement m : list) {
            String lot = m.getLotNo();
            if (lot == null) continue;
            Map<String,Object> cur = byLot.get(lot);
            String ts = m.getTimestamp() != null ? m.getTimestamp().toString() : null;
            if (cur == null) {
                cur = new HashMap<>();
                cur.put("lotNo", lot);
                cur.put("start", ts);
                cur.put("end", ts);
                byLot.put(lot, cur);
            } else {
                String s = cur.get("start") == null ? null : String.valueOf(cur.get("start"));
                String e = cur.get("end") == null ? null : String.valueOf(cur.get("end"));
                if (ts != null) {
                    if (s == null || ts.compareTo(s) < 0) cur.put("start", ts);
                    if (e == null || ts.compareTo(e) > 0) cur.put("end", ts);
                }
            }
        }
        return new ArrayList<>(byLot.values());
    }

    @GetMapping("/lot-details")
    public Map<String,Object> lotDetails(@RequestParam String productCode, @RequestParam String scaleId, @RequestParam String lotNo) {
        if (productCode == null || scaleId == null || lotNo == null) return Map.of();
        String cleanProduct = productCode.trim();
        String cleanLot = lotNo.trim();
        List<Measurement> list = measurementRepo.findByProduct_ProductCodeAndScale_ScaleIdAndLotNoOrderByTimestampDesc(cleanProduct, scaleId, cleanLot);
        
        // Fetch barriers for this lot to determine historical std (Consistent with MeasurementController)
        List<Measurement> barriers = measurementRepo.findByProduct_ProductCodeAndLotNoAndIsForStandardAdjustmentTrueOrderByTimestampAsc(cleanProduct, cleanLot);
        Product currentProduct = productRepo.findById(cleanProduct).orElse(null);
        Double currentStd = (currentProduct != null && currentProduct.getStandardWeight() != null && currentProduct.getStandardWeight() > 0) 
                ? currentProduct.getStandardWeight() 
                : (currentProduct != null ? currentProduct.getWeightPerPiece() * (currentProduct.getQuantityPerMeasurement() != null ? currentProduct.getQuantityPerMeasurement() : 0) : 0.0);

        List<Map<String,Object>> items = new ArrayList<>();
        for (Measurement m : list) {
            // Filter out barrier records (Outer 000 / Inner RST1 / IsForStandardAdjustment)
            if (Boolean.TRUE.equals(m.getIsForStandardAdjustment()) || "000".equals(m.getOuterBoxNumber()) || "RST1".equals(m.getInnerBoxOrder())) {
                continue;
            }

            Map<String,Object> it = new HashMap<>();
            it.put("measurementId", m.getMeasurementId());
            it.put("lotNo", m.getLotNo());
            it.put("innerOrder", m.getInnerBoxOrder());
            it.put("outerBox", m.getOuterBoxNumber());
            it.put("weight", m.getWeight());
            it.put("status", m.getStatus());
            it.put("operator", m.getOperatorName());
            it.put("timestamp", m.getTimestamp() != null ? m.getTimestamp().toString() : null);
            it.put("note", m.getNote());
            it.put("isForStandardAdjustment", m.getIsForStandardAdjustment());
            it.put("approvalId", m.getApprovalId());
            
            // Determine Std used at the time of measurement
            Double historicalStd = currentStd;
            if (m.getTimestamp() != null) {
                // Find the latest barrier that happened BEFORE or AT the measurement time
                for (Measurement b : barriers) {
                    if (b.getTimestamp() == null) continue;
                    if (!b.getTimestamp().isAfter(m.getTimestamp())) {
                        historicalStd = b.getWeight();
                    }
                }
            }
            it.put("std", historicalStd);

            if (m.getApprovalId() != null) {
                approvalRepo.findById(m.getApprovalId()).ifPresent(ap -> {
                    it.put("approvalType", ap.getType());
                    it.put("approvalReason", ap.getNote());
                    it.put("approvalBy", ap.getActionBy() != null ? ap.getActionBy() : ap.getRequestedBy());
                    it.put("approvalAt", ap.getActionAt() != null ? ap.getActionAt().toString() : null);
                });
            }
            items.add(it);
        }

        items.sort((a,b) -> {
            String ia = a.get("innerOrder") == null ? "" : String.valueOf(a.get("innerOrder"));
            String ib = b.get("innerOrder") == null ? "" : String.valueOf(b.get("innerOrder"));
            try {
                int na = Integer.parseInt(ia.replaceAll("[^0-9]",""));
                int nb = Integer.parseInt(ib.replaceAll("[^0-9]",""));
                return Integer.compare(na, nb);
            } catch (Exception e) { return ia.compareTo(ib); }
        });

        Set<String> inners = new LinkedHashSet<>();
        int red=0,yellow=0,green=0;
        for (Map<String,Object> it : items) {
            String inner = it.get("innerOrder") == null ? null : String.valueOf(it.get("innerOrder"));
            if (inner == null) continue;
            if (!inners.contains(inner)) {
                inners.add(inner);
                String st = it.get("status") == null ? null : String.valueOf(it.get("status"));
                if ("RED".equalsIgnoreCase(st)) red++;
                else if ("YELLOW".equalsIgnoreCase(st)) yellow++;
                else green++;
            }
        }
        Map<String,Object> summary = new HashMap<>();
        summary.put("lotNo", lotNo);
        summary.put("total", inners.size());
        summary.put("red", red);
        summary.put("yellow", yellow);
        summary.put("green", green);
        return Map.of("summary", summary, "items", items);
    }

    @GetMapping("/lot-events")
    public Map<String,Object> lotEvents(@RequestParam String productCode, @RequestParam String scaleId, @RequestParam String lotNo) {
        List<Measurement> list = measurementRepo.findTop100ByProduct_ProductCodeAndScale_ScaleIdAndLotNoOrderByTimestampDesc(productCode, scaleId, lotNo);
        List<Map<String,Object>> redEvents = new ArrayList<>();
        List<Map<String,Object>> yellowEvents = new ArrayList<>();
        for (Measurement m : list) {
            Map<String,Object> ev = new HashMap<>();
            ev.put("time", m.getTimestamp() != null ? m.getTimestamp().toString() : null);
            ev.put("outer", m.getOuterBoxNumber());
            ev.put("inner", m.getInnerBoxOrder());
            ev.put("weight", m.getWeight());
            ev.put("operator", m.getOperatorName());
            if ("RED".equalsIgnoreCase(m.getStatus())) redEvents.add(ev);
            else if ("YELLOW".equalsIgnoreCase(m.getStatus())) yellowEvents.add(ev);
        }

        List<Map<String,Object>> stdChanges = new ArrayList<>();
        List<Map<String,Object>> redUnlocks = new ArrayList<>();
        ObjectMapper om = new ObjectMapper();
        java.util.regex.Pattern numPattern = java.util.regex.Pattern.compile("(-?\\d+(?:\\.\\d+)?)");

        // Fetch only approvals whose payloadJson contains this lotNo — avoids full-table scan
        String p1 = "%\"lotNo\":\"" + lotNo + "\"%";
        String p2 = "%\"lotNo\": \"" + lotNo + "\"%";
        List<com.example.eikensystem.domain.Approval> relevantApprovals = approvalRepo.findByLotNoInPayload(p1, p2);

        // Fetch only stdLogs for those approvalIds — avoids full-table scan
        List<Long> approvalIds = relevantApprovals.stream()
            .map(com.example.eikensystem.domain.Approval::getId).toList();
        List<com.example.eikensystem.domain.StandardWeightLog> filteredStdLogs =
            approvalIds.isEmpty() ? List.of() : stdLogRepo.findByApprovalIdIn(approvalIds);
        Map<Long, List<com.example.eikensystem.domain.StandardWeightLog>> logsByApproval = filteredStdLogs.stream()
            .filter(l -> l.getApprovalId() != null)
            .collect(java.util.stream.Collectors.groupingBy(com.example.eikensystem.domain.StandardWeightLog::getApprovalId));

        for (com.example.eikensystem.domain.Approval ap : relevantApprovals) {
            if (ap.getPayloadJson() == null) continue;
            String payload = ap.getPayloadJson();
            try {
                Map<String,Object> map = om.readValue(payload, new TypeReference<Map<String,Object>>(){});
                Object ln = map.get("lotNo");
                Object pc = map.get("productCode");
                
                // Check if this approval belongs to the requested Lot
                if (ln == null || !String.valueOf(ln).equals(lotNo)) continue;
                if (pc != null && !String.valueOf(pc).equals(productCode)) continue;

                // --- Handle RED_EVENT (Leader Unlock) ---
                if ("RED_EVENT".equals(ap.getType())) {
                    Map<String,Object> ru = new HashMap<>();
                    ru.put("time", ap.getActionAt() != null ? ap.getActionAt().toString() : ap.getRequestedAt().toString());
                    ru.put("approvalId", ap.getId());
                    ru.put("outer", map.get("outerBox"));
                    ru.put("inner", map.get("innerOrder"));
                    ru.put("prevWeight", map.get("weight"));
                    ru.put("leader", ap.getActionBy());
                    ru.put("reason", ap.getNote());
                    
                    // Find reweigh info from ChangeLog
                    String appSearch = "\"usedApprovalId\":" + ap.getId();
                    for (com.example.eikensystem.domain.ChangeLog cl : changeLogRepo.findByDescriptionContaining(appSearch)) {
                        try {
                            Map<String,Object> cm = om.readValue(cl.getDescription(), new TypeReference<Map<String,Object>>(){});
                            Map<String,Object> rw = new HashMap<>();
                            rw.put("at", cl.getCreatedAt() != null ? cl.getCreatedAt().toString() : null);
                            rw.put("newWeight", cm.get("newWeight"));
                            rw.put("newStatus", cm.get("newStatus"));
                            ru.put("reweigh", rw);
                            break; // Found the reweigh log
                        } catch (Exception ignored) {}
                    }
                    redUnlocks.add(ru);
                }
                // --- Handle STD_CHANGE_REQUEST (QA) ---
                else if ("STD_CHANGE_REQUEST".equals(ap.getType())) {
                    // Extract location info
                    Object payloadOuter = map.get("outerBox");
                    if (payloadOuter == null) payloadOuter = map.get("outer");
                    Object payloadInner = map.get("innerOrder");
                    if (payloadInner == null) payloadInner = map.get("inner");

                    // Initialize working variables
                    Object finalOuter = payloadOuter;
                    Object finalInner = payloadInner;

                    // Fallback: try to get from Measurement via targetId
                    if ((finalOuter == null || finalInner == null) && ap.getTargetId() != null) {
                        try {
                            Long mid = Long.parseLong(ap.getTargetId());
                            Measurement m = measurementRepo.findById(mid).orElse(null);
                            if (m != null) {
                                if (finalOuter == null) finalOuter = m.getOuterBoxNumber();
                                if (finalInner == null) finalInner = m.getInnerBoxOrder();
                            }
                        } catch (NumberFormatException ignored) {}
                    }

                    // Fallback: try to find from Measurement in this lot that refers to this approval
                    if (finalOuter == null || finalInner == null) {
                        // Use repo to find by approval ID directly (bypassing top 100 limit)
                        List<Measurement> linkedMs = measurementRepo.findByApprovalId(ap.getId());
                        if (!linkedMs.isEmpty()) {
                            Measurement m = linkedMs.get(0);
                            if (finalOuter == null) finalOuter = m.getOuterBoxNumber();
                            if (finalInner == null) finalInner = m.getInnerBoxOrder();
                        }
                    }

                    // Fallback: Find ACTUAL measurement after approval (Traceability) - No guessing
                    if (finalOuter == null || finalInner == null) {
                        try {
                            // Determine cutoff time (ActionAt or RequestedAt)
                            java.time.Instant cutoffInst = ap.getActionAt() != null ? ap.getActionAt() : ap.getRequestedAt();
                            if (cutoffInst != null) {
                                LocalDateTime cutoff = LocalDateTime.ofInstant(cutoffInst, ZoneId.systemDefault());
                                
                                Object scObj = map.get("scaleId");
                                String lookupScaleId = (scObj != null) ? String.valueOf(scObj).trim() : scaleId;
                                String targetProduct = (pc != null) ? String.valueOf(pc).trim() : productCode;
                                String targetLot = (ln != null) ? String.valueOf(ln).trim() : lotNo;

                                // Query DB for the exact measurement that followed this approval
                                List<Measurement> nextMs = measurementRepo.findTop10ByProduct_ProductCodeAndScale_ScaleIdAndLotNoAndTimestampAfterOrderByTimestampAsc(
                                    targetProduct, lookupScaleId, targetLot, cutoff
                                );

                                for (Measurement m : nextMs) {
                                    // Skip barriers/resets to find the first real box
                                    if (!"000".equals(m.getOuterBoxNumber()) && !"RST1".equals(m.getInnerBoxOrder())) {
                                        finalOuter = m.getOuterBoxNumber();
                                        finalInner = m.getInnerBoxOrder();
                                        break;
                                    }
                                }
                            }
                        } catch (Exception e) { }
                    }


                    // prefer explicit StandardWeightLog entries
                    List<com.example.eikensystem.domain.StandardWeightLog> rawLinked = logsByApproval.getOrDefault(ap.getId(), new ArrayList<>());
                    // Filter out no-op changes (where old == new) which are likely duplicates from double-clicks
                    List<com.example.eikensystem.domain.StandardWeightLog> linked = rawLinked.stream().filter(l -> {
                        if (l.getOldStd() == null || l.getNewStd() == null) return true;
                        return Math.abs(l.getOldStd() - l.getNewStd()) > 0.000001;
                    }).toList();

                    if (!rawLinked.isEmpty()) {
                        // If logs exist (even if filtered out), use them (or nothing if all filtered)
                        for (com.example.eikensystem.domain.StandardWeightLog log : linked) {
                            Map<String,Object> sc = new HashMap<>();
                            sc.put("time", log.getApprovedAt() != null ? log.getApprovedAt().toString() : null);
                            sc.put("approvedBy", log.getApprovedBy());
                            sc.put("oldStd", log.getOldStd());
                            sc.put("newStd", log.getNewStd());
                            sc.put("reason", log.getReason());
                            sc.put("sampleWeights", log.getSampleWeightsJson());
                            sc.put("known", (log.getOldStd()!=null && log.getNewStd()!=null));

                            // Use payload location (which is updated in ApprovalController to be the actual location)
                            sc.put("locationOuter", finalOuter);
                            sc.put("locationInner", finalInner);
                            
                            // compose message
                            try {
                                String ob = log.getOldStd() == null ? "-" : String.format("%.3f", log.getOldStd());
                                String nb = log.getNewStd() == null ? "-" : String.format("%.3f", log.getNewStd());
                                String ab = log.getApprovedBy() != null ? log.getApprovedBy() : (ap.getActionBy()!=null?ap.getActionBy():"qa");
                                String rr = log.getReason() != null ? log.getReason() : (ap.getNote()!=null?ap.getNote():"");
                                sc.put("message", "QA STD APPROVED " + ob + " → " + nb + " by " + ab + (rr.isBlank()?"":" "+rr));
                            } catch (Exception ignored) { sc.put("message", null); }
                            stdChanges.add(sc);
                        }
                    } else {
                        // fallback parse
                        Double oldStd=null, newStd=null;
                        try { if (map.containsKey("oldStd")) oldStd = map.get("oldStd") instanceof Number ? ((Number)map.get("oldStd")).doubleValue() : Double.parseDouble(String.valueOf(map.get("oldStd"))); } catch (Exception ignored) {}
                        try { if (map.containsKey("newStd")) newStd = map.get("newStd") instanceof Number ? ((Number)map.get("newStd")).doubleValue() : Double.parseDouble(String.valueOf(map.get("newStd"))); } catch (Exception ignored) {}
                        if (newStd==null) { try { if (map.containsKey("proposedStd")) newStd = Double.parseDouble(String.valueOf(map.get("proposedStd"))); } catch (Exception ignored) {} }
                        if (oldStd==null || newStd==null) {
                            String combined = (ap.getNote()!=null?ap.getNote():"") + " " + payload;
                            java.util.regex.Matcher m = numPattern.matcher(combined);
                            List<Double> nums = new ArrayList<>();
                            while (m.find()) { try { nums.add(Double.parseDouble(m.group(1))); } catch (Exception ignored) {} }
                            if (nums.size()>=2) { if (oldStd==null) oldStd = nums.get(0); if (newStd==null) newStd = nums.get(1); }
                        }
                        Map<String,Object> sc = new HashMap<>();
                        sc.put("time", ap.getActionAt() != null ? ap.getActionAt().toString() : null);
                        sc.put("approvedBy", ap.getActionBy()!=null?ap.getActionBy():ap.getRequestedBy());
                        sc.put("oldStd", oldStd);
                        sc.put("newStd", newStd);
                        sc.put("reason", ap.getNote());
                        sc.put("sampleWeights", null);
                        sc.put("known", (oldStd!=null && newStd!=null));
                        sc.put("locationOuter", finalOuter);
                        sc.put("locationInner", finalInner);
                        try {
                            String ob = oldStd==null?"-":String.format("%.3f", oldStd);
                            String nb = newStd==null?"-":String.format("%.3f", newStd);
                            String ab = sc.get("approvedBy")!=null?String.valueOf(sc.get("approvedBy")):"qa";
                            String rr = ap.getNote()!=null?ap.getNote():"";
                            sc.put("message", "QA STD APPROVED " + ob + " → " + nb + " by " + ab + (rr.isBlank()?"":" "+rr));
                        } catch (Exception ignored) { sc.put("message", null); }
                        stdChanges.add(sc);
                    }
                }
            } catch (Exception ignored) {}
        }

        // Sort lists by time to ensure correct chronological order in reports
        redUnlocks.sort(Comparator.comparing(m -> (String) m.getOrDefault("time", ""), Comparator.nullsLast(Comparator.naturalOrder())));
        stdChanges.sort(Comparator.comparing(m -> (String) m.getOrDefault("time", ""), Comparator.nullsLast(Comparator.naturalOrder())));

        return Map.of(
                "events", List.of(),
                "redUnlocks", redUnlocks,
                "stdChanges", stdChanges,
                "yellowEvents", yellowEvents
        );
    }

    // ─── Cross-WO Performance Summary ─────────────────────────────────────────
    @GetMapping("/wo-performance")
    @org.springframework.security.access.prepost.PreAuthorize("hasAnyRole('LEADER','QA','ADMIN')")
    public List<Map<String,Object>> woPerformance(
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to) {

        List<WorkOrder> wos;
        try {
            if (from != null && !from.isBlank() && to != null && !to.isBlank()) {
                java.time.LocalDateTime fromDt = java.time.LocalDate.parse(from).atStartOfDay();
                java.time.LocalDateTime toDt   = java.time.LocalDate.parse(to).atTime(23, 59, 59);
                wos = workOrderRepo.findByCreatedAtBetweenOrderByCreatedAtDesc(fromDt, toDt);
            } else {
                wos = workOrderRepo.findAllByOrderByCreatedAtDesc();
            }
        } catch (Exception e) {
            wos = workOrderRepo.findAllByOrderByCreatedAtDesc();
        }

        List<Map<String,Object>> result = new ArrayList<>();
        for (WorkOrder wo : wos) {
            Map<String,Object> row = new HashMap<>();
            row.put("workOrderId", wo.getWorkOrderId());
            row.put("productCode",  wo.getProduct() != null ? wo.getProduct().getProductCode()  : null);
            row.put("productName",  wo.getProduct() != null ? wo.getProduct().getProductName()  : null);
            row.put("scaleId",      wo.getScale()   != null ? wo.getScale().getScaleId()         : null);
            row.put("scaleName",    wo.getScale()   != null ? wo.getScale().getScaleName()       : null);
            row.put("lotNo",        wo.getLotNo());
            row.put("line",         wo.getLine());
            row.put("woStatus",     wo.getStatus());
            row.put("startDate",    wo.getStartDate()  != null ? wo.getStartDate().toString()  : null);
            row.put("createdAt",    wo.getCreatedAt()  != null ? wo.getCreatedAt().toString()  : null);
            row.put("createdBy",    wo.getCreatedBy());
            row.put("closedAt",     wo.getClosedAt()   != null ? wo.getClosedAt().toString()   : null);
            row.put("closedBy",     wo.getClosedBy());

            long green = 0, yellow = 0, red = 0;
            if (wo.getProduct() != null && wo.getScale() != null) {
                List<Object[]> counts = measurementRepo.countStatusByWo(
                    wo.getProduct().getProductCode(), wo.getScale().getScaleId(), wo.getLotNo());
                for (Object[] c : counts) {
                    String status = (String) c[0];
                    long cnt = ((Number) c[1]).longValue();
                    if ("GREEN".equals(status))  green  = cnt;
                    else if ("YELLOW".equals(status)) yellow = cnt;
                    else if ("RED".equals(status))    red    = cnt;
                }
            }
            long total = green + yellow + red;
            row.put("green",    green);
            row.put("yellow",   yellow);
            row.put("red",      red);
            row.put("total",    total);
            row.put("passRate", total > 0 ? Math.round((double) green / total * 1000.0) / 10.0 : 0.0);
            result.add(row);
        }
        return result;
    }

    @GetMapping("/std-switch-check")
    public Map<String,Object> stdSwitchCheck(@RequestParam String productCode, @RequestParam String scaleId, @RequestParam String lotNo) {
        return Map.of();
    }

    @GetMapping("/scale-status")
    @org.springframework.security.access.prepost.PreAuthorize("hasAnyRole('QA', 'LEADER', 'ADMIN')")
    public List<Map<String, Object>> getScaleStatus() {
        List<com.example.eikensystem.domain.Scale> scales = scaleRepo.findAll();

        // Group all PENDING approvals by scaleId (parsed from payloadJson) — done once for all scales
        List<com.example.eikensystem.domain.Approval> pendingApprovals = approvalRepo.findByStatus("PENDING");
        ObjectMapper om2 = new ObjectMapper();
        // scaleId → list of pending approvals for that scale
        Map<String, List<com.example.eikensystem.domain.Approval>> pendingByScale = new HashMap<>();
        for (com.example.eikensystem.domain.Approval ap : pendingApprovals) {
            if (ap.getPayloadJson() == null) continue;
            try {
                Map<String, Object> pmap = om2.readValue(ap.getPayloadJson(),
                        new TypeReference<Map<String, Object>>() {});
                Object sid = pmap.get("scaleId");
                if (sid != null) {
                    String sid2 = String.valueOf(sid).trim();
                    pendingByScale.computeIfAbsent(sid2, k -> new ArrayList<>()).add(ap);
                }
            } catch (Exception ignored) {}
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (com.example.eikensystem.domain.Scale s : scales) {
            Map<String, Object> map = new HashMap<>();
            map.put("scaleId", s.getScaleId());
            map.put("scaleName", s.getScaleName());

            // Fetch recent measurements (100 is enough for streak + status)
            List<Measurement> latest = measurementRepo.findTop100ByScale_ScaleIdOrderByTimestampDesc(s.getScaleId());
            // Skip barrier/reset records for display
            List<Measurement> real = latest.stream()
                    .filter(m -> !Boolean.TRUE.equals(m.getIsForStandardAdjustment()))
                    .toList();

            boolean active = !real.isEmpty();
            map.put("active", active);

            // Pending approval counts for this scale
            List<com.example.eikensystem.domain.Approval> scaleApprovals =
                    pendingByScale.getOrDefault(s.getScaleId(), List.of());
            int pendingRed       = (int) scaleApprovals.stream().filter(a -> "RED_EVENT".equals(a.getType())).count();
            int pendingCleaning  = (int) scaleApprovals.stream().filter(a -> "CLEANING_CHECK".equals(a.getType())).count();
            int pendingOuter     = (int) scaleApprovals.stream().filter(a -> "OUTER_INSPECTION".equals(a.getType())).count();
            // STD split by stage: LEADER_PENDING = waiting for Leader to approve; READY_FOR_APPLY = waiting for QA to apply
            int pendingStdLeader = (int) scaleApprovals.stream().filter(a -> "STD_CHANGE_REQUEST".equals(a.getType()) && "LEADER_PENDING".equals(a.getStage())).count();
            int pendingStd       = (int) scaleApprovals.stream().filter(a -> "STD_CHANGE_REQUEST".equals(a.getType()) && "READY_FOR_APPLY".equals(a.getStage())).count();
            map.put("pendingRed",       pendingRed);
            map.put("pendingCleaning",  pendingCleaning);
            map.put("pendingOuter",     pendingOuter);
            map.put("pendingStdLeader", pendingStdLeader);
            map.put("pendingStd",       pendingStd);

            if (active) {
                Measurement m = real.get(0); // most recent real measurement
                String lotNo = m.getLotNo();
                map.put("lastProductCode", m.getProduct() != null ? m.getProduct().getProductCode() : null);
                map.put("lastLotNo", lotNo);
                map.put("lastOuterBox", m.getOuterBoxNumber());
                map.put("lastInnerOrder", m.getInnerBoxOrder());
                map.put("lastStatus", m.getStatus());
                map.put("lastTimestamp", m.getTimestamp() != null ? m.getTimestamp().toString() : null);

                // Fixed consecutive YELLOW count: GREEN breaks, RED is transparent (same as MeasurementController)
                int consec = 0;
                for (Measurement x : real) {
                    if (!Objects.equals(x.getLotNo(), lotNo)) break;
                    if (Boolean.TRUE.equals(x.getIsForStandardAdjustment())) break;
                    if ("GREEN".equalsIgnoreCase(x.getStatus())) break;
                    if ("YELLOW".equalsIgnoreCase(x.getStatus())) consec++;
                }
                map.put("consecutiveYellow", consec);
                // needsQa: only QA-actionable items (Outer inspection + READY_FOR_APPLY Std + streak/RED status)
                map.put("needsQa",     consec >= 5 || "RED".equalsIgnoreCase(m.getStatus()) || pendingOuter > 0 || pendingStd > 0);
                // needsLeader: Leader-actionable items (RED events, cleaning checks, LEADER_PENDING Std)
                map.put("needsLeader", pendingRed > 0 || pendingCleaning > 0 || pendingStdLeader > 0);
            } else {
                map.put("consecutiveYellow", 0);
                map.put("needsQa",     pendingOuter > 0 || pendingStd > 0);
                map.put("needsLeader", pendingRed > 0 || pendingCleaning > 0 || pendingStdLeader > 0);
            }
            result.add(map);
        }
        return result;
    }

    @GetMapping("/machine-status")
    @org.springframework.security.access.prepost.PreAuthorize("hasAnyRole('QA', 'LEADER', 'ADMIN')")
    public List<Map<String, Object>> getMachineStatus() {
        List<com.example.eikensystem.domain.Machine> machines = machineRepo.findAllOrdered();

        // Active WOs — take the most recent WO per machine
        List<WorkOrder> activeWOs = workOrderRepo.findByStatusOrderByCreatedAtDesc("ACTIVE");
        Map<String, WorkOrder> latestWoByMachine = new LinkedHashMap<>();
        for (WorkOrder wo : activeWOs) {
            if (wo.getMachine() != null) {
                latestWoByMachine.putIfAbsent(wo.getMachine().getMachineId(), wo);
            }
        }

        // Pending approvals grouped by scaleId (parsed from payloadJson)
        List<com.example.eikensystem.domain.Approval> pendingApprovals = approvalRepo.findByStatus("PENDING");
        ObjectMapper om = new ObjectMapper();
        Map<String, List<com.example.eikensystem.domain.Approval>> pendingByScale = new HashMap<>();
        for (com.example.eikensystem.domain.Approval ap : pendingApprovals) {
            if (ap.getPayloadJson() == null) continue;
            try {
                Map<String, Object> pmap = om.readValue(ap.getPayloadJson(), new TypeReference<>() {});
                Object sid = pmap.get("scaleId");
                if (sid != null)
                    pendingByScale.computeIfAbsent(String.valueOf(sid).trim(), k -> new ArrayList<>()).add(ap);
            } catch (Exception ignored) {}
        }

        List<Map<String, Object>> result = new ArrayList<>();
        for (com.example.eikensystem.domain.Machine machine : machines) {
            Map<String, Object> map = new HashMap<>();
            map.put("machineId",   machine.getMachineId());
            map.put("machineName", machine.getMachineName());
            map.put("machineType", machine.getMachineType());

            WorkOrder wo = latestWoByMachine.get(machine.getMachineId());
            if (wo != null && wo.getScale() != null) {
                String scaleId = wo.getScale().getScaleId();
                map.put("workOrderId", wo.getWorkOrderId());
                map.put("scaleId",     scaleId);
                map.put("scaleName",   wo.getScale().getScaleName());

                List<Measurement> latest = measurementRepo.findTop100ByScale_ScaleIdOrderByTimestampDesc(scaleId);
                List<Measurement> real   = latest.stream()
                        .filter(m -> !Boolean.TRUE.equals(m.getIsForStandardAdjustment()))
                        .toList();

                boolean active = !real.isEmpty();
                map.put("active", active);

                List<com.example.eikensystem.domain.Approval> scaleApprovals =
                        pendingByScale.getOrDefault(scaleId, List.of());
                int pendingRed       = (int) scaleApprovals.stream().filter(a -> "RED_EVENT".equals(a.getType())).count();
                int pendingCleaning  = (int) scaleApprovals.stream().filter(a -> "CLEANING_CHECK".equals(a.getType())).count();
                int pendingOuter     = (int) scaleApprovals.stream().filter(a -> "OUTER_INSPECTION".equals(a.getType())).count();
                int pendingStdLeader = (int) scaleApprovals.stream().filter(a -> "STD_CHANGE_REQUEST".equals(a.getType()) && "LEADER_PENDING".equals(a.getStage())).count();
                int pendingStd       = (int) scaleApprovals.stream().filter(a -> "STD_CHANGE_REQUEST".equals(a.getType()) && "READY_FOR_APPLY".equals(a.getStage())).count();
                map.put("pendingRed",       pendingRed);
                map.put("pendingCleaning",  pendingCleaning);
                map.put("pendingOuter",     pendingOuter);
                map.put("pendingStdLeader", pendingStdLeader);
                map.put("pendingStd",       pendingStd);

                if (active) {
                    Measurement m  = real.get(0);
                    String lotNo   = m.getLotNo();
                    map.put("lastProductCode", m.getProduct() != null ? m.getProduct().getProductCode() : null);
                    map.put("lastLotNo",       lotNo);
                    map.put("lastOuterBox",    m.getOuterBoxNumber());
                    map.put("lastInnerOrder",  m.getInnerBoxOrder());
                    map.put("lastStatus",      m.getStatus());
                    map.put("lastTimestamp",   m.getTimestamp() != null ? m.getTimestamp().toString() : null);

                    int consec = 0;
                    for (Measurement x : real) {
                        if (!Objects.equals(x.getLotNo(), lotNo)) break;
                        if (Boolean.TRUE.equals(x.getIsForStandardAdjustment())) break;
                        if ("GREEN".equalsIgnoreCase(x.getStatus())) break;
                        if ("YELLOW".equalsIgnoreCase(x.getStatus())) consec++;
                    }
                    map.put("consecutiveYellow", consec);
                    map.put("needsQa",     consec >= 5 || "RED".equalsIgnoreCase(m.getStatus()) || pendingOuter > 0 || pendingStd > 0);
                    map.put("needsLeader", pendingRed > 0 || pendingCleaning > 0 || pendingStdLeader > 0);
                } else {
                    map.put("consecutiveYellow", 0);
                    map.put("needsQa",     pendingOuter > 0 || pendingStd > 0);
                    map.put("needsLeader", pendingRed > 0 || pendingCleaning > 0 || pendingStdLeader > 0);
                }
            } else {
                map.put("active", false);
                map.put("workOrderId", null); map.put("scaleId", null); map.put("scaleName", null);
                map.put("consecutiveYellow", 0);
                map.put("pendingRed", 0); map.put("pendingCleaning", 0); map.put("pendingOuter", 0);
                map.put("pendingStdLeader", 0); map.put("pendingStd", 0);
                map.put("needsQa", false); map.put("needsLeader", false);
            }
            result.add(map);
        }
        return result;
    }
}
