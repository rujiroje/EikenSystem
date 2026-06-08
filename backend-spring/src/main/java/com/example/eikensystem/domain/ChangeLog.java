package com.example.eikensystem.domain;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

@Entity
@Table(name = "change_logs")
@Data
public class ChangeLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String productCode;
    private String changeType; // e.g., WEIGHT_UPDATE, TOLERANCE_UPDATE, MEASUREMENT_REWEIGH
    @Column(columnDefinition = "NVARCHAR(MAX)")
    private String description; // JSON detail or free-text
    private String createdBy;
    private Instant createdAt = Instant.now();
    // Dedicated lotNo field for reliable querying (avoids LIKE on TEXT column)
    private String lotNo;
}
