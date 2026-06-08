package com.example.eikensystem.web;

import com.example.eikensystem.domain.Machine;
import com.example.eikensystem.repo.MachineRepo;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/machines")
@RequiredArgsConstructor
public class MachineController {

    private final MachineRepo machineRepo;

    /** ดึงรายการ Machine ทั้งหมด (เรียงตาม sortOrder) */
    @GetMapping
    @PreAuthorize("isAuthenticated()")
    public List<Machine> list() {
        return machineRepo.findAllOrdered();
    }

    /** ดึงเฉพาะ Machine ที่ isActive=true (สำหรับ Dropdown ใน WO) */
    @GetMapping("/active")
    @PreAuthorize("isAuthenticated()")
    public List<Machine> listActive() {
        return machineRepo.findActiveOrdered();
    }

    /** สร้าง Machine ใหม่ */
    @PostMapping
    @PreAuthorize("hasAnyRole('LEADER','ADMIN')")
    public ResponseEntity<?> create(@RequestBody MachineRequest req) {
        if (req.getMachineId() == null || req.getMachineId().isBlank())
            return ResponseEntity.badRequest().body("machineId is required");
        if (req.getMachineName() == null || req.getMachineName().isBlank())
            return ResponseEntity.badRequest().body("machineName is required");
        if (machineRepo.existsById(req.getMachineId().trim()))
            return ResponseEntity.badRequest().body("Machine ID '" + req.getMachineId() + "' already exists");

        Machine m = new Machine();
        m.setMachineId(req.getMachineId().trim());
        m.setMachineName(req.getMachineName().trim());
        m.setMachineType(req.getMachineType() != null ? req.getMachineType().trim() : null);
        m.setIsActive(req.getIsActive() != null ? req.getIsActive() : true);
        m.setSortOrder(req.getSortOrder() != null ? req.getSortOrder() : 99);
        return ResponseEntity.ok(machineRepo.save(m));
    }

    /** แก้ไข Machine (ไม่สามารถเปลี่ยน machineId ได้) */
    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('LEADER','ADMIN')")
    public ResponseEntity<?> update(@PathVariable String id, @RequestBody MachineRequest req) {
        Machine m = machineRepo.findById(id).orElse(null);
        if (m == null) return ResponseEntity.notFound().build();
        if (req.getMachineName() != null && !req.getMachineName().isBlank())
            m.setMachineName(req.getMachineName().trim());
        if (req.getMachineType() != null) m.setMachineType(req.getMachineType().trim());
        if (req.getIsActive() != null) m.setIsActive(req.getIsActive());
        if (req.getSortOrder() != null) m.setSortOrder(req.getSortOrder());
        return ResponseEntity.ok(machineRepo.save(m));
    }

    /** ลบ Machine (ระวัง: WO ที่อ้างอิง Machine นี้จะ FK เป็น null หากไม่มี cascade) */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('LEADER','ADMIN')")
    public ResponseEntity<?> delete(@PathVariable String id) {
        if (!machineRepo.existsById(id)) return ResponseEntity.notFound().build();
        machineRepo.deleteById(id);
        return ResponseEntity.ok().build();
    }

    @Data
    public static class MachineRequest {
        private String machineId;
        private String machineName;
        private String machineType;
        private Boolean isActive;
        private Integer sortOrder;
    }
}
