package com.example.eikensystem.service;

import com.example.eikensystem.domain.WorkOrder;
import com.example.eikensystem.repo.WorkOrderRepo;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Auto-close WO ที่เลยวันสุดท้าย (endDate) แล้วยังมีสถานะ ACTIVE
 * รัน 2 ครั้ง:
 *   1. ตอน Application เริ่มต้น — จัดการ WO หมดอายุที่ค้างอยู่ในระบบ
 *   2. 00:01 ทุกวัน — ตัดสถานะ WO ที่หมดอายุในวันใหม่
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WoAutoCloseService {

    private final WorkOrderRepo workOrderRepo;

    @EventListener(ApplicationReadyEvent.class)
    public void onStartup() {
        autoCloseExpired();
    }

    @Scheduled(cron = "0 1 0 * * *")
    public void scheduledAutoClose() {
        autoCloseExpired();
    }

    public int autoCloseExpired() {
        LocalDate today = LocalDate.now();
        List<WorkOrder> expired = workOrderRepo.findByStatusAndEndDateBefore("ACTIVE", today);
        if (expired.isEmpty()) return 0;

        LocalDateTime now = LocalDateTime.now();
        for (WorkOrder wo : expired) {
            wo.setStatus("END");
            wo.setClosedAt(now);
            wo.setClosedBy("SYSTEM");
            log.info("[WoAutoClose] WO#{} (Lot:{}) → END (endDate={})", wo.getWorkOrderId(), wo.getLotNo(), wo.getEndDate());
        }
        workOrderRepo.saveAll(expired);
        log.info("[WoAutoClose] Auto-closed {} WO(s) with endDate < {}", expired.size(), today);
        return expired.size();
    }
}
