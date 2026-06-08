package com.example.eikensystem.domain;

import jakarta.persistence.*;
import lombok.Data;

@Data
@Entity
@Table(name = "machine")
public class Machine {

    /** รหัสเครื่องจักร เช่น RLB101, MANUAL-SOC (Primary Key) */
    @Id
    private String machineId;

    /** ชื่อแสดงผล เช่น "RLB101", "Manual S-OC" */
    @Column(nullable = false)
    private String machineName;

    /** กลุ่มเครื่องจักร เช่น PRODUCTION, MANUAL, PACKING */
    private String machineType;

    /** ใช้งานอยู่หรือไม่ */
    private Boolean isActive;

    /** ลำดับการแสดงผล (น้อย = แสดงก่อน) */
    private Integer sortOrder;
}
