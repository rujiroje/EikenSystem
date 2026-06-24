package com.example.eikensystem.domain;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

@Data
@Entity
@Table(name = "outer_inspections")
public class OuterInspection {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String productCode;
    private String scaleId;
    private String lotNo;
    private String outerBox;

    private Long workOrderId;
    private Long approvalId;

    /** QA / OPERATOR / LEADER */
    private String inspectorRole;
    private String inspectorUser;

    private Instant inspectedAt;

    /** AUTO_APPROVED (OPERATOR self-check) / APPROVED / REJECTED */
    private String status;

    @Column(columnDefinition = "NVARCHAR(500)")
    private String approverNote;

    @Column(columnDefinition = "NVARCHAR(500)")
    private String notes;

    private Integer reweighCount = 0;

    private Instant createdAt = Instant.now();
}
