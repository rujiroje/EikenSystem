package com.example.eikensystem.domain;

import jakarta.persistence.*;
import lombok.Data;

import java.util.Set;

@Entity
@Table(name = "app_users")
@Data
public class AppUser {
    @Id
    private String username; // ใช้เป็น PK
    @Column(name = "password_hash")
    private String passwordHash;

    @ElementCollection(fetch = FetchType.EAGER)
    @Enumerated(EnumType.STRING)
    @CollectionTable(name = "app_user_roles", joinColumns = @JoinColumn(name = "app_user_username"))
    @Column(name = "role")
    private Set<Role> roles;

    @Column(columnDefinition = "TEXT")
    private String fingerprintTemplate;
}
