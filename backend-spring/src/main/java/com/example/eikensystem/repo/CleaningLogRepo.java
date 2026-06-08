package com.example.eikensystem.repo;

import com.example.eikensystem.domain.CleaningLog;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CleaningLogRepo extends JpaRepository<CleaningLog, Long> {}
