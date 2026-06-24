package com.example.eikensystem.repo;

import com.example.eikensystem.domain.SortingReason;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SortingReasonRepo extends JpaRepository<SortingReason, Long> {
    List<SortingReason> findByIsActiveTrueOrderBySortOrderAsc();
    List<SortingReason> findByIsActiveTrueAndScopeInOrderBySortOrderAsc(List<String> scopes);
    boolean existsByCode(String code);
}
