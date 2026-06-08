package com.example.eikensystem.service;

import com.example.eikensystem.domain.AppUser;
import com.example.eikensystem.domain.Machine;
import com.example.eikensystem.domain.Product;
import com.example.eikensystem.domain.Role;
import com.example.eikensystem.domain.Scale;
import com.example.eikensystem.repo.MachineRepo;
import com.example.eikensystem.repo.ProductRepo;
import com.example.eikensystem.repo.ScaleRepo;
import com.example.eikensystem.repo.UserRepo;
import lombok.RequiredArgsConstructor;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVParser;
import org.apache.commons.csv.CSVRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.HashSet;

/**
 * รองรับ CSV ทั้ง camelCase และ snake_case header
 * รองรับ header ที่มี newline ฝังอยู่ (Excel multi-line cell)
 * รองรับ column ซ้ำ (ใช้ column แรกที่พบ)
 * รองรับค่า "NULL" → แปลงเป็น null
 */
@Service
@RequiredArgsConstructor
public class AdminImportService {
    private static final Logger log = LoggerFactory.getLogger(AdminImportService.class);
    private final ProductRepo productRepo;
    private final ScaleRepo scaleRepo;
    private final MachineRepo machineRepo;
    private final UserRepo userRepo;
    private final PasswordEncoder passwordEncoder;

    public record ImportResult(int imported, int skipped, List<String> errors) {}

    // Mapping: canonical form (lowercase, no non-alphanumeric) → field name (camelCase)
    private static final Map<String, String> SCALE_CANON = new LinkedHashMap<>();
    static {
        SCALE_CANON.put("scaleid",    "scaleId");
        SCALE_CANON.put("scalename",  "scaleName");
        SCALE_CANON.put("weightunit", "weightUnit");
        SCALE_CANON.put("description","description");
        SCALE_CANON.put("isactive",   "isActive");
    }

    private static final Map<String, String> MACHINE_CANON = new LinkedHashMap<>();
    static {
        MACHINE_CANON.put("machineid",   "machineId");
        MACHINE_CANON.put("machinename", "machineName");
        MACHINE_CANON.put("machinetype", "machineType");
        MACHINE_CANON.put("sortorder",   "sortOrder");
        MACHINE_CANON.put("isactive",    "isActive");
    }

    private static final Map<String, String> USER_CANON = new LinkedHashMap<>();
    static {
        USER_CANON.put("username", "username");
        USER_CANON.put("password", "password");
        USER_CANON.put("roles",    "roles");
    }

    private static final Map<String, String> PRODUCT_CANON = new LinkedHashMap<>();
    static {
        PRODUCT_CANON.put("productcode",             "productCode");
        PRODUCT_CANON.put("productname",             "productName");
        PRODUCT_CANON.put("weightperpiece",          "weightPerPiece");
        PRODUCT_CANON.put("quantitypermeasurement",  "quantityPerMeasurement");
        PRODUCT_CANON.put("tolerance",               "tolerance");
        PRODUCT_CANON.put("innerboxquantity",        "innerBoxQuantity");
        PRODUCT_CANON.put("unit",                    "unit");
        PRODUCT_CANON.put("description",             "description");
        PRODUCT_CANON.put("weighingmode",            "weighingMode");
        PRODUCT_CANON.put("innernumberingmode",      "innerNumberingMode");
        PRODUCT_CANON.put("doubleweighingtolerance", "doubleWeighingTolerance");
        PRODUCT_CANON.put("standardweight1",         "standardWeight1");
        PRODUCT_CANON.put("standardweight2",         "standardWeight2");
        PRODUCT_CANON.put("tolerance1",              "tolerance1");
        PRODUCT_CANON.put("tolerance2",              "tolerance2");
        PRODUCT_CANON.put("cleanertime",             "cleanerTime");
        // Ignored but mapped to avoid confusion (auto-calculated)
        PRODUCT_CANON.put("standardweight",          "_standardWeight");
        PRODUCT_CANON.put("minweight",               "_minWeight");
        PRODUCT_CANON.put("maxweight",               "_maxWeight");
    }

    public ImportResult importProductsCsv(InputStream is) throws IOException {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
             CSVParser csv = CSVFormat.DEFAULT.builder()
                     .setHeader()
                     .setSkipHeaderRecord(true)
                     .setIgnoreHeaderCase(true)
                     .setTrim(true)
                     .setIgnoreEmptyLines(true)
                     .setAllowMissingColumnNames(true)
                     .build()
                     .parse(reader)) {

            Map<String, String> hdr = buildHeaderMap(csv.getHeaderNames(), PRODUCT_CANON);
            log.info("[Import/Products] Headers mapped: {}", hdr.keySet());

            int saved = 0, skipped = 0;
            List<String> errors = new ArrayList<>();

            for (CSVRecord r : csv) {
                String code = null;
                try {
                    code = cell(r, hdr, "productCode");
                    if (code == null || code.isBlank()) { skipped++; continue; }

                    Product p = productRepo.findById(code).orElse(new Product());
                    p.setProductCode(code);

                    // ── fields ที่มี guard: อัปเดตเฉพาะเมื่อ column อยู่ใน CSV และมีค่า ──────
                    String name = cell(r, hdr, "productName");
                    if (name != null) p.setProductName(name);

                    String wpp = cell(r, hdr, "weightPerPiece");
                    if (wpp != null) p.setWeightPerPiece(parseDouble(wpp));

                    String qpm = cell(r, hdr, "quantityPerMeasurement");
                    if (qpm != null) p.setQuantityPerMeasurement(parseInt(qpm));

                    String ibq = cell(r, hdr, "innerBoxQuantity");
                    if (ibq != null) p.setInnerBoxQuantity(parseInt(ibq));

                    String unit = cell(r, hdr, "unit");
                    if (unit != null) p.setUnit(unit);

                    String desc = cell(r, hdr, "description");
                    if (desc != null) p.setDescription(desc);

                    // weighingMode: อัปเดตเฉพาะเมื่อ column อยู่ใน CSV (ป้องกัน force SINGLE ทับ DOUBLE)
                    if (hdr.containsKey("weighingMode")) {
                        String wm = cell(r, hdr, "weighingMode");
                        p.setWeighingMode(wm != null ? wm.toUpperCase() : (p.getWeighingMode() != null ? p.getWeighingMode() : "SINGLE"));
                    } else if (p.getWeighingMode() == null) {
                        p.setWeighingMode("SINGLE");
                    }

                    // innerNumberingMode: อัปเดตเฉพาะเมื่อ column อยู่ใน CSV
                    if (hdr.containsKey("innerNumberingMode")) {
                        p.setInnerNumberingMode(normalizeInnerMode(cell(r, hdr, "innerNumberingMode")));
                    } else if (p.getInnerNumberingMode() == null) {
                        p.setInnerNumberingMode("CONTINUOUS");
                    }

                    // tolerance: อัปเดตจาก CSV ถ้ามี — ไม่ auto-override ที่หลัง
                    if (hdr.containsKey("tolerance")) {
                        String tol = cell(r, hdr, "tolerance");
                        if (tol != null) p.setTolerance(parseDouble(tol));
                    }

                    // nullable DOUBLE-mode fields: อัปเดตเฉพาะเมื่อ column อยู่ใน CSV เพื่อไม่ลบข้อมูลเดิม
                    if (hdr.containsKey("doubleWeighingTolerance"))
                        p.setDoubleWeighingTolerance(parseDoubleNullable(cell(r, hdr, "doubleWeighingTolerance")));
                    if (hdr.containsKey("standardWeight1"))
                        p.setStandardWeight1(parseDoubleNullable(cell(r, hdr, "standardWeight1")));
                    if (hdr.containsKey("standardWeight2"))
                        p.setStandardWeight2(parseDoubleNullable(cell(r, hdr, "standardWeight2")));
                    if (hdr.containsKey("tolerance1"))
                        p.setTolerance1(parseDoubleNullable(cell(r, hdr, "tolerance1")));
                    if (hdr.containsKey("tolerance2"))
                        p.setTolerance2(parseDoubleNullable(cell(r, hdr, "tolerance2")));
                    if (hdr.containsKey("cleanerTime"))
                        p.setCleanerTime(parseIntNullable(cell(r, hdr, "cleanerTime")));

                    // ── auto-calculate derived fields ─────────────────────────────────────────
                    double w   = p.getWeightPerPiece() != null ? p.getWeightPerPiece() : 0.0;
                    int    q   = p.getQuantityPerMeasurement() != null ? p.getQuantityPerMeasurement() : 0;
                    double std = w * q;
                    p.setStandardWeight(std);

                    // tolerance: ถ้ายังไม่มีค่า (record ใหม่ + ไม่ระบุใน CSV) → ใช้ w/4 เป็น default
                    if (p.getTolerance() == null || p.getTolerance() == 0.0) {
                        p.setTolerance(w / 4.0);
                    }
                    double tolVal = p.getTolerance();
                    p.setMinWeight(std - tolVal);
                    p.setMaxWeight(std + tolVal);

                    productRepo.save(p);
                    saved++;
                    log.debug("[Import/Products] Saved: {}", code);
                } catch (Exception e) {
                    String row = code != null ? code : "แถว " + r.getRecordNumber();
                    String msg = rootCause(e);
                    errors.add(row + ": " + msg);
                    log.warn("[Import/Products] Skip {}: {}", row, msg);
                }
            }
            log.info("[Import/Products] Done — saved={} skipped={} errors={}", saved, skipped, errors.size());
            return new ImportResult(saved, skipped, errors);
        }
    }

    public ImportResult importScalesCsv(InputStream is) throws IOException {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
             CSVParser csv = CSVFormat.DEFAULT.builder()
                     .setHeader()
                     .setSkipHeaderRecord(true)
                     .setIgnoreHeaderCase(true)
                     .setTrim(true)
                     .setIgnoreEmptyLines(true)
                     .setAllowMissingColumnNames(true)
                     .build()
                     .parse(reader)) {

            Map<String, String> hdr = buildHeaderMap(csv.getHeaderNames(), SCALE_CANON);
            log.info("[Import/Scales] Headers mapped: {}", hdr.keySet());

            int saved = 0, skipped = 0;
            List<String> errors = new ArrayList<>();
            for (CSVRecord r : csv) {
                String id = null;
                try {
                    id = cell(r, hdr, "scaleId");
                    if (id == null || id.isBlank()) { skipped++; continue; }

                    Scale s = scaleRepo.findById(id).orElse(new Scale());
                    s.setScaleId(id);

                    String name = cell(r, hdr, "scaleName");
                    if (name != null) s.setScaleName(name);

                    if (hdr.containsKey("weightUnit")) {
                        String u = cell(r, hdr, "weightUnit");
                        s.setWeightUnit(u != null && u.equalsIgnoreCase("kg") ? "kg" : "g");
                    }

                    String desc = cell(r, hdr, "description");
                    if (desc != null) s.setDescription(desc);

                    if (hdr.containsKey("isActive")) {
                        String v = cell(r, hdr, "isActive");
                        s.setIsActive(v == null || v.equalsIgnoreCase("true") || v.equals("1"));
                    } else if (s.getIsActive() == null) {
                        s.setIsActive(true);
                    }

                    scaleRepo.save(s);
                    saved++;
                } catch (Exception e) {
                    String row = id != null ? id : "แถว " + r.getRecordNumber();
                    errors.add(row + ": " + rootCause(e));
                }
            }
            log.info("[Import/Scales] Done — saved={} skipped={} errors={}", saved, skipped, errors.size());
            return new ImportResult(saved, skipped, errors);
        }
    }

    public ImportResult importMachinesCsv(InputStream is) throws IOException {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
             CSVParser csv = CSVFormat.DEFAULT.builder()
                     .setHeader()
                     .setSkipHeaderRecord(true)
                     .setIgnoreHeaderCase(true)
                     .setTrim(true)
                     .setIgnoreEmptyLines(true)
                     .setAllowMissingColumnNames(true)
                     .build()
                     .parse(reader)) {

            Map<String, String> hdr = buildHeaderMap(csv.getHeaderNames(), MACHINE_CANON);
            log.info("[Import/Machines] Headers mapped: {}", hdr.keySet());

            int saved = 0, skipped = 0;
            List<String> errors = new ArrayList<>();
            for (CSVRecord r : csv) {
                String id = null;
                try {
                    id = cell(r, hdr, "machineId");
                    if (id == null || id.isBlank()) { skipped++; continue; }

                    Machine m = machineRepo.findById(id).orElse(new Machine());
                    m.setMachineId(id.trim());

                    String name = cell(r, hdr, "machineName");
                    if (name != null && !name.isBlank()) m.setMachineName(name.trim());
                    else if (m.getMachineName() == null) m.setMachineName(id.trim());

                    if (hdr.containsKey("machineType")) {
                        String t = cell(r, hdr, "machineType");
                        m.setMachineType(t != null ? t.trim().toUpperCase() : null);
                    }

                    if (hdr.containsKey("sortOrder"))
                        m.setSortOrder(parseIntNullable(cell(r, hdr, "sortOrder")));
                    if (m.getSortOrder() == null) m.setSortOrder(99);

                    if (hdr.containsKey("isActive")) {
                        String v = cell(r, hdr, "isActive");
                        m.setIsActive(v == null || v.equalsIgnoreCase("true") || v.equals("1"));
                    } else if (m.getIsActive() == null) {
                        m.setIsActive(true);
                    }

                    machineRepo.save(m);
                    saved++;
                } catch (Exception e) {
                    String row = id != null ? id : "แถว " + r.getRecordNumber();
                    errors.add(row + ": " + rootCause(e));
                    log.warn("[Import/Machines] Skip {}: {}", row, rootCause(e));
                }
            }
            log.info("[Import/Machines] Done — saved={} skipped={} errors={}", saved, skipped, errors.size());
            return new ImportResult(saved, skipped, errors);
        }
    }

    public ImportResult importUsersCsv(InputStream is) throws IOException {
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8));
             CSVParser csv = CSVFormat.DEFAULT.builder()
                     .setHeader()
                     .setSkipHeaderRecord(true)
                     .setIgnoreHeaderCase(true)
                     .setTrim(true)
                     .setIgnoreEmptyLines(true)
                     .setAllowMissingColumnNames(true)
                     .build()
                     .parse(reader)) {

            Map<String, String> hdr = buildHeaderMap(csv.getHeaderNames(), USER_CANON);
            log.info("[Import/Users] Headers mapped: {}", hdr.keySet());

            int saved = 0, skipped = 0;
            List<String> errors = new ArrayList<>();
            for (CSVRecord r : csv) {
                String username = null;
                try {
                    username = cell(r, hdr, "username");
                    if (username == null || username.isBlank()) { skipped++; continue; }
                    username = username.trim();

                    String password = cell(r, hdr, "password");
                    String rolesRaw = cell(r, hdr, "roles");

                    AppUser u = userRepo.findById(username).orElse(new AppUser());
                    u.setUsername(username);

                    if (password != null && !password.isBlank()) {
                        u.setPasswordHash(passwordEncoder.encode(password.trim()));
                    } else if (u.getPasswordHash() == null) {
                        errors.add(username + ": ต้องระบุ password สำหรับผู้ใช้ใหม่");
                        skipped++;
                        continue;
                    }

                    Set<Role> roles = parseRoles(rolesRaw);
                    if (!roles.isEmpty()) u.setRoles(roles);
                    else if (u.getRoles() == null || u.getRoles().isEmpty()) u.setRoles(Set.of(Role.OPERATOR));

                    userRepo.save(u);
                    saved++;
                } catch (Exception e) {
                    String row = username != null ? username : "แถว " + r.getRecordNumber();
                    errors.add(row + ": " + rootCause(e));
                    log.warn("[Import/Users] Skip {}: {}", row, rootCause(e));
                }
            }
            log.info("[Import/Users] Done — saved={} skipped={} errors={}", saved, skipped, errors.size());
            return new ImportResult(saved, skipped, errors);
        }
    }

    // ─── helpers ──────────────────────────────────────────────────────────────

    private Set<Role> parseRoles(String rolesRaw) {
        Set<Role> result = new HashSet<>();
        if (rolesRaw == null || rolesRaw.isBlank()) return result;
        // รองรับ | หรือ ; เป็น delimiter (comma ใช้คั่น CSV แล้ว)
        String[] parts = rolesRaw.split("[|;]+");
        for (String p : parts) {
            String r = p.trim().toUpperCase();
            if (r.isBlank()) continue;
            try { result.add(Role.valueOf(r)); } catch (IllegalArgumentException ignored) {
                log.warn("[Import/Users] Unknown role: {}", r);
            }
        }
        return result;
    }

    private Map<String, String> buildHeaderMap(List<String> rawHeaders, Map<String, String> canonMap) {
        Map<String, String> result = new LinkedHashMap<>();
        for (String h : rawHeaders) {
            String canon = canonicalize(h);
            String field = canonMap.getOrDefault(canon, canon);
            result.putIfAbsent(field, h);
        }
        return result;
    }

    private String cell(CSVRecord r, Map<String, String> hdr, String field) {
        String orig = hdr.get(field);
        if (orig == null || !r.isMapped(orig)) return null;
        String v = r.get(orig);
        if (v == null || v.isBlank() || "NULL".equalsIgnoreCase(v)) return null;
        return v;
    }

    private String canonicalize(String h) {
        if (h == null) return "";
        return h.toLowerCase()
                .replaceAll("[\r\n]+", "")
                .replaceAll("[^a-z0-9]", "");
    }

    private String normalizeInnerMode(String v) {
        if (v == null) return "CONTINUOUS";
        String u = v.trim().toUpperCase();
        if (u.equals("CONTINUOUS") || u.equals("RESET_PER_OUTER")) return u;
        return "CONTINUOUS";
    }

    private String rootCause(Throwable t) {
        Throwable cause = t;
        while (cause.getCause() != null) cause = cause.getCause();
        String msg = cause.getMessage();
        return msg != null ? msg.replaceAll("\\s+", " ").trim() : t.getClass().getSimpleName();
    }

    private Double parseDouble(String v) {
        if (v == null || v.isBlank()) return 0.0;
        try { return Double.parseDouble(v); } catch (Exception e) { return 0.0; }
    }

    private Double parseDoubleNullable(String v) {
        if (v == null || v.isBlank()) return null;
        try { return Double.parseDouble(v); } catch (Exception e) { return null; }
    }

    private Integer parseInt(String v) {
        if (v == null || v.isBlank()) return 0;
        try { return Integer.parseInt(v); } catch (Exception e) { return 0; }
    }

    private Integer parseIntNullable(String v) {
        if (v == null || v.isBlank()) return null;
        try { return Integer.parseInt(v.trim()); } catch (Exception e) { return null; }
    }
}
