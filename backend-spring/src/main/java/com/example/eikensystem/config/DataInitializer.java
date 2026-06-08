package com.example.eikensystem.config;

import com.example.eikensystem.domain.Product;
import com.example.eikensystem.domain.AppUser;
import com.example.eikensystem.domain.Role;
import com.example.eikensystem.domain.Scale;
import com.example.eikensystem.repo.UserRepo;
import com.example.eikensystem.repo.ProductRepo;
import com.example.eikensystem.repo.ScaleRepo;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;

@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {
    private final ProductRepo productRepo;
    private final ScaleRepo scaleRepo;
    private final UserRepo userRepo;
    private final org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;
    private final DataSource dataSource;

    @Override
    public void run(String... args) throws Exception {
        // Ensure SQL Server check constraint on app_user_roles.role allows new DATA_ADMIN value (if using SQL Server)
        try { ensureRoleCheckConstraintIncludesDataAdmin(); } catch (Exception ignored) {}

            if (!productRepo.existsById("P001")) {
                Product p = new Product();
                p.setProductCode("P001");
                p.setProductName("Sample Product (SINGLE, CONTINUOUS)");
                p.setWeightPerPiece(10.0);
                p.setQuantityPerMeasurement(5);
                p.setTolerance(1.0);
                p.setInnerBoxQuantity(10);
                double s = p.getWeightPerPiece() * p.getQuantityPerMeasurement();
                p.setStandardWeight(s);
                p.setMinWeight(s - p.getWeightPerPiece() / 2.0);
                p.setMaxWeight(s + p.getWeightPerPiece() / 2.0);
                p.setUnit("g");
                p.setWeighingMode("SINGLE");
                p.setInnerNumberingMode("CONTINUOUS");
                productRepo.save(p);
            }

            // สินค้า P002 สำหรับทดสอบฟีเจอร์ชั่ง 2 ครั้ง และรีเซ็ตเลข Inner ทุกกล่อง Outer
            if (!productRepo.existsById("P002")) {
                Product p = new Product();
                p.setProductCode("P002");
                p.setProductName("Sample Product (DOUBLE, RESET_PER_OUTER)");
                p.setWeightPerPiece(15.0);
                p.setQuantityPerMeasurement(2);
                p.setTolerance(1.5);
                p.setInnerBoxQuantity(5);
                p.setStandardWeight(30.0);
                p.setStandardWeight1(15.0); // ค่าน้ำหนักมาตรฐานครั้งที่ 1
                p.setStandardWeight2(15.0); // ค่าน้ำหนักมาตรฐานครั้งที่ 2
                p.setMinWeight(22.5);
                p.setMaxWeight(37.5);
                p.setUnit("g");
                p.setWeighingMode("DOUBLE");
                p.setInnerNumberingMode("RESET_PER_OUTER");
                productRepo.save(p);
            }
            if (!scaleRepo.existsById("S001")) {
                Scale s = new Scale();
                s.setScaleId("S001");
                s.setScaleName("Main Scale");
                s.setWeightUnit("g");
                s.setIsActive(true);
                scaleRepo.save(s);
            }

            // Seed users
            if (!userRepo.existsById("operator")) {
                AppUser u = new AppUser();
                u.setUsername("operator");
                u.setPasswordHash(passwordEncoder.encode("op123"));
                u.setRoles(java.util.Set.of(Role.OPERATOR));
                userRepo.save(u);
            }
            if (!userRepo.existsById("leader")) {
                AppUser u = new AppUser();
                u.setUsername("leader");
                u.setPasswordHash(passwordEncoder.encode("ld123"));
                u.setRoles(java.util.Set.of(Role.LEADER));
                userRepo.save(u);
            }
            if (!userRepo.existsById("qa")) {
                AppUser u = new AppUser();
                u.setUsername("qa");
                u.setPasswordHash(passwordEncoder.encode("qa123"));
                u.setRoles(java.util.Set.of(Role.QA));
                userRepo.save(u);
            }
            // convenience admin account for data admin testing
            if (!userRepo.existsById("sojvp")) {
                AppUser u = new AppUser();
                u.setUsername("sojvp");
                u.setPasswordHash(passwordEncoder.encode("sojvp"));
                u.setRoles(java.util.Set.of(Role.ADMIN, Role.LEADER, Role.QA, Role.DATA_ADMIN));
                userRepo.save(u);
            } else {
                // ensure sojvp has DATA_ADMIN if it already exists
                userRepo.findById("sojvp").ifPresent(u -> {
                    java.util.Set<Role> rs = new java.util.HashSet<>(u.getRoles());
                    if (!rs.contains(Role.DATA_ADMIN)) {
                        rs.add(Role.DATA_ADMIN);
                        u.setRoles(rs);
                        userRepo.save(u);
                    }
                });
            }

            // dedicated data admin
            if (!userRepo.existsById("dataadmin")) {
                AppUser u = new AppUser();
                u.setUsername("dataadmin");
                u.setPasswordHash(passwordEncoder.encode("da123"));
                u.setRoles(java.util.Set.of(Role.DATA_ADMIN));
                userRepo.save(u);
            }
    }

    /**
     * For existing SQL Server databases created before the DATA_ADMIN role existed, a CHECK constraint
     * on table dbo.app_user_roles(column role) may reject the new value. This routine detects and updates it.
     */
    private void ensureRoleCheckConstraintIncludesDataAdmin() throws Exception {
        try (Connection conn = dataSource.getConnection()) {
            String dbProduct = conn.getMetaData().getDatabaseProductName();
            if (dbProduct == null || !dbProduct.toLowerCase().contains("sql server")) {
                return; // Only applicable to SQL Server
            }
            String sql = """
                    select c.name as constraint_name, c.definition as def
                    from sys.check_constraints c
                    join sys.objects o on c.parent_object_id = o.object_id
                    join sys.columns col on c.parent_object_id = col.object_id and c.parent_column_id = col.column_id
                    where o.name = 'app_user_roles' and col.name = 'role'""";
            String constraintName = null;
            String definition = null;
            try (PreparedStatement ps = conn.prepareStatement(sql); ResultSet rs = ps.executeQuery()) {
                if (rs.next()) {
                    constraintName = rs.getString("constraint_name");
                    definition = rs.getString("def");
                }
            }
            if (definition != null && definition.contains("DATA_ADMIN")) {
                return; // Already allows DATA_ADMIN
            }
            // Drop existing constraint if any
            if (constraintName != null && !constraintName.isBlank()) {
                try (Statement st = conn.createStatement()) {
                    st.execute("ALTER TABLE dbo.app_user_roles DROP CONSTRAINT [" + constraintName + "]");
                }
            }
            // Add new constraint allowing all known roles (keep in sync with Role enum)
            try (Statement st = conn.createStatement()) {
                st.execute("ALTER TABLE dbo.app_user_roles WITH NOCHECK ADD CONSTRAINT CK_app_user_roles_role_allowed " +
                        "CHECK ([role] IN ('OPERATOR','LEADER','QA','ADMIN','DATA_ADMIN'))");
                st.execute("ALTER TABLE dbo.app_user_roles CHECK CONSTRAINT CK_app_user_roles_role_allowed");
            }
        }
    }
}
