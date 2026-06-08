package com.example.eikensystem.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

import java.time.Instant;

@Entity
@Table(name = "approvals")
@Data
public class Approval {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String type; // e.g., MEASUREMENT_LOCK, YELLOW_THRESHOLD, PRODUCT_CHANGE
    private String targetId; // reference id
    private String status; // PENDING, APPROVED, REJECTED
    private String approverRole; // LEADER or QA
    private String requestedBy;
    private Instant requestedAt = Instant.now();
    private Instant actionAt;
    private String actionBy;
    private String note;
    // Stage for multi-step flows (e.g., YELLOW streak -> ALLOW_4_5 -> READY_FOR_APPLY -> APPLIED)
    private String stage; // REQUESTED, ALLOW_4_5, READY_FOR_APPLY, APPLIED
    // Arbitrary JSON payload to store context: productCode, scaleId, lotNo, stdOld, weights3/weights5, proposedStd
    @jakarta.persistence.Column(columnDefinition = "TEXT")
    private String payloadJson;
    /** true = RED อนุมัติพร้อมเริ่มเก็บตัวอย่าง Std ใหม่ 10 กล่อง (reset yellow + running avg Std) */
    private boolean recalcStdMode;
}
