package com.example.eikensystem.domain;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

@Entity
@Table(name = "standard_weight_logs")
@Data
public class StandardWeightLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String productCode;
    private Double oldStd;
    private Double newStd;
    private Double oldStd1;
    private Double newStd1;
    private Double oldStd2;
    private Double newStd2;
    @Column(columnDefinition = "TEXT")
    private String sampleWeightsJson; // JSON of 5 sample weights
    private Long approvalId; // QA approval request id
    private String approvedBy;
    private Instant approvedAt = Instant.now();
    @Column(columnDefinition = "TEXT")
    private String reason;
}
