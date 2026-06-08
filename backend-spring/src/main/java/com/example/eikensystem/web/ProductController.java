package com.example.eikensystem.web;

import com.example.eikensystem.domain.Product;
import com.example.eikensystem.domain.StandardWeightLog;
import com.example.eikensystem.repo.ProductRepo;
import com.example.eikensystem.repo.StandardWeightLogRepo;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.HashMap;

@RestController
@RequestMapping("/api/products")
@RequiredArgsConstructor
public class ProductController {
    private final ProductRepo productRepo;
    private final StandardWeightLogRepo stdLogRepo;

    @GetMapping
    public List<Product> list() { return productRepo.findAll(); }

    @PostMapping
    public ResponseEntity<Product> create(@RequestBody Product p) {
        // derive basic fields if absent — Std = qty×wpp; Min = Std-wpp/2; Max = Std+wpp/2; Tolerance = wpp/4
        if (p.getWeightPerPiece() != null && p.getQuantityPerMeasurement() != null) {
            double wpp = p.getWeightPerPiece();
            double s   = wpp * p.getQuantityPerMeasurement();
            p.setStandardWeight(s);
            p.setMinWeight(s - wpp / 2.0);
            p.setMaxWeight(s + wpp / 2.0);
            p.setTolerance(wpp / 4.0);
        }
        return ResponseEntity.ok(productRepo.save(p));
    }

    @GetMapping("/{code}")
    public ResponseEntity<Product> get(@PathVariable String code) {
        return productRepo.findById(code)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    /** คืนค่า Std ที่ใช้งานจริง (จาก StandardWeightLog ล่าสุด หรือ Product master ถ้ายังไม่มี log) */
    @GetMapping("/{code}/effective-std")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<Map<String, Object>> effectiveStd(@PathVariable String code) {
        Product p = productRepo.findById(code).orElse(null);
        if (p == null) return ResponseEntity.notFound().build();

        List<StandardWeightLog> logs = stdLogRepo.findByProductCodeOrderByApprovedAtDesc(code);
        Map<String, Object> result = new HashMap<>();
        if (!logs.isEmpty()) {
            StandardWeightLog latest = logs.get(0);
            result.put("std",  latest.getNewStd()  != null ? latest.getNewStd()  : p.getStandardWeight());
            result.put("std1", latest.getNewStd1() != null ? latest.getNewStd1() : p.getStandardWeight1());
            result.put("std2", latest.getNewStd2() != null ? latest.getNewStd2() : p.getStandardWeight2());
        } else {
            result.put("std",  p.getStandardWeight());
            result.put("std1", p.getStandardWeight1());
            result.put("std2", p.getStandardWeight2());
        }
        return ResponseEntity.ok(result);
    }
}
