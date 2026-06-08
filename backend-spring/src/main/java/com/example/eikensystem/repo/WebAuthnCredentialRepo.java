package com.example.eikensystem.repo;

import com.example.eikensystem.domain.WebAuthnCredential;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface WebAuthnCredentialRepo extends JpaRepository<WebAuthnCredential, String> {
    List<WebAuthnCredential> findByUsername(String username);
}
