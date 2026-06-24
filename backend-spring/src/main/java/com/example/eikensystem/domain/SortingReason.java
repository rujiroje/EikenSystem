package com.example.eikensystem.domain;

import jakarta.persistence.*;
import lombok.Data;

import java.time.Instant;

@Data
@Entity
@Table(name = "sorting_reasons")
public class SortingReason {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = false)
    private String code;

    @Column(columnDefinition = "NVARCHAR(255)", nullable = false)
    private String labelTh;

    private String labelEn;

    @Column(columnDefinition = "NVARCHAR(500)")
    private String description;

    /** BULK / SINGLE / BOTH */
    private String scope = "BOTH";

    private Integer sortOrder = 100;

    private Boolean isActive = true;

    /** ถ้า true → ต้องกรอก note ด้วย */
    private Boolean requiresNote = false;

    private Instant createdAt = Instant.now();
    private String createdBy;
    private Instant updatedAt;
    private String updatedBy;
}
