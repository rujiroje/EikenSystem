package com.example.eikensystem.web;

import com.example.eikensystem.domain.AppUser;
import com.example.eikensystem.repo.UserRepo;
import com.example.eikensystem.security.JwtService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.security.Principal;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {
    private final UserRepo userRepo;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    // One-use nonces for biometric login (TTL 60 s)
    private static final ConcurrentHashMap<String, Long> BIOMETRIC_NONCES = new ConcurrentHashMap<>();
    private static final long NONCE_TTL_MS = 60_000L;

    private void cleanNonces() {
        long now = System.currentTimeMillis();
        BIOMETRIC_NONCES.entrySet().removeIf(e -> now - e.getValue() > NONCE_TTL_MS);
    }

    @GetMapping("/biometric-challenge")
    public ResponseEntity<?> biometricChallenge() {
        cleanNonces();
        String nonce = UUID.randomUUID().toString();
        BIOMETRIC_NONCES.put(nonce, System.currentTimeMillis());
        return ResponseEntity.ok(Map.of("nonce", nonce));
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest req) {
        if (req == null || req.getUsername() == null || req.getPassword() == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "username/password required"));
        }
        return userRepo.findById(req.getUsername())
                .filter(u -> passwordEncoder.matches(req.getPassword(), u.getPasswordHash()))
                .<ResponseEntity<?>>map(u -> {
                    String token = jwtService.generate(u.getUsername(), Map.of("roles", u.getRoles()));
                    return ResponseEntity.ok(Map.of(
                            "token", token,
                            "user", Map.of(
                                    "username", u.getUsername(),
                                    "roles", u.getRoles()
                            )
                    ));
                })
                .orElseGet(() -> ResponseEntity.status(401).body(Map.of("error", "Invalid credentials")));
    }

    @PostMapping("/login-fingerprint")
    public ResponseEntity<?> loginFingerprint(@RequestBody Map<String, String> req) {
        String template = req.get("template");
        if (template == null || template.isBlank()) return ResponseEntity.badRequest().body("Template required");

        // Logic: Iterate users and match fingerprint
        // Note: In production, use a library like SourceAFIS or DigitalPersona SDK for matching
        // Here we simulate a simple string match for demonstration
        
        for (AppUser u : userRepo.findAll()) {
            String stored = u.getFingerprintTemplate();
            if (stored != null && stored.equals(template)) { 
                String token = jwtService.generate(u.getUsername(), Map.of("roles", u.getRoles()));
                return ResponseEntity.ok(Map.of(
                        "token", token,
                        "user", Map.of("username", u.getUsername(), "roles", u.getRoles())
                ));
            }
        }
        
        // Mock for testing: if template is "TEST_FINGERPRINT", login as 'operator'
        if ("TEST_FINGERPRINT".equals(template)) {
             return userRepo.findById("operator").map(u -> ResponseEntity.ok(Map.of("token", jwtService.generate(u.getUsername(), Map.of("roles", u.getRoles())), "user", Map.of("username", u.getUsername(), "roles", u.getRoles())))).orElse(ResponseEntity.status(401).build());
        }

        return ResponseEntity.status(401).body(Map.of("error", "Fingerprint not recognized"));
    }

    @PostMapping("/login-kiosk")
    public ResponseEntity<?> loginKiosk(@RequestBody Map<String, Object> req) {
        // รับข้อมูลจาก KiosBioAgent
        // req structure: { ok: true, challenge: "...", signedData: "...", device: "...", ts: "..." }

        // 1. ตรวจสอบว่ามีข้อมูลลายนิ้วมือ (template) ส่งมาหรือไม่
        Object signedDataObj = req.get("signedData");
        if (signedDataObj == null || !(signedDataObj instanceof String) || ((String) signedDataObj).isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Fingerprint data (signedData) is required."));
        }
        String receivedTemplate = (String) signedDataObj;

        // 2. ค้นหา user ที่มี template ตรงกัน
        // หมายเหตุ: การเปรียบเทียบ String แบบนี้ใช้เพื่อการสาธิตเท่านั้น
        // ในระบบจริงต้องใช้ Library สำหรับเปรียบเทียบลายนิ้วมือโดยเฉพาะ
        for (AppUser u : userRepo.findAll()) {
            String storedTemplate = u.getFingerprintTemplate();
            if (storedTemplate != null && !storedTemplate.isBlank() && storedTemplate.equals(receivedTemplate)) {
                // เมื่อเจอ user ที่ตรงกัน, สร้าง token และส่งกลับ
                String token = jwtService.generate(u.getUsername(), Map.of("roles", u.getRoles()));
                return ResponseEntity.ok(Map.of(
                        "token", token,
                        "user", Map.of("username", u.getUsername(), "roles", u.getRoles())
                ));
            }
        }

        // 3. ถ้าไม่เจอ user ที่ตรงกัน
        return ResponseEntity.status(401).body(Map.of("error", "Fingerprint not recognized"));
    }

    // เพิ่ม API สำหรับลงทะเบียนลายนิ้วมือ
    @PostMapping("/register-fingerprint")
    public ResponseEntity<?> registerFingerprint(@RequestBody Map<String, String> req, Principal principal) {
        // ต้อง Login ด้วย Password ก่อนถึงจะเรียก API นี้ได้
        if (principal == null) {
            return ResponseEntity.status(401).body(Map.of("error", "Unauthorized: Please login with password first"));
        }

        String template = req.get("template");
        if (template == null || template.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Template is required"));
        }

        String username = principal.getName();
        return userRepo.findById(username).map(u -> {
            u.setFingerprintTemplate(template); // บันทึก Template ลงใน User
            userRepo.save(u);                   // Save ลง Database
            return ResponseEntity.ok(Map.of("message", "Fingerprint registered successfully for " + username));
        }).orElse(ResponseEntity.status(404).body(Map.of("error", "User not found")));
    }

    // [NEW] ส่งรายการ User และ Template ให้ Client เพื่อนำไป Identify ที่ Agent
    @GetMapping("/fingerprint-users")
    public ResponseEntity<List<Map<String, String>>> getFingerprintUsers() {
        return ResponseEntity.ok(userRepo.findAll().stream()
            .filter(u -> u.getFingerprintTemplate() != null && !u.getFingerprintTemplate().isBlank())
            .map(u -> Map.of("username", u.getUsername(), "template", u.getFingerprintTemplate()))
            .collect(Collectors.toList()));
    }

    // Login ด้วย Username ที่ผ่านการตรวจสอบจาก Agent — ต้องมี nonce ที่ออกโดย /biometric-challenge
    @PostMapping("/login-biometric-verified")
    public ResponseEntity<?> loginBiometricVerified(@RequestBody Map<String, String> req) {
        String username = req.get("username");
        String nonce = req.get("nonce");
        if (username == null || nonce == null)
            return ResponseEntity.badRequest().body(Map.of("error", "username and nonce required"));

        Long issuedAt = BIOMETRIC_NONCES.remove(nonce); // one-use: ลบทันทีหลังอ่าน
        if (issuedAt == null || System.currentTimeMillis() - issuedAt > NONCE_TTL_MS)
            return ResponseEntity.status(401).body(Map.of("error", "Invalid or expired challenge"));

        return userRepo.findById(username)
                .<ResponseEntity<?>>map(u -> {
                    String token = jwtService.generate(u.getUsername(), Map.of("roles", u.getRoles()));
                    return ResponseEntity.ok(Map.of(
                            "token", token,
                            "user", Map.of("username", u.getUsername(), "roles", u.getRoles())
                    ));
                })
                .orElseGet(() -> ResponseEntity.status(401).body(Map.of("error", "User not found")));
    }

    @PutMapping("/password")
    public ResponseEntity<?> changePassword(@RequestBody PasswordChangeRequest req, Principal principal) {
        if (principal == null) return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        if (req.getNewPassword() == null || req.getNewPassword().length() < 6)
            return ResponseEntity.badRequest().body(Map.of("error", "รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร"));
        if (!req.getNewPassword().equals(req.getConfirmPassword()))
            return ResponseEntity.badRequest().body(Map.of("error", "รหัสผ่านใหม่ไม่ตรงกัน"));
        return userRepo.findById(principal.getName())
                .<ResponseEntity<?>>map(u -> {
                    if (!passwordEncoder.matches(req.getOldPassword(), u.getPasswordHash()))
                        return ResponseEntity.badRequest().body(Map.of("error", "รหัสผ่านเดิมไม่ถูกต้อง"));
                    u.setPasswordHash(passwordEncoder.encode(req.getNewPassword()));
                    userRepo.save(u);
                    return ResponseEntity.ok(Map.of("message", "เปลี่ยนรหัสผ่านสำเร็จ"));
                })
                .orElseGet(() -> ResponseEntity.status(404).body(Map.of("error", "User not found")));
    }

    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(Principal principal) {
        if (principal == null) return ResponseEntity.status(401).body(Map.of("error", "Unauthorized"));
        return userRepo.findById(principal.getName())
                .<ResponseEntity<?>>map(u -> {
                    String token = jwtService.generate(u.getUsername(), Map.of("roles", u.getRoles()));
                    return ResponseEntity.ok(Map.of("token", token));
                })
                .orElseGet(() -> ResponseEntity.status(401).body(Map.of("error", "User not found")));
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(@RequestHeader(value = "Authorization", required = false) String authHeader,
                                Principal principal) {
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            // ในขั้นแรกยังไม่บังคับตรวจ token ที่ filter เพื่อคง compatibility
            String username = principal != null ? principal.getName() : null;
            if (username != null) {
                AppUser u = userRepo.findById(username).orElse(null);
                if (u != null) return ResponseEntity.ok(Map.of("username", u.getUsername(), "roles", u.getRoles()));
            }
        }
        return ResponseEntity.ok(Map.of("anonymous", true));
    }

    @Data
    public static class LoginRequest {
        private String username;
        private String password;
    }

    @Data
    public static class PasswordChangeRequest {
        private String oldPassword;
        private String newPassword;
        private String confirmPassword;
    }
}
