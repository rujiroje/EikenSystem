package com.example.eikensystem.repo;

import com.example.eikensystem.domain.OuterInspection;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface OuterInspectionRepo extends JpaRepository<OuterInspection, Long> {
    Optional<OuterInspection> findByProductCodeAndScaleIdAndLotNoAndOuterBox(
            String productCode, String scaleId, String lotNo, String outerBox);
    List<OuterInspection> findByLotNoOrderByInspectedAtDesc(String lotNo);
}
