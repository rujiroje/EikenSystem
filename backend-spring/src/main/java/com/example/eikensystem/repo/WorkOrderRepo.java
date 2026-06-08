package com.example.eikensystem.repo;

import com.example.eikensystem.domain.WorkOrder;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface WorkOrderRepo extends JpaRepository<WorkOrder, Long> {

    /** ดึง WO ทั้งหมดตาม status (เช่น ACTIVE, END, SORTING) */
    List<WorkOrder> findByStatusOrderByCreatedAtDesc(String status);

    /** ดึง WO ทั้งหมดเรียงตาม createdAt ล่าสุด */
    List<WorkOrder> findAllByOrderByCreatedAtDesc();

    /** ดึง WO ตาม product code + status */
    List<WorkOrder> findByProduct_ProductCodeAndStatusOrderByCreatedAtDesc(String productCode, String status);

    /** ตรวจสอบว่า lotNo ซ้ำใน WO ที่ยัง ACTIVE อยู่หรือไม่ */
    boolean existsByLotNoAndStatus(String lotNo, String status);

    /** ดึง WO ในช่วงวันที่สร้าง — ใช้สำหรับ cross-WO performance report */
    List<WorkOrder> findByCreatedAtBetweenOrderByCreatedAtDesc(
        java.time.LocalDateTime from, java.time.LocalDateTime to);

    /** ดึง WO ที่เลยวันสุดท้ายแล้วและยังเป็น ACTIVE — ใช้สำหรับ auto-close */
    List<WorkOrder> findByStatusAndEndDateBefore(String status, java.time.LocalDate date);

    /** ดึง WO ทั้งหมดที่เป็น Rework ของ WO ต้นฉบับนั้น ๆ */
    List<WorkOrder> findByReworkSourceWo_WorkOrderIdOrderByCreatedAtDesc(Long sourceWoId);

    /**
     * หา ACTIVE WO ที่วันที่ overlap กับช่วง [startDate, endDate]
     * excludeId ใช้ตอน Edit เพื่อไม่นับ WO ตัวเองเป็น conflict (ส่ง null ถ้าไม่ต้องการ exclude)
     * Overlap condition: wo.startDate <= endDate AND wo.endDate >= startDate
     * null startDate/endDate ฝั่ง WO = ถือว่าครอบทุกวัน
     */
    @org.springframework.data.jpa.repository.Query(
        "SELECT wo FROM WorkOrder wo WHERE wo.status = 'ACTIVE' " +
        "AND (:excludeId IS NULL OR wo.workOrderId <> :excludeId) " +
        "AND (wo.startDate IS NULL OR wo.startDate <= :endDate) " +
        "AND (wo.endDate IS NULL OR wo.endDate >= :startDate)")
    List<WorkOrder> findConflictingActiveWOs(
        @org.springframework.data.repository.query.Param("startDate") java.time.LocalDate startDate,
        @org.springframework.data.repository.query.Param("endDate")   java.time.LocalDate endDate,
        @org.springframework.data.repository.query.Param("excludeId") Long excludeId);
}
