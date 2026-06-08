package com.example.eikensystem.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Data;

import java.time.Instant;

@Entity
@Table(name = "cleaning_logs")
@Data
public class CleaningLog {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    private String scaleId;
    private String cleanedBy;
    private Instant cleanedAt = Instant.now();
    private String notes;
}
