package com.example.eikensystem.web;

import com.example.eikensystem.domain.WebAuthnCredential;
import com.example.eikensystem.repo.UserRepo;
import com.example.eikensystem.repo.WebAuthnCredentialRepo;
import com.example.eikensystem.security.JwtService;
import com.yubico.webauthn.*;
import com.yubico.webauthn.data.*;
import com.yubico.webauthn.exception.AssertionFailedException;
import com.yubico.webauthn.exception.RegistrationFailedException;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.yubico.webauthn.data.exception.Base64UrlException;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/auth/webauthn")
@RequiredArgsConstructor
public class WebAuthnController implements CredentialRepository {

    private final WebAuthnCredentialRepo credRepo;
    private final UserRepo userRepo;
    private final JwtService jwtService;

    @Value("${app.webauthn.rp-id:localhost}")
    private String rpId;

    @Value("${app.webauthn.rp-name:Eikensystem}")
    private String rpName;

    @Value("${app.webauthn.origins:http://localhost:5173}")
    private String originsStr;

    private RelyingParty relyingParty;

    private static final ConcurrentHashMap<String, PendingItem<PublicKeyCredentialCreationOptions>> PENDING_REG =
            new ConcurrentHashMap<>();
    private static final ConcurrentHashMap<String, PendingItem<AssertionRequest>> PENDING_AUTH =
            new ConcurrentHashMap<>();

    @PostConstruct
    public void init() {
        Set<String> origins = Arrays.stream(originsStr.split(","))
                .map(String::trim).collect(Collectors.toSet());
        relyingParty = RelyingParty.builder()
                .identity(RelyingPartyIdentity.builder().id(rpId).name(rpName).build())
                .credentialRepository(this)
                .origins(origins)
                .allowOriginPort(true)
                .build();
    }

    // ── CredentialRepository ─────────────────────────────────────────────────

    @Override
    public Set<PublicKeyCredentialDescriptor> getCredentialIdsForUsername(String username) {
        return credRepo.findByUsername(username).stream()
                .map(c -> {
                    try {
                        return PublicKeyCredentialDescriptor.builder()
                                .id(ByteArray.fromBase64Url(c.getCredentialId()))
                                .type(PublicKeyCredentialType.PUBLIC_KEY)
                                .build();
                    } catch (Base64UrlException e) {
                        throw new RuntimeException("Invalid credential ID for user " + username, e);
                    }
                })
                .collect(Collectors.toSet());
    }

    @Override
    public Optional<ByteArray> getUserHandleForUsername(String username) {
        return Optional.of(toUserHandle(username));
    }

    @Override
    public Optional<String> getUsernameForUserHandle(ByteArray userHandle) {
        return Optional.of(new String(userHandle.getBytes(), StandardCharsets.UTF_8));
    }

    @Override
    public Optional<RegisteredCredential> lookup(ByteArray credentialId, ByteArray userHandle) {
        return credRepo.findById(credentialId.getBase64Url())
                .map(c -> toRegistered(c, credentialId));
    }

    @Override
    public Set<RegisteredCredential> lookupAll(ByteArray credentialId) {
        return credRepo.findById(credentialId.getBase64Url())
                .map(c -> Collections.singleton(toRegistered(c, credentialId)))
                .orElseGet(Collections::emptySet);
    }

    // ── Registration ─────────────────────────────────────────────────────────

    /** ขั้นที่ 1: สร้าง options ให้ browser เรียก navigator.credentials.create() */
    @PostMapping("/register/begin")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> registerBegin(Principal principal) throws Exception {
        cleanPending();
        String username = principal.getName();
        PublicKeyCredentialCreationOptions pkcco = relyingParty.startRegistration(
                StartRegistrationOptions.builder()
                        .user(UserIdentity.builder()
                                .name(username)
                                .displayName(username)
                                .id(toUserHandle(username))
                                .build())
                        .authenticatorSelection(AuthenticatorSelectionCriteria.builder()
                                .residentKey(ResidentKeyRequirement.REQUIRED)
                                .userVerification(UserVerificationRequirement.REQUIRED)
                                .build())
                        .build());
        String reqId = UUID.randomUUID().toString();
        PENDING_REG.put(reqId, new PendingItem<>(pkcco));
        return ResponseEntity.ok(Map.of("requestId", reqId, "options", pkcco.toJson()));
    }

    /** ขั้นที่ 2: ตรวจสอบและบันทึก credential ที่ browser ส่งกลับมา */
    @PostMapping("/register/finish")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> registerFinish(@RequestBody Map<String, String> req, Principal principal) {
        PendingItem<PublicKeyCredentialCreationOptions> pending = PENDING_REG.remove(req.get("requestId"));
        if (pending == null || pending.isExpired())
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid or expired request"));
        try {
            PublicKeyCredential<AuthenticatorAttestationResponse, ClientRegistrationExtensionOutputs> pkc =
                    PublicKeyCredential.parseRegistrationResponseJson(req.get("credential"));
            RegistrationResult result = relyingParty.finishRegistration(
                    FinishRegistrationOptions.builder().request(pending.value).response(pkc).build());

            // ลบ credential เก่าของ user นี้ก่อน (อนุญาต 1 device ต่อ user สำหรับความง่าย)
            credRepo.findByUsername(principal.getName()).forEach(credRepo::delete);

            WebAuthnCredential cred = new WebAuthnCredential();
            cred.setCredentialId(result.getKeyId().getId().getBase64Url());
            cred.setUsername(principal.getName());
            cred.setPublicKeyCose(result.getPublicKeyCose().getBase64Url());
            cred.setSignCount(result.getSignatureCount());
            cred.setCreatedAt(LocalDateTime.now());
            credRepo.save(cred);
            return ResponseEntity.ok(Map.of("ok", true));
        } catch (RegistrationFailedException | IOException e) {
            return ResponseEntity.badRequest().body(Map.of("error", e.getMessage()));
        }
    }

    // ── Authentication ───────────────────────────────────────────────────────

    /** ขั้นที่ 1: สร้าง challenge ให้ browser เรียก navigator.credentials.get() */
    @PostMapping("/login/begin")
    public ResponseEntity<?> loginBegin(@RequestBody(required = false) Map<String, String> req) throws Exception {
        cleanPending();
        StartAssertionOptions.StartAssertionOptionsBuilder builder = StartAssertionOptions.builder()
                .userVerification(UserVerificationRequirement.REQUIRED);
        // ถ้าส่ง username มา จะจำกัด credentials ให้เฉพาะ user นั้น
        String username = req != null ? req.get("username") : null;
        if (username != null && !username.isBlank()) builder.username(username);

        AssertionRequest ar = relyingParty.startAssertion(builder.build());
        String reqId = UUID.randomUUID().toString();
        PENDING_AUTH.put(reqId, new PendingItem<>(ar));
        String optionsJson = new ObjectMapper().writeValueAsString(ar.getPublicKeyCredentialRequestOptions());
        return ResponseEntity.ok(Map.of(
                "requestId", reqId,
                "options", optionsJson));
    }

    /** ขั้นที่ 2: ตรวจสอบ assertion และออก JWT */
    @PostMapping("/login/finish")
    public ResponseEntity<?> loginFinish(@RequestBody Map<String, String> req) {
        PendingItem<AssertionRequest> pending = PENDING_AUTH.remove(req.get("requestId"));
        if (pending == null || pending.isExpired())
            return ResponseEntity.status(401).body(Map.of("error", "Invalid or expired request"));
        try {
            PublicKeyCredential<AuthenticatorAssertionResponse, ClientAssertionExtensionOutputs> pkc =
                    PublicKeyCredential.parseAssertionResponseJson(req.get("credential"));
            AssertionResult result = relyingParty.finishAssertion(
                    FinishAssertionOptions.builder().request(pending.value).response(pkc).build());

            if (!result.isSuccess())
                return ResponseEntity.status(401).body(Map.of("error", "Authentication failed"));

            String username = result.getUsername();

            // อัปเดต signCount เพื่อป้องกัน cloned authenticator
            credRepo.findById(result.getCredential().getCredentialId().getBase64Url()).ifPresent(c -> {
                c.setSignCount(result.getSignatureCount());
                credRepo.save(c);
            });

            return userRepo.findById(username)
                    .<ResponseEntity<?>>map(u -> {
                        String token = jwtService.generate(u.getUsername(), Map.of("roles", u.getRoles()));
                        return ResponseEntity.ok(Map.of(
                                "token", token,
                                "user", Map.of("username", u.getUsername(), "roles", u.getRoles())));
                    })
                    .orElseGet(() -> ResponseEntity.status(401).body(Map.of("error", "User not found")));
        } catch (AssertionFailedException | IOException e) {
            return ResponseEntity.status(401).body(Map.of("error", e.getMessage()));
        }
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private ByteArray toUserHandle(String username) {
        return new ByteArray(username.getBytes(StandardCharsets.UTF_8));
    }

    private RegisteredCredential toRegistered(WebAuthnCredential c, ByteArray credentialId) {
        try {
            return RegisteredCredential.builder()
                    .credentialId(credentialId)
                    .userHandle(toUserHandle(c.getUsername()))
                    .publicKeyCose(ByteArray.fromBase64Url(c.getPublicKeyCose()))
                    .signatureCount(c.getSignCount())
                    .build();
        } catch (Base64UrlException e) {
            throw new RuntimeException("Invalid COSE key for credential of user " + c.getUsername(), e);
        }
    }

    private void cleanPending() {
        PENDING_REG.entrySet().removeIf(e -> e.getValue().isExpired());
        PENDING_AUTH.entrySet().removeIf(e -> e.getValue().isExpired());
    }

    private static class PendingItem<T> {
        final T value;
        final long createdAt;
        static final long TTL_MS = 120_000L; // 2 นาที

        PendingItem(T value) { this.value = value; this.createdAt = System.currentTimeMillis(); }
        boolean isExpired() { return System.currentTimeMillis() - createdAt > TTL_MS; }
    }
}
