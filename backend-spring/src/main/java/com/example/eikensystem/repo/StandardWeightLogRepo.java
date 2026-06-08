package com.example.eikensystem.repo;

import com.example.eikensystem.domain.StandardWeightLog;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface StandardWeightLogRepo extends JpaRepository<StandardWeightLog, Long> {
    List<StandardWeightLog> findByProductCodeOrderByApprovedAtDesc(String productCode);

    // Fetch only logs belonging to specific approvals — avoids findAll() in ReportController
    List<StandardWeightLog> findByApprovalIdIn(List<Long> approvalIds);
}
