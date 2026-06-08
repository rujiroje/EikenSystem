package com.example.eikensystem.domain;

import jakarta.persistence.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "measurement")
public class Measurement {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long measurementId;

    private String lotNo;

    @ManyToOne
    @JoinColumn(name = "product_code")
    private Product product;

    @ManyToOne
    @JoinColumn(name = "scale_id")
    private Scale scale;

    private Double weight;
    private Double weight1; // เก็บน้ำหนักครั้งที่ 1 (กรณีชั่ง 2 ครั้ง)
    private Double weight2; // เก็บน้ำหนักครั้งที่ 2 (กรณีชั่ง 2 ครั้ง)

    private LocalDateTime timestamp;
    private String operatorName;
    private String outerBoxNumber;
    private String innerBoxOrder; // e.g. "0001"
    private String status; // GREEN, YELLOW, RED
    private Long approvalId; // optional link to Approval event (RED or STD change)

    @Column(columnDefinition = "TEXT")
    private String note;

    private Boolean isForStandardAdjustment;

    /** อ้างอิง Work Order (nullable — backward compatible กับข้อมูลเก่า) */
    private Long workOrderId;

    /** Std ที่ใช้จริงตอนที่ชั่ง (snapshot ณ เวลานั้น — ไม่เปลี่ยนแม้ QA จะ apply Std ใหม่ภายหลัง) */
    private Double effectiveStd;
    private Double effectiveStd1;
    private Double effectiveStd2;
}
