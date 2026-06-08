package com.example.eikensystem.domain;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.Column;
import lombok.Data;

@Data
@Entity
@Table(name = "product")
public class Product {
    @Id
    private String productCode;
    private String productName;
    
    private Double weightPerPiece;
    private Integer quantityPerMeasurement;
    
    // Default standards calculated from piece * qty
    private Double standardWeight;
    private Double minWeight;
    private Double maxWeight;
    
    private Double tolerance;
    private Integer innerBoxQuantity;
    
    private String unit;
    private String description;

    // --- NEW CONFIGURATIONS ---
    
    /**
     * โหมดการชั่ง: 
     * "SINGLE" = ชั่ง 1 ครั้ง, 
     * "DOUBLE" = ชั่ง 2 ครั้งแล้วเทียบ
     */
    @Column(name = "weighing_mode")
    private String weighingMode = "SINGLE";

    /**
     * ความคลาดเคลื่อนที่ยอมรับได้ระหว่างน้ำหนักครั้งที่ 1 และ 2 (กรณี DOUBLE)
     */
    @Column(name = "double_weighing_tolerance")
    private Double doubleWeighingTolerance;

    /**
     * โหมดการรันเลข Inner:
     * "CONTINUOUS" = รันข้ามกล่อง Outer (001, 002, 003...),
     * "RESET_PER_OUTER" = รีเซ็ตเป็น 0001 ใหม่เมื่อขึ้น Outer ใหม่
     */
    @Column(name = "inner_numbering_mode")
    private String innerNumberingMode = "CONTINUOUS";

    @Column(name = "standard_weight1")
    private Double standardWeight1; // ค่า Std สำหรับการชั่งครั้งที่ 1 (กรณี DOUBLE)
    @Column(name = "standard_weight2")
    private Double standardWeight2; // ค่า Std สำหรับการชั่งครั้งที่ 2 (กรณี DOUBLE)

    @Column(name = "tolerance1")
    private Double tolerance1; // ค่า Tolerance สำหรับการชั่งครั้งที่ 1 (กรณี DOUBLE)
    @Column(name = "tolerance2")
    private Double tolerance2; // ค่า Tolerance สำหรับการชั่งครั้งที่ 2 (กรณี DOUBLE)

    /** จำนวนชั่วโมงระหว่างการทำความสะอาด (null หรือ 0 = ปิดการแจ้งเตือน) */
    @Column(name = "cleaner_time")
    private Integer cleanerTime;
}