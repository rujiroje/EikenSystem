package com.example.eikensystem.repo;

import com.example.eikensystem.domain.AppUser;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepo extends JpaRepository<AppUser, String> {
}
