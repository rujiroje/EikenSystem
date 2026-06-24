package com.example.eikensystem.web;

import com.example.eikensystem.domain.SortingReason;
import com.example.eikensystem.repo.SortingReasonRepo;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;

@RestController
@RequiredArgsConstructor
public class SortingReasonController {

    private final SortingReasonRepo repo;

    /** Operator: GET เหตุผล active ทั้งหมด (กรอง scope ได้) */
    @GetMapping("/api/sorting-reasons")
    @PreAuthorize("isAuthenticated()")
    public List<SortingReason> list(@RequestParam(required = false) String scope) {
        if (scope != null && !scope.isBlank()) {
            return repo.findByIsActiveTrueAndScopeInOrderBySortOrderAsc(List.of(scope.toUpperCase(), "BOTH"));
        }
        return repo.findByIsActiveTrueOrderBySortOrderAsc();
    }

    /** DATA_ADMIN: GET ทั้งหมด (รวม inactive) */
    @GetMapping("/api/admin/sorting-reasons")
    @PreAuthorize("hasRole('DATA_ADMIN')")
    public List<SortingReason> adminList() {
        return repo.findAll();
    }

    /** DATA_ADMIN: สร้างใหม่ */
    @PostMapping("/api/admin/sorting-reasons")
    @PreAuthorize("hasRole('DATA_ADMIN')")
    public ResponseEntity<?> create(@RequestBody SortingReason body, Authentication auth) {
        if (body.getCode() == null || body.getCode().isBlank())
            return ResponseEntity.badRequest().body("code is required");
        if (body.getLabelTh() == null || body.getLabelTh().isBlank())
            return ResponseEntity.badRequest().body("labelTh is required");
        if (repo.existsByCode(body.getCode().trim()))
            return ResponseEntity.badRequest().body("code already exists: " + body.getCode());
        body.setId(null);
        body.setCode(body.getCode().trim().toUpperCase());
        body.setCreatedAt(Instant.now());
        body.setCreatedBy(auth.getName());
        return ResponseEntity.ok(repo.save(body));
    }

    /** DATA_ADMIN: แก้ไข */
    @PutMapping("/api/admin/sorting-reasons/{id}")
    @PreAuthorize("hasRole('DATA_ADMIN')")
    public ResponseEntity<?> update(@PathVariable Long id, @RequestBody SortingReason body, Authentication auth) {
        return repo.findById(id).map(r -> {
            if (body.getLabelTh() != null) r.setLabelTh(body.getLabelTh());
            if (body.getLabelEn()  != null) r.setLabelEn(body.getLabelEn());
            if (body.getDescription() != null) r.setDescription(body.getDescription());
            if (body.getScope()    != null) r.setScope(body.getScope().toUpperCase());
            if (body.getSortOrder() != null) r.setSortOrder(body.getSortOrder());
            if (body.getIsActive() != null) r.setIsActive(body.getIsActive());
            if (body.getRequiresNote() != null) r.setRequiresNote(body.getRequiresNote());
            r.setUpdatedAt(Instant.now());
            r.setUpdatedBy(auth.getName());
            return ResponseEntity.ok(repo.save(r));
        }).orElseGet(() -> ResponseEntity.notFound().build());
    }

    /** DATA_ADMIN: soft delete (set is_active=false) */
    @DeleteMapping("/api/admin/sorting-reasons/{id}")
    @PreAuthorize("hasRole('DATA_ADMIN')")
    public ResponseEntity<?> delete(@PathVariable Long id, Authentication auth) {
        return repo.findById(id).map(r -> {
            r.setIsActive(false);
            r.setUpdatedAt(Instant.now());
            r.setUpdatedBy(auth.getName());
            repo.save(r);
            return ResponseEntity.ok().build();
        }).orElseGet(() -> ResponseEntity.notFound().build());
    }
}
