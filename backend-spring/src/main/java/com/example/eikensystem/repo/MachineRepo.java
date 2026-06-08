package com.example.eikensystem.repo;

import com.example.eikensystem.domain.Machine;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface MachineRepo extends JpaRepository<Machine, String> {

    @Query("SELECT m FROM Machine m ORDER BY m.sortOrder ASC, m.machineId ASC")
    List<Machine> findAllOrdered();

    @Query("SELECT m FROM Machine m WHERE m.isActive = true ORDER BY m.sortOrder ASC, m.machineId ASC")
    List<Machine> findActiveOrdered();
}
