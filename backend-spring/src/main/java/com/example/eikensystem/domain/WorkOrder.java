package com.example.eikensystem.domain;

import jakarta.persistence.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "work_order")
public class WorkOrder {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long workOrderId;

    /** Product ที่ใช้ใน WO นี้ */
    @ManyToOne
    @JoinColumn(name = "product_code")
    private Product product;

    /** เครื่องชั่งที่ใช้ */
    @ManyToOne
    @JoinColumn(name = "scale_id")
    private Scale scale;

    /** เครื่องจักรที่ใช้ผลิต (แทน line field) */
    @ManyToOne
    @JoinColumn(name = "machine_id")
    private Machine machine;

    /** Line การผลิต (legacy — ใช้ machine แทนใน WO ใหม่) */
    private String line;

    /** Lot Number */
    private String lotNo;

    /** วันเริ่มต้นผลิต */
    private LocalDate startDate;

    /** วันสุดท้ายของการผลิต */
    private LocalDate endDate;

    /**
     * ค่า Std ที่ LD กำหนดเอง (SINGLE mode หรือ override)
     * null = ให้ใช้ค่า Std จาก product master table
     */
    private Double customStd;

    /**
     * ค่า Std สำหรับการชั่งครั้งที่ 1 (DOUBLE mode)
     * null = ให้ใช้ค่าจาก product
     */
    private Double customStd1;

    /**
     * ค่า Std สำหรับการชั่งครั้งที่ 2 (DOUBLE mode)
     * null = ให้ใช้ค่าจาก product
     */
    private Double customStd2;

    /**
     * สถานะ WO:
     * ACTIVE  = กำลังผลิต
     * END     = จบการผลิตแล้ว
     * SORTING = กำลังทำ Sorting
     */
    private String status;

    /** LD ที่สร้าง WO */
    private String createdBy;

    /** เวลาที่สร้าง WO */
    private LocalDateTime createdAt;

    /**
     * ชื่อผู้ร่วมทำงาน (Operator กรอกตอนเริ่ม session)
     * เก็บเป็น text อิสระ (เช่น "สมชาย, สมหญิง")
     */
    @Column(columnDefinition = "TEXT")
    private String operatorNames;

    /** Operator หลักที่เริ่ม session */
    private String startedBy;

    /** เวลาที่ OP เริ่ม session ล่าสุด */
    private LocalDateTime sessionStartedAt;

    /** เวลาที่ปิด WO (สถานะ END) */
    private LocalDateTime closedAt;

    /** ผู้ปิด WO */
    private String closedBy;

    /**
     * WO ต้นฉบับที่นำมา Rework (null = WO ปกติ / ไม่ใช่ Rework)
     * self-join: work_order.rework_source_wo_id → work_order.work_order_id
     * EAGER เพื่อให้ Jackson serialize ได้ภายใน transaction context
     * JsonIgnoreProperties กัน circular ชั้นที่ 2 ขึ้นไป
     */
    @ManyToOne(fetch = jakarta.persistence.FetchType.EAGER)
    @JoinColumn(name = "rework_source_wo_id")
    @com.fasterxml.jackson.annotation.JsonIgnoreProperties({"reworkSourceWo", "reworkReason", "hibernateLazyInitializer", "handler"})
    private WorkOrder reworkSourceWo;

    /** เหตุผลที่ต้อง Rework */
    @Column(columnDefinition = "TEXT")
    private String reworkReason;
}
