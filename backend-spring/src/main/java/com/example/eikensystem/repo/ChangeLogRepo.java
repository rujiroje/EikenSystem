package com.example.eikensystem.repo;

import com.example.eikensystem.domain.ChangeLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;

public interface ChangeLogRepo extends JpaRepository<ChangeLog, Long> {
    List<ChangeLog> findByDescriptionContaining(String text);

    // Query by dedicated lotNo field (reliable, indexed column search)
    List<ChangeLog> findByLotNo(String lotNo);

    // Query by lotNo field AND changeType
    List<ChangeLog> findByLotNoAndChangeType(String lotNo, String changeType);

    // Combined: find by lotNo field OR description containing (supports both old and new records)
    @Query("select c from ChangeLog c where c.lotNo = ?1 or c.description like %?2%")
    List<ChangeLog> findByLotNoOrDescriptionContaining(String lotNo, String lotNoInDesc);
}
