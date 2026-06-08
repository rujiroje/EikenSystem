package com.example.eikensystem.domain;

import jakarta.persistence.*;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Entity
@Table(name = "webauthn_credential")
public class WebAuthnCredential {

    /** Base64URL-encoded credential ID จาก authenticator */
    @Id
    private String credentialId;

    /** Username ที่เป็นเจ้าของ credential นี้ */
    private String username;

    /** Public key ในรูปแบบ COSE (Base64URL) */
    @Column(columnDefinition = "TEXT")
    private String publicKeyCose;

    /** Signature counter — ป้องกัน cloned authenticator */
    private long signCount;

    private LocalDateTime createdAt;
}
