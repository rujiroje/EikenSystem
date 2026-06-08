package com.example.eikensystem.web;

import com.example.eikensystem.domain.ChangeLog;
import com.example.eikensystem.domain.CleaningLog;
import com.example.eikensystem.repo.ChangeLogRepo;
import com.example.eikensystem.repo.CleaningLogRepo;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.RequestParam;
import java.util.List;

@RestController
@RequestMapping("/api/logs")
@RequiredArgsConstructor
public class LogController {
    private final ChangeLogRepo changeLogRepo;
    private final CleaningLogRepo cleaningLogRepo;

    @GetMapping("/changes")
    public List<ChangeLog> listChangeLogs() { return changeLogRepo.findAll(); }

    @PostMapping("/changes")
    public ResponseEntity<ChangeLog> addChange(@RequestBody ChangeLog log) { return ResponseEntity.ok(changeLogRepo.save(log)); }

    @GetMapping("/cleaning")
    public List<CleaningLog> listCleaningLogs() { return cleaningLogRepo.findAll(); }

    @PostMapping("/cleaning")
    public ResponseEntity<CleaningLog> addCleaning(@RequestBody CleaningLog log) { return ResponseEntity.ok(cleaningLogRepo.save(log)); }

    // ดึง history การแก้ไขกล่อง (BOX_RELOCATE) ของ lot นั้น สำหรับหน้า Sorting
    // ใช้ combined query: lotNo field (ใหม่) OR description LIKE (เก่า) เพื่อรองรับทั้งสองรูปแบบ
    @GetMapping("/sorting-history")
    @PreAuthorize("isAuthenticated()")
    public List<ChangeLog> sortingHistory(@RequestParam String lotNo) {
        return changeLogRepo.findByLotNoOrDescriptionContaining(lotNo, lotNo).stream()
                .filter(c -> "BOX_RELOCATE".equals(c.getChangeType()))
                .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                .toList();
    }

    // ดึง change logs ทั้งหมดที่เกี่ยวข้องกับ lot (สำหรับรายงาน WO)
    // ใช้ combined query: lotNo field (ใหม่) OR description LIKE (เก่า) เพื่อรองรับทั้งสองรูปแบบ
    @GetMapping("/changes/by-lot")
    @PreAuthorize("hasAnyRole('QA','LEADER','ADMIN')")
    public List<ChangeLog> changesByLot(@RequestParam String lotNo) {
        return changeLogRepo.findByLotNoOrDescriptionContaining(lotNo, lotNo).stream()
                .sorted((a, b) -> b.getCreatedAt().compareTo(a.getCreatedAt()))
                .toList();
    }
}
