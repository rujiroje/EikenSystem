package com.example.eikensystem.web;

import com.example.eikensystem.domain.Machine;
import com.example.eikensystem.domain.Product;
import com.example.eikensystem.domain.Scale;
import com.example.eikensystem.domain.AppUser;
import com.example.eikensystem.domain.Role;
import com.example.eikensystem.repo.MachineRepo;
import com.example.eikensystem.repo.ProductRepo;
import com.example.eikensystem.repo.ScaleRepo;
import com.example.eikensystem.repo.UserRepo;
import com.example.eikensystem.service.AdminImportService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import javax.sql.DataSource;
import java.sql.Connection;

@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminDataController {
    private final ProductRepo productRepo;
    private final ScaleRepo scaleRepo;
    private final MachineRepo machineRepo;
    private final UserRepo userRepo;
    private final AdminImportService importService;
    private final org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;
    private final DataSource dataSource;

    // --- Product CRUD ---
    @GetMapping("/products")
    public List<Product> listProducts() { return productRepo.findAll(); }

    @PostMapping("/products")
    public Product createProduct(@RequestBody Product p) {
        if (p == null) throw new IllegalArgumentException("Product body is required");
        return productRepo.save(p);
    }

    @PutMapping("/products/{code}")
    public ResponseEntity<Product> updateProduct(@PathVariable String code, @RequestBody Product p) {
        if (p == null) return ResponseEntity.badRequest().build();
        return productRepo.findById(code)
                .map(existing -> {
                    p.setProductCode(code);
                    return ResponseEntity.ok(productRepo.save(p));
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/products/{code}")
    public ResponseEntity<?> deleteProduct(@PathVariable String code) {
        if (productRepo.existsById(code)) {
            productRepo.deleteById(code);
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.notFound().build();
    }

    // --- Scale CRUD ---
    @GetMapping("/scales")
    public List<Scale> listScales() { return scaleRepo.findAll(); }

    @PostMapping("/scales")
    public Scale createScale(@RequestBody Scale s) {
        if (s == null) throw new IllegalArgumentException("Scale body is required");
        return scaleRepo.save(s);
    }

    @PutMapping("/scales/{id}")
    public ResponseEntity<Scale> updateScale(@PathVariable String id, @RequestBody Scale s) {
        if (s == null) return ResponseEntity.badRequest().build();
        return scaleRepo.findById(id)
                .map(existing -> {
                    s.setScaleId(id);
                    return ResponseEntity.ok(scaleRepo.save(s));
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/scales/{id}")
    public ResponseEntity<?> deleteScale(@PathVariable String id) {
        if (scaleRepo.existsById(id)) {
            scaleRepo.deleteById(id);
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.notFound().build();
    }

    // --- Machine CRUD ---
    @GetMapping("/machines")
    public List<Machine> listMachines() { return machineRepo.findAllOrdered(); }

    @PostMapping("/machines")
    public ResponseEntity<?> createMachine(@RequestBody Machine m) {
        if (m == null || m.getMachineId() == null || m.getMachineId().isBlank())
            return ResponseEntity.badRequest().body("machineId is required");
        if (m.getMachineName() == null || m.getMachineName().isBlank())
            return ResponseEntity.badRequest().body("machineName is required");
        if (machineRepo.existsById(m.getMachineId().trim()))
            return ResponseEntity.badRequest().body("Machine ID already exists: " + m.getMachineId());
        m.setMachineId(m.getMachineId().trim());
        if (m.getIsActive() == null) m.setIsActive(true);
        if (m.getSortOrder() == null) m.setSortOrder(99);
        return ResponseEntity.ok(machineRepo.save(m));
    }

    @PutMapping("/machines/{id}")
    public ResponseEntity<?> updateMachine(@PathVariable String id, @RequestBody Machine req) {
        return machineRepo.findById(id)
                .map(m -> {
                    if (req.getMachineName() != null && !req.getMachineName().isBlank())
                        m.setMachineName(req.getMachineName().trim());
                    if (req.getMachineType() != null) m.setMachineType(req.getMachineType().trim());
                    if (req.getIsActive() != null) m.setIsActive(req.getIsActive());
                    if (req.getSortOrder() != null) m.setSortOrder(req.getSortOrder());
                    return ResponseEntity.ok(machineRepo.save(m));
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/machines/{id}")
    public ResponseEntity<?> deleteMachine(@PathVariable String id) {
        if (!machineRepo.existsById(id)) return ResponseEntity.notFound().build();
        machineRepo.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    // --- CSV Import ---
    @PostMapping(value = "/products/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> importProducts(@RequestPart("file") MultipartFile file) {
        try {
            var result = importService.importProductsCsv(file.getInputStream());
            return ResponseEntity.ok(Map.of(
                "imported", result.imported(),
                "skipped",  result.skipped(),
                "errors",   result.errors()
            ));
        } catch (Exception e) {
            String msg = e.getCause() != null ? e.getCause().getMessage() : e.getMessage();
            return ResponseEntity.status(500).body(Map.of("error", msg != null ? msg : e.getClass().getSimpleName()));
        }
    }

    @PostMapping(value = "/scales/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> importScales(@RequestPart("file") MultipartFile file) {
        try {
            var result = importService.importScalesCsv(file.getInputStream());
            return ResponseEntity.ok(Map.of(
                "imported", result.imported(),
                "skipped",  result.skipped(),
                "errors",   result.errors()
            ));
        } catch (Exception e) {
            String msg = e.getCause() != null ? e.getCause().getMessage() : e.getMessage();
            return ResponseEntity.status(500).body(Map.of("error", msg != null ? msg : e.getClass().getSimpleName()));
        }
    }

    @PostMapping(value = "/machines/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> importMachines(@RequestPart("file") MultipartFile file) {
        try {
            var result = importService.importMachinesCsv(file.getInputStream());
            return ResponseEntity.ok(Map.of(
                "imported", result.imported(),
                "skipped",  result.skipped(),
                "errors",   result.errors()
            ));
        } catch (Exception e) {
            String msg = e.getCause() != null ? e.getCause().getMessage() : e.getMessage();
            return ResponseEntity.status(500).body(Map.of("error", msg != null ? msg : e.getClass().getSimpleName()));
        }
    }

    @PostMapping(value = "/users/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> importUsers(@RequestPart("file") MultipartFile file) {
        try {
            var result = importService.importUsersCsv(file.getInputStream());
            return ResponseEntity.ok(Map.of(
                "imported", result.imported(),
                "skipped",  result.skipped(),
                "errors",   result.errors()
            ));
        } catch (Exception e) {
            String msg = e.getCause() != null ? e.getCause().getMessage() : e.getMessage();
            return ResponseEntity.status(500).body(Map.of("error", msg != null ? msg : e.getClass().getSimpleName()));
        }
    }

    // --- Users (basic create for testing/admin) ---
    @PostMapping("/users")
    public ResponseEntity<?> createUser(@RequestBody CreateUserRequest req) {
        if (req == null || req.username == null || req.username.isBlank() || req.password == null || req.password.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "username/password required"));
        }
        Set<Role> roles = mapRolesSafe(req.roles);
        AppUser u = userRepo.findById(req.username).orElseGet(AppUser::new);
        u.setUsername(req.username);
        u.setPasswordHash(passwordEncoder.encode(req.password));
        u.setRoles(roles.isEmpty() ? Set.of(Role.LEADER) : roles);
        userRepo.save(u);
        return ResponseEntity.ok(Map.of("ok", true));
    }

    public record CreateUserRequest(String username, String password, List<String> roles) {}

    // --- Users Admin (list/update/delete) ---
    @GetMapping("/users")
    public List<AdminUser> listUsers() {
        return userRepo.findAll().stream()
                .sorted(java.util.Comparator.comparing(AppUser::getUsername)) // เรียงตามชื่อ
                .map(u -> new AdminUser(
                        u.getUsername(), 
                        u.getRoles(),
                        u.getFingerprintTemplate() != null && !u.getFingerprintTemplate().isBlank() // เช็คว่ามีนิ้วไหม
                ))
                .collect(Collectors.toList());
    }

    @GetMapping("/users/{username}")
    public ResponseEntity<AdminUser> getUser(@PathVariable String username) {
        return userRepo.findById(username)
                .map(u -> ResponseEntity.ok(new AdminUser(
                        u.getUsername(), 
                        u.getRoles(),
                        u.getFingerprintTemplate() != null && !u.getFingerprintTemplate().isBlank()
                )))
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PutMapping("/users/{username}")
    public ResponseEntity<?> updateUser(@PathVariable String username, @RequestBody UpdateUserRequest req) {
        if (req == null) return ResponseEntity.badRequest().build();
        return userRepo.findById(username)
                .map(u -> {
                    if (req.password() != null && !req.password().isBlank()) {
                        u.setPasswordHash(passwordEncoder.encode(req.password()));
                    }
                    if (req.roles() != null) {
                        Set<Role> roles = mapRolesSafe(req.roles());
                        u.setRoles(roles);
                    }
                    userRepo.save(u);
                    return ResponseEntity.ok(Map.of("ok", true));
                })
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @DeleteMapping("/users/{username}")
    public ResponseEntity<?> deleteUser(@PathVariable String username) {
        if (userRepo.existsById(username)) {
            userRepo.deleteById(username);
            return ResponseEntity.noContent().build();
        }
        return ResponseEntity.notFound().build();
    }

    // --- Fingerprint Enrollment ---
    @PostMapping("/users/{username}/fingerprint")
    public ResponseEntity<?> enrollFingerprint(@PathVariable String username, @RequestBody Map<String, String> body) {
        String template = body.get("template");
        if (template == null || template.isBlank()) return ResponseEntity.badRequest().body("Template required");
        
        return userRepo.findById(username).map(u -> {
            u.setFingerprintTemplate(template);
            userRepo.save(u);
            return ResponseEntity.ok(Map.of("ok", true, "message", "Fingerprint enrolled successfully"));
        }).orElseGet(() -> ResponseEntity.notFound().build());
    }

    public record UpdateUserRequest(String password, List<String> roles) {}
    public record AdminUser(String username, Set<Role> roles, boolean hasFingerprint) {}

    // --- helpers ---
    private Set<Role> mapRolesSafe(List<String> roles) {
        if (roles == null) return Set.of();
        List<String> invalid = roles.stream()
                .filter(r -> {
                    try { Role.valueOf(r.trim().toUpperCase()); return false; } catch (Exception e) { return true; }
                }).toList();
        if (!invalid.isEmpty()) {
            throw new IllegalArgumentException("invalid roles: " + String.join(",", invalid));
        }
        return roles.stream().map(String::trim).map(String::toUpperCase).map(Role::valueOf).collect(Collectors.toSet());
    }

    // --- DB info for troubleshooting which database is active ---
    @GetMapping("/db-info")
    public Map<String, Object> dbInfo() {
        try (Connection c = dataSource.getConnection()) {
            String product = c.getMetaData().getDatabaseProductName();
            String url = c.getMetaData().getURL();
            return Map.of("product", product, "url", url);
        } catch (Exception e) {
            return Map.of("error", e.getMessage());
        }
    }

    /** ตรวจสอบและสร้างคอลัมน์ที่อาจขาดหายจาก schema เช่น cleaner_time ที่เพิ่มมาภายหลัง */
    @PostMapping("/schema/ensure-columns")
    public Map<String, Object> ensureColumns() {
        List<String> applied = new ArrayList<>();
        List<String> errors  = new ArrayList<>();
        // [table, column, sqlType]
        String[][] required = {
            {"product", "cleaner_time", "INT NULL"}
        };
        try (Connection c = dataSource.getConnection()) {
            for (String[] col : required) {
                String table = col[0], column = col[1], sqlType = col[2];
                boolean exists = false;
                try (var rs = c.getMetaData().getColumns(null, null, table, column)) {
                    exists = rs.next();
                }
                if (!exists) {
                    String sql = "ALTER TABLE " + table + " ADD " + column + " " + sqlType;
                    try (var st = c.createStatement()) {
                        st.execute(sql);
                        applied.add(sql);
                    } catch (Exception ex) {
                        errors.add(table + "." + column + ": " + ex.getMessage());
                    }
                }
            }
        } catch (Exception e) {
            return Map.of("error", e.getMessage());
        }
        return Map.of("applied", applied, "errors", errors,
            "message", applied.isEmpty() && errors.isEmpty() ? "Schema is up-to-date" : "Done");
    }
}
